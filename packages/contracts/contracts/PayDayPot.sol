// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import {FHE, ebool, euint64, euint128, externalEuint64} from "@fhevm/solidity/lib/FHE.sol";
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
        euint64 pendingPrize; // encrypted winnings, credited in selectBatch (claim: Day 5)
        ebool won; // encrypted winner flag — contract-only ACL, never user-readable (§15.1)
        bool registered;
    }

    struct Epoch {
        uint64 start;
        uint64 end;
        EpochPhase phase;
        // Day 5 (claim/settle) is the last consumer; the ABI freezes then.
        euint64 totalWeight; // Σ frozen twabArea over all participants
        euint64 random; // drawn exactly once per epoch, never rerolled
        euint64 ticket; // winning ticket = ⌊random·totalWeight/2^64⌋ (P-2), fixed with random
        euint64 cumulative; // running weight sum carried across selectBatch txs
        ebool selectedAny; // encrypted "the winner has been crossed" latch
        uint32 snapshotCursor; // snapshot batch continuation cursor (permissionless)
        uint32 selectCursor; // selection batch cursor — deliberately separate (§6.5)
        bool drawn;
        uint64 prizeAmount; // public sponsored prize (P-4); set on Day 5, IMMUTABLE once drawn
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
    /// @dev Snapshot events carry only public counters (participant slots,
    ///      cursor position) — weights stay encrypted end-to-end.
    event SnapshotStarted(uint256 indexed epochId, uint32 participantCount);
    event SnapshotProgress(uint256 indexed epochId, uint32 cursor);
    event SnapshotCompleted(uint256 indexed epochId);
    event Registered(address indexed user, uint256 indexed epochId);
    /// @dev Emitted on every deposit ATTEMPT — the encrypted cap verdict cannot
    ///      be branched on, so a refunded (over-cap) deposit also emits this.
    event Deposited(address indexed user, uint256 indexed epochId);
    event Withdrawn(address indexed user, uint256 indexed epochId);
    /// @dev Draw events carry only public counters — never the randomness, the
    ///      ticket, an amount, or (crucially) the winner's address.
    event RandomRequested(uint256 indexed epochId);
    event SelectProgress(uint256 indexed epochId, uint32 cursor);
    event DrawCompleted(uint256 indexed epochId);

    // ---------------------------------------------------------------------
    // Errors — no amount parameters, plaintext-safe conditions only.
    // ---------------------------------------------------------------------

    error NotToken(address caller);
    error PoolFull();
    error NotRegistered(address user);
    error WrongPhase();
    error InvalidConfig();
    error ZeroAddress();
    error AlreadyDrawn();
    error NotDrawn();
    error SelectionComplete();

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
        // Deposits close at epochEnd even while the phase is still Open —
        // beginSnapshot may lag, and the participant list/order/count must be
        // immutable from the freeze point onward (Day 3).
        Epoch storage ep = _epochs[currentEpochId];
        if (ep.phase != EpochPhase.Open || block.timestamp >= ep.end) revert WrongPhase();

        Account storage acc = _accounts[from];
        _registerIfNeeded(acc, from);
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

    /// @dev Plaintext-gated registration (P-4 revised, user-approved): the gate
    ///      uses only public facts (caller is the token, pool not full). A
    ///      deposit later refunded by the encrypted cap check still occupies a
    ///      slot — documented in KNOWN_LIMITATIONS.md.
    function _registerIfNeeded(Account storage acc, address from) private {
        if (acc.registered) return;
        if (_participants.length >= PARTICIPANT_CAP) revert PoolFull();
        acc.registered = true;
        acc.principal = FHE.asEuint64(0);
        FHE.allowThis(acc.principal);
        FHE.allow(acc.principal, from);
        _participants.push(from);
        emit Registered(from, currentEpochId);
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
    // Snapshot — freeze weights at epochEnd, batch by cursor (Day 3).
    // Both functions are PERMISSIONLESS and never pausable: the snapshot is
    // deterministic bookkeeping of an already-finished epoch, and gating it
    // on the owner would add a liveness dependency to epoch resolution (R4).
    // The one-shot "new draw" step that pause DOES block is Day 4's random
    // request — never this.
    // ---------------------------------------------------------------------

    /// @notice Move the current epoch from Open to Snapshotting once its end
    ///         has passed. Anyone may call — a keeper is a convenience, never
    ///         a privilege (rule #7).
    /// @dev    With zero participants the snapshot completes in the same tx
    ///         and the epoch lands in Drawing with an encrypted-zero total —
    ///         no decrypt needed to detect emptiness.
    function beginSnapshot() external {
        Epoch storage ep = _epochs[currentEpochId];
        if (ep.phase != EpochPhase.Open || block.timestamp < ep.end) revert WrongPhase();

        // Lazy FHE init — never in the constructor (quirk #13).
        ep.totalWeight = FHE.asEuint64(0);
        FHE.allowThis(ep.totalWeight);
        ep.phase = EpochPhase.Snapshotting;
        ep.snapshotCursor = 0;
        emit SnapshotStarted(currentEpochId, uint32(_participants.length));

        if (_participants.length == 0) {
            ep.phase = EpochPhase.Drawing;
            emit SnapshotCompleted(currentEpochId);
        }
    }

    /// @notice Freeze up to `maxSteps` participants' weights at epochEnd and
    ///         fold them into the epoch's encrypted total. Permissionless —
    ///         any wallet can continue from the stored cursor (R4); a request
    ///         past the end of the list is clamped, and the tx that processes
    ///         the last participant flips the epoch to Drawing.
    /// @dev    A participant's frozen weight is their raw twabArea after
    ///         _checkpoint clamps accrual to epochEnd (P-1: no division —
    ///         the multiply-high draw is scale-invariant). Participants who
    ///         already checkpointed at epochEnd (e.g. withdrew after the
    ///         cutoff) hit the zero-elapsed short-circuit: their frozen
    ///         weight is untouched, only the total-add runs.
    function snapshotBatch(uint32 maxSteps) external {
        if (maxSteps == 0) revert InvalidConfig();
        Epoch storage ep = _epochs[currentEpochId];
        if (ep.phase != EpochPhase.Snapshotting) revert WrongPhase();

        uint32 cursor = ep.snapshotCursor;
        uint32 count = uint32(_participants.length);
        uint256 want = uint256(cursor) + uint256(maxSteps); // no uint32 overflow
        uint32 stop = want > count ? count : uint32(want);

        euint64 total = ep.totalWeight;
        for (uint32 i = cursor; i < stop; ++i) {
            address user = _participants[i];
            _checkpoint(user); // now ≥ end ⇒ clamps to end: freezes twabArea
            total = FHE.add(total, _accounts[user].twabArea);
        }
        ep.totalWeight = total;
        FHE.allowThis(total); // contract-only ACL, same policy as _totalPrincipal
        ep.snapshotCursor = stop;
        emit SnapshotProgress(currentEpochId, stop);

        if (stop == count) {
            // Cursor deliberately stays == count — snapshotProgress keeps its
            // "x/32 frozen" meaning; the draw scan uses its own selectCursor (§6.5).
            ep.phase = EpochPhase.Drawing;
            emit SnapshotCompleted(currentEpochId);
        }
    }

    // ---------------------------------------------------------------------
    // Draw — one-shot randomness + weighted winner selection (Day 4).
    // requestRandom is the ONLY pausable step besides deposits: pause stops
    // NEW draws from starting but never an in-flight one — selectBatch, like
    // the snapshot, is deterministic bookkeeping and stays permissionless.
    // ---------------------------------------------------------------------

    /// @notice Lock the epoch's randomness — exactly once, never rerolled (R5).
    ///         Anyone may call; the function takes NO parameters, so a keeper
    ///         can trigger the draw but can never supply a seed, a weight or a
    ///         winner (rule #7 holds at the signature level).
    /// @dev    The winning ticket is fixed in the SAME tx (P-2 multiply-high):
    ///             ticket = ⌊random · totalWeight / 2^64⌋,  random < 2^64
    ///         so ticket < totalWeight whenever totalWeight > 0 and the scan is
    ///         guaranteed to cross it. No FHE.div/rem anywhere: the euint128
    ///         product cannot wrap (both factors < 2^64) and the downcast after
    ///         shr(64) is exact (quotient < totalWeight < 2^64).
    ///         totalWeight is always initialized here — beginSnapshot is the
    ///         only path into Drawing and it writes enc(0) even for an empty pool.
    function requestRandom() external whenNotPaused {
        Epoch storage ep = _epochs[currentEpochId];
        if (ep.phase != EpochPhase.Drawing) revert WrongPhase();
        if (ep.drawn) revert AlreadyDrawn();

        euint64 rnd = FHE.randEuint64(); // state-changing tx only (FHE rule)
        euint128 product = FHE.mul(FHE.asEuint128(rnd), FHE.asEuint128(ep.totalWeight));
        euint64 ticket = FHE.asEuint64(FHE.shr(product, 64));

        ep.random = rnd;
        ep.ticket = ticket;
        ep.cumulative = FHE.asEuint64(0);
        ep.selectedAny = FHE.asEbool(false);
        ep.selectCursor = 0;
        ep.drawn = true;

        // Contract-only ACL on the whole draw state — no user, keeper,
        // employer or owner ever decrypts the randomness or the ticket.
        FHE.allowThis(rnd);
        FHE.allowThis(ticket);
        FHE.allowThis(ep.cumulative);
        FHE.allowThis(ep.selectedAny);

        emit RandomRequested(currentEpochId);

        if (_participants.length == 0) {
            // Nothing to scan — the draw completes in the same tx (mirrors
            // beginSnapshot's empty-pool fast path); selectBatch stays
            // consistently unusable through its cursor gate.
            emit DrawCompleted(currentEpochId);
        }
    }

    /// @notice Scan up to `maxSteps` participants of the drawn epoch, crediting
    ///         the prize to the (single) winner under encryption. Permissionless
    ///         and resumable from the stored cursor by any wallet (R4).
    /// @dev    Cumulative-crossing scan (DRAW_PROTOCOL §6.3): the winner is the
    ///         first participant whose running weight sum strictly exceeds the
    ///         ticket. `selectedAny` gates any later crossing out, so at most
    ///         one `hit` is ever true; ticket < totalWeight (P-2) guarantees at
    ///         least one when the total is positive. An all-zero-weight epoch
    ///         (totalWeight == 0 ⇒ ticket == 0) never crosses — no winner, and
    ///         the prize stays with the epoch (§6.4 rollover, resolved Day 5).
    ///         Every participant gets the IDENTICAL op sequence — no branch on
    ///         encrypted values, no encrypted indexing — so the tx shape
    ///         reveals nothing about who won.
    ///         prizeAmount is IMMUTABLE from `drawn == true` (Day 5's funding
    ///         setter must enforce that): the per-tx re-encryption below has to
    ///         award the same amount no matter which batch crosses the winner.
    function selectBatch(uint32 maxSteps) external {
        if (maxSteps == 0) revert InvalidConfig();
        Epoch storage ep = _epochs[currentEpochId];
        if (ep.phase != EpochPhase.Drawing) revert WrongPhase();
        if (!ep.drawn) revert NotDrawn();

        uint32 cursor = ep.selectCursor;
        uint32 count = uint32(_participants.length);
        if (cursor >= count) revert SelectionComplete();
        uint256 want = uint256(cursor) + uint256(maxSteps); // no uint32 overflow
        uint32 stop = want > count ? count : uint32(want);

        euint64 ticket = ep.ticket;
        euint64 cumulative = ep.cumulative;
        ebool selectedAny = ep.selectedAny;
        // Hoisted once per tx — identical trivial encryptions inside the loop
        // would alias to the same handles anyway (quirk #10).
        euint64 prizeEnc = FHE.asEuint64(ep.prizeAmount);
        euint64 zero = FHE.asEuint64(0);

        for (uint32 i = cursor; i < stop; ++i) {
            (cumulative, selectedAny) = _scanParticipant(
                _participants[i], ticket, cumulative, selectedAny, prizeEnc, zero
            );
        }

        ep.cumulative = cumulative;
        ep.selectedAny = selectedAny;
        FHE.allowThis(cumulative);
        FHE.allowThis(selectedAny);
        ep.selectCursor = stop;
        emit SelectProgress(currentEpochId, stop);

        if (stop == count) {
            // Phase stays Drawing — Settled is Day 5's claim-side transition.
            emit DrawCompleted(currentEpochId);
        }
    }

    /// @dev One participant's slice of the §6.3 scan (extracted from
    ///      selectBatch's loop). Returns the advanced running sum and latch.
    ///      IDENTICAL op sequence for every participant — hit or not.
    function _scanParticipant(
        address user,
        euint64 ticket,
        euint64 cumulative,
        ebool selectedAny,
        euint64 prizeEnc,
        euint64 zero
    ) private returns (euint64, ebool) {
        Account storage acc = _accounts[user];

        // twabArea is guaranteed initialized: registration only happens on
        // deposits strictly before epochEnd, so the snapshot's _checkpoint
        // accrued at least one interval for every participant.
        cumulative = FHE.add(cumulative, acc.twabArea);
        ebool hit = FHE.and(FHE.lt(ticket, cumulative), FHE.not(selectedAny));

        acc.won = hit;
        FHE.allowThis(hit); // contract-only (§15.1) — pendingPrize is the user channel

        euint64 pending = acc.pendingPrize;
        if (!FHE.isInitialized(pending)) {
            pending = zero; // lazy-init: uninitialized handle ≠ encrypted zero
        }
        pending = FHE.add(pending, FHE.select(hit, prizeEnc, zero));
        acc.pendingPrize = pending;
        FHE.allowThis(pending);
        FHE.allow(pending, user); // the user-facing reveal channel (§15.1)

        return (cumulative, FHE.or(selectedAny, hit));
    }

    // ---------------------------------------------------------------------
    // Pause — deposits and new draws only. Withdrawals are never pausable.
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

    /// @notice Encrypted total frozen weight for `epochId`. The handle itself
    ///         is public info; the ACL is contract-only — no user, employer or
    ///         owner can decrypt it (Day 4's draw consumes it inside FHE ops).
    /// @dev    Zero handle (uninitialized) until beginSnapshot — UIs must
    ///         render that as "unavailable", never as the number 0.
    function totalWeightOf(uint256 epochId) external view returns (euint64) {
        return _epochs[epochId].totalWeight;
    }

    /// @notice Snapshot progress for `epochId`: participants folded into the
    ///         total so far, and the frozen list length ("x/32 processed", R4).
    function snapshotProgress(uint256 epochId) external view returns (uint32 cursor, uint32 total) {
        return (_epochs[epochId].snapshotCursor, uint32(_participants.length));
    }

    /// @notice Draw progress for `epochId`: whether randomness is locked, and
    ///         the selection scan position ("x/32 scanned", R4).
    function drawProgress(uint256 epochId) external view returns (bool drawn, uint32 cursor, uint32 total) {
        Epoch storage ep = _epochs[epochId];
        return (ep.drawn, ep.selectCursor, uint32(_participants.length));
    }

    /// @notice Encrypted winner flag for `user`. Contract-only ACL (§15.1) —
    ///         NO ONE can decrypt it, not even the user; the user-facing reveal
    ///         channel is pendingPrizeOf. Zero handle until the user is scanned.
    function wonOf(address user) external view returns (ebool) {
        return _accounts[user].won;
    }

    /// @notice Encrypted winnings for `user` — decryptable only by the user
    ///         themself (the claim flow lands Day 5).
    /// @dev    Zero handle (uninitialized) until the user has been scanned in a
    ///         draw — UIs must render that as "unavailable", never as 0.
    function pendingPrizeOf(address user) external view returns (euint64) {
        return _accounts[user].pendingPrize;
    }

    /// @notice Encrypted draw state for `epochId`: randomness, winning ticket,
    ///         running cumulative weight and the selected-any latch. Handles
    ///         are public info; the ACL is contract-only — nobody decrypts them.
    function drawStateOf(
        uint256 epochId
    ) external view returns (euint64 random, euint64 ticket, euint64 cumulative, ebool selectedAny) {
        Epoch storage ep = _epochs[epochId];
        return (ep.random, ep.ticket, ep.cumulative, ep.selectedAny);
    }

    /// @notice Public sponsored prize for `epochId` (P-4: the prize amount is
    ///         deliberately public; only user balances/weights are secret).
    ///         Zero until Day 5's funding lands; immutable once the epoch is drawn.
    function prizeAmountOf(uint256 epochId) external view returns (uint64) {
        return _epochs[epochId].prizeAmount;
    }
}
