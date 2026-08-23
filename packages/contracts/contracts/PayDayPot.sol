// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import {FHE, ebool, euint64, externalEuint64} from "@fhevm/solidity/lib/FHE.sol";
import {ZamaEthereumConfig} from "@fhevm/solidity/config/ZamaConfig.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Ownable2Step} from "@openzeppelin/contracts/access/Ownable2Step.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {IERC7984} from "@openzeppelin/confidential-contracts/interfaces/IERC7984.sol";
import {IERC7984Receiver} from "@openzeppelin/confidential-contracts/interfaces/IERC7984Receiver.sol";

/// @title PayDayPot — confidential prize-savings pool (PoolTogether-style) on Zama FHEVM
/// @notice Users deposit a confidential ERC-7984 token; principal is always
///         withdrawable in full (no-loss). Amounts, balances and TWAB live as
///         encrypted euint64 handles — only the owner of a balance can decrypt it.
/// @dev    Non-upgradeable by design. There is intentionally NO function that
///         moves user principal other than the deposit callback and the two
///         withdraw functions — "no admin sweep" holds by construction.
///
///         Deposit flow (decided Day 1, see COMPATIBILITY_NOTES §3):
///         user calls token.confidentialTransferAndCall(pot, …) → token moves the
///         ACTUAL transferred amount (token-side clamp: insufficient wallet balance
///         becomes encrypted zero, never a revert) → token invokes
///         onConfidentialTransferReceived on this contract with that actual amount
///         → we return an encrypted verdict; `false` makes the token refund the
///         whole transfer atomically (all-or-nothing, no plaintext leak).
contract PayDayPot is IERC7984Receiver, ZamaEthereumConfig, Ownable2Step, Pausable, ReentrancyGuard {
    // ---------------------------------------------------------------------
    // Types
    // ---------------------------------------------------------------------

    enum EpochPhase {
        Open, // deposits + withdrawals + TWAB accrual
        Snapshotting, // Day 3-4: freezing weights batch-by-batch
        Drawing, // Day 4: randomness + winner selection
        Settled // Day 5: prize claimable
    }

    struct Account {
        euint64 principal; // encrypted current deposit balance
        euint64 twabArea; // encrypted Σ principal·dt, accrued in _checkpoint (Day 3)
        uint64 lastCheckpoint; // plaintext timestamp of last accrual, clamped to epoch end
        euint64 pendingPrize; // Day 5: encrypted claimable winnings
        bool registered;
    }

    struct Epoch {
        uint64 start;
        uint64 end;
        EpochPhase phase;
        // Day 3-5 fields (reserved so the storage layout is final today):
        euint64 totalWeight; // Σ frozen twabArea over all participants
        euint64 random; // drawn exactly once per epoch, never rerolled
        uint32 snapshotCursor; // batch continuation cursor (permissionless)
        bool drawn;
    }

    // ---------------------------------------------------------------------
    // Immutable configuration
    // ---------------------------------------------------------------------

    /// @notice The confidential ERC-7984 token this pool accepts.
    IERC7984 public immutable TOKEN;
    /// @notice Sponsor address funding the prize (no ACL over any user data).
    address public immutable EMPLOYER;
    /// @notice Epoch length in seconds (≤ 30 days, enforced by P-3 budget).
    uint64 public immutable EPOCH_DURATION;
    /// @notice Max principal per user (encrypted cap-check on every deposit).
    uint64 public immutable PER_USER_CAP;
    /// @notice Max participants per pool (≤ 32; keeps snapshot batches bounded).
    uint32 public immutable PARTICIPANT_CAP;

    // ---------------------------------------------------------------------
    // State
    // ---------------------------------------------------------------------

    uint256 public currentEpochId;
    mapping(uint256 epochId => Epoch) private _epochs;
    mapping(address user => Account) private _accounts;
    address[] private _participants;

    /// @dev Contract-only ACL — never allowed to any user, employer or owner,
    ///      never made publicly decryptable. Inspected in tests via the
    ///      mock-only debugger, and provable indirectly through conservation.
    euint64 private _totalPrincipal;

    // ---------------------------------------------------------------------
    // Events — action/user/epoch only. NEVER an amount, encrypted or not.
    // ---------------------------------------------------------------------

    event EpochStarted(uint256 indexed epochId, uint64 start, uint64 end);
    event Registered(address indexed user, uint256 indexed epochId);
    /// @dev Emitted on every deposit ATTEMPT — the encrypted cap verdict cannot
    ///      be branched on, so a refunded (over-cap) deposit also emits this.
    event Deposited(address indexed user, uint256 indexed epochId);
    event Withdrawn(address indexed user, uint256 indexed epochId);

    // ---------------------------------------------------------------------
    // Errors — no amount parameters, plaintext-safe conditions only.
    // ---------------------------------------------------------------------

    error NotToken(address caller);
    error PoolFull();
    error NotRegistered(address user);
    error WrongPhase();
    error InvalidConfig();
    error ZeroAddress();

    // ---------------------------------------------------------------------
    // Constructor
    // ---------------------------------------------------------------------

    constructor(
        IERC7984 token_,
        address employer_,
        uint64 epochDuration_,
        uint64 perUserCap_,
        uint32 participantCap_
    ) Ownable(msg.sender) {
        if (address(token_) == address(0) || employer_ == address(0)) revert ZeroAddress();
        if (epochDuration_ == 0 || epochDuration_ > 30 days) revert InvalidConfig();
        if (perUserCap_ == 0) revert InvalidConfig();
        if (participantCap_ == 0 || participantCap_ > 32) revert InvalidConfig();
        // P-3 overflow budget: worst-case Σ twabArea = cap·users·duration must
        // stay below 2^64 because FHE arithmetic wraps instead of reverting.
        if (uint256(participantCap_) * uint256(perUserCap_) * uint256(epochDuration_) >= type(uint64).max) {
            revert InvalidConfig();
        }

        TOKEN = token_;
        EMPLOYER = employer_;
        EPOCH_DURATION = epochDuration_;
        PER_USER_CAP = perUserCap_;
        PARTICIPANT_CAP = participantCap_;

        // No FHE ops in the constructor: they revert under plain `hardhat deploy`
        // (mock coprocessor only initializes inside the test runner, quirk #6).
        // _totalPrincipal is lazily zero-initialized on first use instead.
        currentEpochId = 1;
        Epoch storage ep = _epochs[1];
        ep.start = uint64(block.timestamp);
        ep.end = uint64(block.timestamp) + epochDuration_;
        ep.phase = EpochPhase.Open;
        emit EpochStarted(1, ep.start, ep.end);
    }

    // ---------------------------------------------------------------------
    // Deposit — ERC-7984 transfer-and-call callback
    // ---------------------------------------------------------------------

    /// @notice Called by TOKEN after it moved `amount` (the ACTUAL encrypted
    ///         amount transferred, post token-side wallet clamp) to this pool.
    /// @dev    Returns an encrypted verdict: `false` ⇒ the token refunds the
    ///         entire transfer atomically. All-or-nothing — no partial fill,
    ///         so no amount bit ever leaks through control flow (R2).
    ///         `operator` and `data` are ignored: credit always goes to `from`.
    function onConfidentialTransferReceived(
        address, /* operator */
        address from,
        euint64 amount,
        bytes calldata /* data */
    ) external nonReentrant whenNotPaused returns (ebool) {
        if (msg.sender != address(TOKEN)) revert NotToken(msg.sender);
        if (_epochs[currentEpochId].phase != EpochPhase.Open) revert WrongPhase();

        Account storage acc = _accounts[from];

        // Plaintext-gated registration (P-4 revised, user-approved): the gate
        // uses only public facts (caller is the token, pool not full). A deposit
        // later refunded by the encrypted cap check still occupies a slot —
        // documented in KNOWN_LIMITATIONS.md.
        if (!acc.registered) {
            if (_participants.length >= PARTICIPANT_CAP) revert PoolFull();
            acc.registered = true;
            acc.principal = FHE.asEuint64(0);
            FHE.allowThis(acc.principal);
            FHE.allow(acc.principal, from);
            _participants.push(from);
            emit Registered(from, currentEpochId);
        }

        _checkpoint(from);

        // Lazy zero-init (uninitialized handle ≠ encrypted zero, CompatSpike pattern).
        if (!FHE.isInitialized(_totalPrincipal)) {
            _totalPrincipal = FHE.asEuint64(0);
        }

        // Wrap-safe cap check via headroom. Invariant principal ≤ cap holds
        // after every mutation, so the subtraction can never underflow.
        // (Deliberately NOT FHESafeMath.tryAdd: its overflow branch returns
        // sum=0, which a le(sum, cap) comparison would wrongly accept.)
        euint64 headroom = FHE.sub(FHE.asEuint64(PER_USER_CAP), acc.principal);
        ebool ok = FHE.le(amount, headroom);
        euint64 credited = FHE.select(ok, amount, FHE.asEuint64(0));

        acc.principal = FHE.add(acc.principal, credited);
        FHE.allowThis(acc.principal);
        FHE.allow(acc.principal, from);

        _totalPrincipal = FHE.add(_totalPrincipal, credited);
        FHE.allowThis(_totalPrincipal);

        emit Deposited(from, currentEpochId);

        // The token verifies FHE.isAllowed(retval, pot) and then runs
        // FHE.select(retval, …) itself — it needs BOTH grants (quirk: dual ACL).
        FHE.allowThis(ok);
        FHE.allowTransient(ok, msg.sender);
        return ok;
    }

    // ---------------------------------------------------------------------
    // Withdraw — NEVER gated by pause or phase (non-negotiable #1)
    // ---------------------------------------------------------------------

    /// @notice Withdraw up to `encryptedAmount`; requests above the balance are
    ///         clamped to the full balance (no revert — a revert would leak a
    ///         comparison between two confidential values).
    function withdraw(externalEuint64 encryptedAmount, bytes calldata inputProof) external nonReentrant {
        Account storage acc = _accounts[msg.sender];
        if (!acc.registered) revert NotRegistered(msg.sender);

        euint64 requested = FHE.fromExternal(encryptedAmount, inputProof);
        euint64 actual = FHE.min(requested, acc.principal);
        _debitAndTransfer(acc, actual);
    }

    /// @notice Withdraw the entire principal. Available in EVERY phase, even
    ///         while paused. Idempotent — a second call transfers encrypted zero.
    function withdrawAll() external nonReentrant {
        Account storage acc = _accounts[msg.sender];
        if (!acc.registered) revert NotRegistered(msg.sender);

        _debitAndTransfer(acc, acc.principal);
    }

    /// @dev Checks-effects-interactions: principal and total are debited before
    ///      the external transfer. The transfer's return value is deliberately
    ///      ignored: the invariant tokenBalance(pot) ≥ totalPrincipal ≥
    ///      principal ≥ actual guarantees the token-side clamp never fires
    ///      (proven by the conservation property test).
    ///      _totalPrincipal is always initialized here: `registered` implies at
    ///      least one completed deposit callback, which lazily initializes it.
    function _debitAndTransfer(Account storage acc, euint64 actual) private {
        _checkpoint(msg.sender);

        acc.principal = FHE.sub(acc.principal, actual);
        FHE.allowThis(acc.principal);
        FHE.allow(acc.principal, msg.sender);

        _totalPrincipal = FHE.sub(_totalPrincipal, actual);
        FHE.allowThis(_totalPrincipal);

        FHE.allowThis(actual);
        FHE.allow(actual, msg.sender);
        FHE.allowTransient(actual, address(TOKEN));
        TOKEN.confidentialTransfer(msg.sender, actual);

        emit Withdrawn(msg.sender, currentEpochId);
    }

    // ---------------------------------------------------------------------
    // TWAB checkpoint — weight = encrypted balance × public time (Day 3).
    // ---------------------------------------------------------------------

    /// @dev Called before EVERY principal mutation, so the accrued area always
    ///      reflects the balance as it stood during the elapsed interval:
    ///      twabArea += principal × (min(now, epochEnd) − lastCheckpoint).
    ///
    ///      P-1: the area is NEVER divided by epochDuration onchain — the
    ///      Day 4 multiply-high draw is scale-invariant, so the raw area IS
    ///      the weight; the displayed average is client-side after decrypt.
    ///      P-3: participantCap·perUserCap·epochDuration < 2^64 (constructor)
    ///      guarantees the euint64 accrual can never wrap.
    ///
    ///      The short-circuits branch ONLY on public plaintext (timestamps —
    ///      lastCheckpointOf is already a public view), never on encrypted
    ///      state. A never-stamped account (last == 0) holds a provably zero
    ///      principal — registration stamps before the first credit — so
    ///      skipping the mul there changes nothing and saves ~544k HCU.
    ///
    ///      twabArea/lastCheckpoint are scoped to the CURRENT epoch: Day 5's
    ///      startNewEpoch must reset both for every participant.
    function _checkpoint(address user) private {
        uint64 epochEnd = _epochs[currentEpochId].end;
        uint64 nowClamped = uint64(block.timestamp) < epochEnd ? uint64(block.timestamp) : epochEnd;
        Account storage acc = _accounts[user];
        uint64 last = acc.lastCheckpoint;

        if (last == 0 || nowClamped <= last) {
            acc.lastCheckpoint = nowClamped;
            return;
        }

        uint64 elapsed = nowClamped - last; // public plaintext

        euint64 area = acc.twabArea;
        if (!FHE.isInitialized(area)) {
            area = FHE.asEuint64(0); // lazy-init: uninitialized handle ≠ encrypted zero
        }
        area = FHE.add(area, FHE.mul(acc.principal, elapsed)); // scalar mul — no FHE.div anywhere
        acc.twabArea = area;
        FHE.allowThis(area);
        FHE.allow(area, user); // user only — employer/keeper/owner get no ACL

        acc.lastCheckpoint = nowClamped;
    }

    // ---------------------------------------------------------------------
    // Pause — deposits only. Withdrawals are never pausable.
    // ---------------------------------------------------------------------

    function pause() external onlyOwner {
        _pause();
    }

    function unpause() external onlyOwner {
        _unpause();
    }

    // ---------------------------------------------------------------------
    // Views
    // ---------------------------------------------------------------------

    /// @notice Encrypted principal handle for `user` — decryptable only by the
    ///         user themself (and the contract). Everyone else gets ACL-denied.
    function principalOf(address user) external view returns (euint64) {
        return _accounts[user].principal;
    }

    /// @notice Encrypted global principal accumulator. Handle is public info;
    ///         NO ONE holds user-level ACL on it (contract-only).
    /// @dev    Returns the zero handle (uninitialized) until the first deposit —
    ///         UIs must render that as "unavailable", never as the number 0.
    function totalPrincipal() external view returns (euint64) {
        return _totalPrincipal;
    }

    /// @notice Encrypted TWAB area for `user` this epoch (Σ principal·dt) —
    ///         decryptable only by the user themself. The raw area IS the draw
    ///         weight (P-1); average = area / EPOCH_DURATION, client-side.
    /// @dev    Returns the zero handle (uninitialized) until the first accrual —
    ///         UIs must render that as "unavailable", never as the number 0.
    function twabAreaOf(address user) external view returns (euint64) {
        return _accounts[user].twabArea;
    }

    function isRegistered(address user) external view returns (bool) {
        return _accounts[user].registered;
    }

    function lastCheckpointOf(address user) external view returns (uint64) {
        return _accounts[user].lastCheckpoint;
    }

    function participantCount() external view returns (uint256) {
        return _participants.length;
    }

    function participantAt(uint256 index) external view returns (address) {
        return _participants[index];
    }

    function epochInfo(uint256 epochId) external view returns (uint64 start, uint64 end, EpochPhase phase) {
        Epoch storage ep = _epochs[epochId];
        return (ep.start, ep.end, ep.phase);
    }
}
