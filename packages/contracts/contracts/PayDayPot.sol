// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import {FHE, ebool, euint64, euint128, externalEuint64} from "@fhevm/solidity/lib/FHE.sol";
import {ZamaEthereumConfig} from "@fhevm/solidity/config/ZamaConfig.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Ownable2Step} from "@openzeppelin/contracts/access/Ownable2Step.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {IERC20} from "@openzeppelin/contracts/interfaces/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {IERC7984} from "@openzeppelin/confidential-contracts/interfaces/IERC7984.sol";
import {IERC7984Receiver} from "@openzeppelin/confidential-contracts/interfaces/IERC7984Receiver.sol";
import {
    IERC7984ERC20Wrapper
} from "@openzeppelin/confidential-contracts/interfaces/IERC7984ERC20Wrapper.sol";

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
        uint64 prizeAmount; // public sponsored prize (P-4), IMMUTABLE once drawn
        euint64 prizeCipher; // prizeAmount + carried-over prize, frozen at requestRandom
    }

    // ---------------------------------------------------------------------
    // Immutable configuration
    // ---------------------------------------------------------------------

    /// @notice The confidential ERC-7984 token this pool accepts.
    IERC7984 public immutable TOKEN;
    /// @notice The public ERC-20 backing TOKEN. Employer funding arrives in
    ///         THIS asset and is wrapped inside fundPrize (decision (i)).
    IERC20 public immutable UNDERLYING;
    /// @notice Underlying units per confidential unit (1 for 6-decimals USDC).
    uint256 public immutable RATE;
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

    /// @dev Prize carried over from epochs that ended with no winner (every
    ///      participant's frozen weight was zero, so the ticket scan never
    ///      crossed). Whether that happened is ENCRYPTED — publishing it would
    ///      reveal that every participant held zero time-weighted balance — so
    ///      the rollover has to be encrypted too. Contract-only ACL, never
    ///      publicly decryptable (#6).
    ///
    ///      Handle hygiene: this is only ever assigned the output of an FHE op
    ///      (add/select), never a bare FHE.asEuint64(0). Trivial encryptions
    ///      alias to one well-known handle (quirk #10), so assigning one in a
    ///      winner-dependent branch would leak winner-existence by handle
    ///      comparison alone — precisely what the encryption is hiding.
    euint64 private _prizeCarry;

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
    /// @dev The prize amount is public by design (P-4) but is read through the
    ///      prizeAmountOf view, never carried in a log — one uniform event rule
    ///      for the whole contract beats a per-event judgement call.
    event PrizeFunded(uint256 indexed epochId);
    event PrizeDefunded(uint256 indexed epochId);
    /// @dev Emitted on every claim ATTEMPT, winner or not — the encrypted
    ///      winnings cannot be branched on, and a log that appeared only for
    ///      winners would name them outright (§15.1, rule #5).
    event PrizeClaimed(address indexed user, uint256 indexed epochId);
    /// @dev The epoch is resolved and its prize is final. Emitted for BOTH
    ///      terminal paths (scan complete, and the empty-pool fast path), so a
    ///      UI has one signal to watch and cannot tell them apart by log shape.
    event EpochSettled(uint256 indexed epochId);

    // ---------------------------------------------------------------------
    // Errors — no amount parameters, plaintext-safe conditions only.
    // ---------------------------------------------------------------------

    error NotToken(address caller);
    error NotEmployer(address caller);
    error PoolFull();
    error NotRegistered(address user);
    error WrongPhase();
    error InvalidConfig();
    error InvalidAmount();
    error ZeroAddress();
    error AlreadyDrawn();
    error NotDrawn();
    error SelectionComplete();
    /// @dev Only ever raised on a PUBLIC fact: the caller has never been
    ///      scanned by any draw, so no winnings handle exists yet. It never
    ///      distinguishes a winner from a loser — both hold an initialized
    ///      handle after a scan, and both fall through to the transfer.
    error NothingToClaim();

    // ---------------------------------------------------------------------
    // Modifiers
    // ---------------------------------------------------------------------

    /// @dev The employer sponsors the prize and NOTHING else: this modifier
    ///      guards only prize money in/out. It never appears on a function
    ///      that reads or moves user principal, TWAB or winnings (#3, #4).
    modifier onlyEmployer() {
        if (msg.sender != EMPLOYER) revert NotEmployer(msg.sender);
        _;
    }

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

        // Read the wrapper shape once. This binds the pool to a wrapper-backed
        // ERC-7984 (a bare ERC7984 has no underlying()/rate() and reverts here,
        // at deploy time — the loudest possible place). Both are plain view
        // calls, so quirk #13 (no FHE ops in a constructor) is respected.
        IERC7984ERC20Wrapper wrapper = IERC7984ERC20Wrapper(address(token_));
        address underlying_ = wrapper.underlying();
        uint256 rate_ = wrapper.rate();
        if (underlying_ == address(0)) revert ZeroAddress();
        // rate_ == 0 would let fundPrize credit prizeAmount while wrapping zero
        // tokens — an unbacked prize, i.e. a hole straight through solvency.
        if (rate_ == 0) revert InvalidConfig();

        TOKEN = token_;
        UNDERLYING = IERC20(underlying_);
        RATE = rate_;
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
    // Prize funding — employer money in and out (Day 5, decision (i)).
    //
    // The prize arrives as PUBLIC underlying ERC-20 and is wrapped by this
    // contract in the same tx. That choice is the whole answer to R12: a
    // confidential transfer clamps a short balance to encrypted zero instead
    // of reverting, so declaring `prizeAmount += amount` off the back of one
    // could promise a prize no token backs — and the winner's claim would eat
    // another user's principal (non-negotiable #1). An ERC-20 pull reverts.
    // Allocation therefore IS the funding IS the actual transfer, and
    // solvency holds by construction rather than by a check we might forget.
    // ---------------------------------------------------------------------

    /// @notice Sponsor `amount` confidential units of prize into the current
    ///         epoch. Two steps for the employer: approve UNDERLYING to this
    ///         pool, then call this (R13).
    /// @dev    Gate is `phase == Open`, NOT `!drawn`. The invariant that
    ///         actually matters is "this epoch's prize has not yet been
    ///         committed to a draw or rolled into the carry", and commitment
    ///         happens at requestRandom (drawn) OR at the empty-pool
    ///         fast path (which lands in Settled with drawn still false).
    ///         Open is the one phase where neither has happened. It also
    ///         still allows a top-up after epochEnd but before beginSnapshot.
    function fundPrize(uint64 amount) external onlyEmployer whenNotPaused nonReentrant {
        if (amount == 0) revert InvalidAmount();
        Epoch storage ep = _epochs[currentEpochId];
        if (ep.phase != EpochPhase.Open) revert WrongPhase();

        uint256 underlyingAmount = uint256(amount) * RATE; // exact: no wrap dust
        SafeERC20.safeTransferFrom(UNDERLYING, msg.sender, address(this), underlyingAmount);
        // forceApprove, not approve: a non-standard ERC-20 reverts when a
        // non-zero allowance is set over a non-zero one. wrap() consumes the
        // whole allowance every time, but the pool must not depend on that.
        SafeERC20.forceApprove(UNDERLYING, address(TOKEN), underlyingAmount);
        IERC7984ERC20Wrapper(address(TOKEN)).wrap(address(this), underlyingAmount);

        ep.prizeAmount += amount; // checked add — an overflow here reverts
        emit PrizeFunded(currentEpochId);
    }

    /// @notice Return up to `amount` of the current epoch's un-committed prize
    ///         to the employer, as confidential tokens.
    /// @dev    Deliberately NOT `whenNotPaused`. This is the D3 escape hatch:
    ///         if the owner pauses forever while the epoch sits in Drawing
    ///         before requestRandom (KNOWN_LIMITATIONS §7), this is the only
    ///         way the sponsored prize gets out — the mirror image of rule #1
    ///         for user principal. The employer unwraps on their own time;
    ///         unwrap is a 2-tx async dance this pool never enters.
    ///         The token-side clamp cannot fire: prizeAmount was backed 1:1 by
    ///         a real wrap and nothing else can spend it.
    function defundPrize(uint64 amount) external onlyEmployer nonReentrant {
        if (amount == 0) revert InvalidAmount();
        Epoch storage ep = _epochs[currentEpochId];
        // Same invariant as fundPrize, stated from the other side: refuse once
        // the prize is committed. `drawn` covers requestRandom; `Settled`
        // covers the empty-pool path, where drawn stays false yet the prize
        // has already been rolled into the encrypted carry. Snapshotting and
        // Drawing-before-random stay OPEN on purpose — that is the D3 exit.
        if (ep.drawn || ep.phase == EpochPhase.Settled) revert WrongPhase();
        if (amount > ep.prizeAmount) revert InvalidAmount();

        ep.prizeAmount -= amount;

        // No FHE.allow for the employer: `amount` is a public parameter, so
        // there is nothing here they could learn by decrypting it.
        euint64 value = FHE.asEuint64(amount);
        FHE.allowThis(value);
        FHE.allowTransient(value, address(TOKEN));
        TOKEN.confidentialTransfer(msg.sender, value);

        emit PrizeDefunded(currentEpochId);
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
    /// @dev    With zero participants the epoch is resolved outright in this
    ///         tx: Open → Settled, prize rolled into the carry. Nobody can win
    ///         a pool nobody joined, so making a keeper burn 1.75M HCU on a
    ///         randEuint64 for it would be pure waste (D9). Emptiness is
    ///         public state (participantCount), so this shortcut leaks nothing
    ///         — unlike the scan's outcome, which stays encrypted.
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
            // Plaintext add: with count == 0 there is no encrypted question to
            // ask, so no FHE.select and nothing to hide. From here on the
            // prize is COMMITTED to the carry — defundPrize refuses at
            // Settled precisely so it cannot be pulled back out from under it.
            _prizeCarry = FHE.add(_carryOrZero(), FHE.asEuint64(ep.prizeAmount));
            FHE.allowThis(_prizeCarry);

            ep.phase = EpochPhase.Settled;
            emit SnapshotCompleted(currentEpochId);
            emit EpochSettled(currentEpochId);
        }
    }

    /// @dev The carry, lazily zero-initialized. Initialization state is public
    ///      protocol history (no epoch has settled yet), never a fact about
    ///      any draw's outcome, so the trivial-encrypt alias is safe here.
    function _carryOrZero() private returns (euint64) {
        euint64 carry = _prizeCarry;
        return FHE.isInitialized(carry) ? carry : FHE.asEuint64(0);
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

        // Freeze what this draw pays out: this epoch's sponsored prize plus
        // anything carried over from earlier epochs that found no winner.
        // Fixing it here — not per selectBatch tx — is what makes the award
        // amount structurally immutable across batches (B2).
        //
        // FHE.add wraps silently past 2^64 instead of reverting. It cannot get
        // there: the wrapper's maxTotalSupply is type(uint64).max, so tokens
        // beyond that cannot exist to be funded, and every unit of both terms
        // is backed by a real wrap.
        ep.prizeCipher = FHE.add(FHE.asEuint64(ep.prizeAmount), _carryOrZero());

        // Contract-only ACL on the whole draw state — no user, keeper,
        // employer or owner ever decrypts the randomness, the ticket, or the
        // prize pool (the last would reveal whether a carry is riding along,
        // i.e. whether some earlier epoch had no winner).
        FHE.allowThis(rnd);
        FHE.allowThis(ticket);
        FHE.allowThis(ep.cumulative);
        FHE.allowThis(ep.selectedAny);
        FHE.allowThis(ep.prizeCipher);

        emit RandomRequested(currentEpochId);
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
    ///         The awarded amount is IMMUTABLE from `drawn == true`: whichever
    ///         batch crosses the winner must award the same figure. fundPrize
    ///         and defundPrize enforce that from the money side (B2), and
    ///         since Day 5 it also holds structurally — the amount is the
    ///         epoch's prizeCipher handle, frozen once inside requestRandom.
    function selectBatch(uint32 maxSteps) external {
        if (maxSteps == 0) revert InvalidConfig();
        Epoch storage ep = _epochs[currentEpochId];
        // Settled ahead of the generic phase check: losing a race to another
        // keeper is the most common way to land here (R4), and "the scan is
        // already finished" is a benign outcome a UI should say plainly —
        // not the same class of error as calling this during Open.
        if (ep.phase == EpochPhase.Settled) revert SelectionComplete();
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
        // The pool frozen by requestRandom — read, not re-encrypted, so every
        // batch awards the identical handle no matter which one crosses.
        euint64 prizeEnc = ep.prizeCipher;
        // Hoisted once per tx — identical trivial encryptions inside the loop
        // would alias to the same handle anyway (quirk #10).
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
            // Every participant has been scanned, so `selectedAny` now answers
            // "did this epoch have a winner?" once and for all. The answer is
            // encrypted and must stay that way — a public branch here would
            // announce that every participant held a zero time-weighted
            // balance. So the rollover is an FHE.select: winner ⇒ the carry
            // empties (the prize is already sitting in their pendingPrize),
            // no winner ⇒ the whole pool rides forward untouched.
            //
            // Overwrite, never accumulate: prizeCipher ALREADY contains the
            // incoming carry (folded in at requestRandom), so adding here
            // would double-count it.
            _prizeCarry = FHE.select(selectedAny, zero, prizeEnc);
            FHE.allowThis(_prizeCarry);

            // Settled is reached permissionlessly, in the same tx that
            // finishes the scan (rule #7) — no separate settle() for a keeper
            // to sit on, and no window where a resolved epoch looks unresolved.
            ep.phase = EpochPhase.Settled;
            emit DrawCompleted(currentEpochId);
            emit EpochSettled(currentEpochId);
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
    // Claim — NEVER gated by pause or phase (non-negotiable #1, §17.8)
    // ---------------------------------------------------------------------

    /// @notice Sweep the caller's accumulated winnings to their wallet.
    ///         Idempotent: a second call transfers encrypted zero rather than
    ///         reverting. Available in every phase, even while paused.
    /// @dev    Deliberately UNIFORM for every caller. A `require(won)` would be
    ///         the natural shape and is exactly wrong here: reverting for
    ///         losers turns the public revert/success bit into a winner
    ///         announcement. Everyone runs the same code, emits the same
    ///         event, and moves an encrypted amount that happens to be zero
    ///         for all but one of them.
    ///
    ///         No phase gate either. Winnings accumulate ACROSS epochs (B3
    ///         never resets pendingPrize), so "the current epoch is mid-draw"
    ///         says nothing about whether last epoch's prize is owed.
    function claim() external nonReentrant {
        Account storage acc = _accounts[msg.sender];
        if (!acc.registered) revert NotRegistered(msg.sender);

        euint64 pending = acc.pendingPrize;
        if (!FHE.isInitialized(pending)) revert NothingToClaim();

        // CEI is inverted here, deliberately: the debit is computed FROM the
        // transfer's return value, so the interaction has to come first. That
        // is rule #2's shape (settle on the actual encrypted amount moved,
        // never the requested one) applied to money going out — if the token
        // ever clamped, subtracting `pending` would silently burn the
        // difference the user is still owed. Safe because the callee is the
        // immutable TOKEN, whose confidentialTransfer makes no callback into
        // this contract, and nonReentrant closes the door regardless.
        FHE.allowTransient(pending, address(TOKEN));
        euint64 transferred = TOKEN.confidentialTransfer(msg.sender, pending);

        // ERC-7984 grants the sender a persistent ACL on `transferred`, so
        // this subtraction is legal in the same tx.
        acc.pendingPrize = FHE.sub(pending, transferred);
        FHE.allowThis(acc.pendingPrize);
        FHE.allow(acc.pendingPrize, msg.sender);

        // No _checkpoint: winnings are not time-weighted and this touches no
        // principal, so the TWAB accrual is unaffected either way.
        emit PrizeClaimed(msg.sender, currentEpochId);
    }

    // ---------------------------------------------------------------------
    // Epoch lifecycle
    // ---------------------------------------------------------------------

    /// @notice Open the next epoch once the current one is Settled. Anyone may
    ///         call (rule #7) — the pool must never depend on a keeper staying
    ///         alive to keep saving.
    /// @dev    Requiring Settled — rather than the raw `drawn && cursor ==
    ///         count` — is what stops a half-scanned epoch being orphaned with
    ///         its prize and its half-written winner flags (B3). It also
    ///         covers the empty-pool path, which settles without ever drawing.
    ///
    ///         Not pausable: pausing stops money coming IN (deposits) and new
    ///         draws starting; it must never be able to strand the pool in a
    ///         phase it can't leave.
    ///
    ///         The new epoch starts NOW, not at the old one's end. Backfilling
    ///         would hand a long-delayed epoch a window shorter than its own
    ///         duration — or none at all. The cost is that the gap between
    ///         epochs accrues no weight for anyone (documented in
    ///         KNOWN_LIMITATIONS); the benefit is that every epoch is a real,
    ///         full-length savings window.
    function startNewEpoch() external {
        Epoch storage prev = _epochs[currentEpochId];
        if (prev.phase != EpochPhase.Settled) revert WrongPhase();

        uint64 newStart = uint64(block.timestamp);

        // One shared zero / false handle reused for every participant. Trivial
        // encryptions alias anyway (quirk #10), and — unlike the carry — that
        // is harmless here precisely BECAUSE the reset is unconditional: every
        // participant gets the identical handle regardless of what they held
        // or whether they won, so the handles say nothing.
        euint64 zero = FHE.asEuint64(0);
        ebool notWon = FHE.asEbool(false);
        FHE.allowThis(zero);
        FHE.allowThis(notWon);

        // Bounded by PARTICIPANT_CAP (≤32) — one tx, no cursor needed.
        uint256 count = _participants.length;
        for (uint256 i = 0; i < count; ++i) {
            address user = _participants[i];
            Account storage acc = _accounts[user];

            // Epoch-scoped state only.
            acc.twabArea = zero;
            FHE.allow(zero, user); // weight stays user-readable from tick zero (#8)
            acc.won = notWon; // contract-only ACL, matching the scan (§15.1)
            acc.lastCheckpoint = newStart;

            // principal is NOT touched: savings roll over, that is the product.
            // pendingPrize is NOT touched: unclaimed winnings are a liability
            // that survives every epoch boundary (B3) — resetting it here
            // would be the single most expensive bug in this contract.
        }

        currentEpochId += 1;
        Epoch storage ep = _epochs[currentEpochId];
        ep.start = newStart;
        ep.end = newStart + EPOCH_DURATION;
        ep.phase = EpochPhase.Open;
        // prizeAmount/prizeCipher stay at their mapping defaults: the new
        // epoch is unfunded until an employer funds it, and any carry from
        // this one is folded in at its requestRandom.

        emit EpochStarted(currentEpochId, ep.start, ep.end);
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

    /// @notice Public sponsored prize funded INTO `epochId` (P-4: the amount
    ///         is deliberately public; only user balances/weights are secret).
    ///         Immutable once the epoch is drawn.
    /// @dev    This is not the epoch's payout: a draw pays prizeAmount plus
    ///         any carry from earlier winnerless epochs, and that total is
    ///         encrypted on purpose (see prizeCipherOf).
    function prizeAmountOf(uint256 epochId) external view returns (uint64) {
        return _epochs[epochId].prizeAmount;
    }

    /// @notice Encrypted total pool `epochId`'s draw pays out — its own funded
    ///         prize plus any carry. Frozen at requestRandom; zero handle
    ///         before that (and for an epoch resolved by the empty-pool path).
    /// @dev    Handle is public info, ACL is contract-only: nobody decrypts it,
    ///         because the gap between this and the public prizeAmount is
    ///         exactly the carry, and a non-zero carry means some earlier
    ///         epoch had no winner (#6).
    function prizeCipherOf(uint256 epochId) external view returns (euint64) {
        return _epochs[epochId].prizeCipher;
    }

    /// @notice Encrypted prize carried over from winnerless epochs.
    /// @dev    Same policy as totalPrincipal: the handle is public, the ACL is
    ///         contract-only, and it is NEVER made publicly decryptable — its
    ///         value is a direct statement about past draws' outcomes (#6).
    ///         Exposed so conservation can be reasoned about through the ABI;
    ///         tests read it with the mock-only debugger.
    function prizeCarry() external view returns (euint64) {
        return _prizeCarry;
    }
}
