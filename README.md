# PayDay Pot

A no-loss prize savings pool where **the amounts are confidential**.

You deposit USDC. You can withdraw all of it at any time, in any phase. Once a
round you have a chance at a sponsored prize, weighted by how much you kept in
and for how long. Your balance, your weight, and your winnings are encrypted on
chain — nobody can read them, including us, the employer who funds the prize,
and whoever runs the draw.

Built with [Zama](https://zama.ai) FHEVM on Ethereum Sepolia.

| | |
|---|---|
| **Live app** | _see `Demo website` in the submission — deployed from `main`_ |
| **Contract** | [`0x792c77D9A2052ED03aaB6B392364c3e17f52a035`](https://eth-sepolia.blockscout.com/address/0x792c77D9A2052ED03aaB6B392364c3e17f52a035#code) — verified source |
| **Sourcify** | [full match](https://repo.sourcify.dev/11155111/0x792c77D9A2052ED03aaB6B392364c3e17f52a035) (`creationMatch=match`, `runtimeMatch=match`) |
| **Token** | cUSDCMock [`0x7c5BF43B851c1dff1a4feE8dB225b87f2C223639`](https://eth-sepolia.blockscout.com/address/0x7c5BF43B851c1dff1a4feE8dB225b87f2C223639) — Zama's official ERC-7984 wrapper |
| **Deployment record** | [`deployments/sepolia.json`](deployments/sepolia.json) — address, block, commit, ABI hash, verification links |

---

## What is and is not private

This matters enough to say before anything else, because the honest version is
narrower than the marketing version.

**Confidential** — encrypted on chain, readable only by the one person it
belongs to: your deposit balance, your time-weighted average balance (the draw
weight), the pool's total principal, the total weight, the random seed, every
intermediate ticket value, who won, and how much they won.

**Public** — deliberately, and you should assume anyone can see it: your wallet
address, the fact that you are a participant, the timestamps of your
transactions, the round's phase and schedule, how much prize money the employer
put in, and the draw's progress cursor.

**PayDay Pot is not an anonymity tool.** It hides *amounts*, not *identities*.
If your address is already linked to you, this app does not unlink it. There is
one more sharp edge: `wrap` — turning public USDC into confidential USDC — takes
a plaintext amount, so the *act of shielding* is visible with its size. After
that the number is gone from public view. The app says this on screen before you
do it, not in a footnote.

Full state-by-state classification, including who holds which decryption grant:
[`docs/PRIVACY.md`](docs/PRIVACY.md).

---

## Where the prize money comes from — read this before judging the yield claim

The prize is **employer-funded sponsored yield**. An employer (or any sponsor)
calls `fundPrize(amount)`, which pulls public USDC out of their wallet into the
pool and wraps it. That transfer *is* the allocation, so the pool can never
promise a prize that no token backs.

**There is no yield strategy in this contract.** No lending market, no
rehypothecation, no adapter contract. Deposits sit in the pool as confidential
USDC and are not put to work. Calling that "generated yield" without
qualification would be a false claim, so we are not making it.

What is real is the **seam**. `fundPrize(uint64)` is the only way value enters
the prize, it is `onlyEmployer`, and it takes plain underlying ERC-20. A real
yield source plugs in there — it would need to:

1. **Hold the principal instead of the pool.** Today `withdrawAll()` succeeds in
   every phase because the pool holds 1:1 confidential USDC. A strategy that
   deploys principal elsewhere breaks that guarantee, so it needs either a
   liquidity buffer or an explicit, disclosed withdrawal delay. This is the
   design decision, not the plumbing.
2. **Realize into underlying ERC-20 before funding.** The prize path pulls a
   concrete ERC-20 balance and reverts when short, on purpose (see R12 in
   [`docs/ERROR_RECOVERY_MATRIX.md`](docs/ERROR_RECOVERY_MATRIX.md)). A strategy
   must harvest to underlying first; it cannot fund out of an unrealized
   position.
3. **Not learn the amounts.** The strategy would see the pool's *aggregate*
   position in plaintext, because that is what a lending market requires. It
   must never receive an FHE decryption grant on any per-user handle — the pool
   grants those only to the owning wallet, and there are negative tests
   asserting that employer, keeper, and owner are denied.
4. **Survive a loss.** `fundPrize` reverting is safe. A strategy that can lose
   principal is not, unless principal accounting stops being 1:1 — which is a
   different product with a different risk disclosure.

That list is the honest scope of the gap: the confidential accounting, draw, and
payout are complete and running on Sepolia; the yield source is a sponsor
writing a check. We would rather state that plainly than let a judge discover it.

---

## How a round works

```
Open ──(epoch ends)──▶ beginSnapshot() ──▶ Snapshotting
  Snapshotting ──▶ snapshotBatch(n) × k ──(cursor == total)──▶ Drawing
    Drawing ──▶ requestRandom() ──▶ selectBatch(n) × k ──▶ Settled
      Settled ──▶ startNewEpoch() ──▶ Open
```

Every one of those five functions is `external` with **no access modifier**. Any
wallet with gas can send any of them, and the app exposes them as buttons on
`/app/draws/current` for exactly that reason: if only the project could advance a
round, the pool would depend on the project staying alive.

Weight is time-weighted. Depositing a lot one minute before the round closes
buys almost nothing — the pool integrates balance over time (`twabArea`) and
never divides that area on chain, because dividing by an encrypted value is not
supported and dividing by the duration is unnecessary for a comparison. The
average you see in the UI is computed in your browser after decryption.

Winner selection is a single-pass weighted scan against one random draw. The
seed is drawn exactly once per round and cannot be redrawn — a failed batch is
resent and lands on the same result, which is why the UI says so during the whole
Drawing phase rather than only after an error.

The full protocol, including the multiply-high ticket math and why
`FHE.shr(product, 64)` replaces a division: [`docs/DRAW_PROTOCOL.md`](docs/DRAW_PROTOCOL.md).

---

## Repo layout

```
apps/web                 Next.js App Router, TS strict — the app judges will open
packages/contracts       Hardhat + @fhevm/solidity — PayDayPot.sol, deploy, ops scripts
packages/sdk             Typed actions/queries and the error taxonomy the UI renders
packages/shared          Generated deployment manifest, ABI, shared types
deployments/sepolia.json Single source of truth: address, block, commit, ABI hash
docs/                    Architecture, draw protocol, privacy, threat model, runbook
```

The web app never hardcodes an address and never reads the manifest off disk. It
imports a generated module and asserts at boot that the ABI hash it was built
against matches the deployed contract — a stale frontend fails loudly instead of
sending calls into the wrong shape.

---

## Run it locally

```bash
pnpm install --frozen-lockfile
pnpm -r build
```

Contract tests run against the local FHE mock — no network, no relayer:

```bash
cd packages/contracts && npx hardhat test
```

The web app:

```bash
cd apps/web && pnpm dev        # http://localhost:3000
pnpm test                      # vitest + React Testing Library
npx playwright test             # e2e, including the error-recovery suite
```

To point at your own deployment you need a funded Sepolia key and the mock USDC
faucet, which is open:

```bash
cd packages/contracts
npx hardhat vars set MNEMONIC
PAYDAY_POT_DEV_DEPLOY=1 POT_EPOCH_DURATION=3600 npx hardhat deploy --network sepolia --tags PayDayPot
PRIZE_AMOUNT=50 npx hardhat run scripts/fund-prize.ts --network sepolia
SEED_ACCOUNT_INDEX=0 SEED_AMOUNT=1000 npx hardhat run scripts/seed-deposit.ts --network sepolia
npx hardhat run scripts/keeper.ts --network sepolia
```

Operational detail — what to run when a round stalls, how to read the state, what
each failure means: [`docs/RUNBOOK.md`](docs/RUNBOOK.md).

---

## When things go wrong

Confidential apps fail in ways ordinary dApps do not: a relayer times out mid
encryption, a decryption grant is not yours, a two-step unwrap gets abandoned
between steps, an epoch ends with nobody to advance it. Fifteen of those failure
modes are enumerated in
[`docs/ERROR_RECOVERY_MATRIX.md`](docs/ERROR_RECOVERY_MATRIX.md) — each with the
screen the user actually sees, the action that gets them out, and a test that
holds it in place. "We understand the mechanism" does not count as handled.

Two consequences of that work are worth naming here, because they are visible in
the product:

- **The app never shows `0` for a value that is merely hidden.** An unreadable
  confidential balance renders as "Not available yet", not as zero. Showing zero
  would be a lie that looks like data.
- **A stalled unwrap is detectable and finishable from any machine.** The app
  scans `UnwrapRequested` logs for your address rather than trusting local
  storage, so it finds requests created outside this app too, and the finish
  button reports the amount that actually moved — including zero, which is what
  the token does when the request exceeded the balance.

---

## Non-goals

Stated so they are not mistaken for missing work:

- **Not anonymous.** Addresses and timing are public. See above.
- **No payroll integration.** "PayDay" is the product metaphor. Nothing is
  connected to any payroll system, and the app never claims otherwise.
- **No admin sweep, no upgrades.** The contract is non-upgradeable and has no
  path for the owner to touch user principal. `pause()` cannot block
  `withdrawAll()` or `claim()`.
- **No real yield.** See the section above.
- **No unwrap flow of its own.** The app deliberately has no "unshield" button;
  it only helps you *finish* an unwrap you started elsewhere. Adding an exit that
  publishes your amount, one click from a screen about confidentiality, would
  teach the wrong reflex.

Everything else that is incomplete, deferred, or a known sharp edge:
[`docs/KNOWN_LIMITATIONS.md`](docs/KNOWN_LIMITATIONS.md).

---

## Security posture

Threat model, trust assumptions, and what an attacker with each capability can
and cannot learn: [`docs/THREAT_MODEL.md`](docs/THREAT_MODEL.md).

Short version: the pool trusts the FHEVM coprocessor and the relayer for
availability, not for confidentiality of user amounts; it trusts nobody with a
grant it did not issue; and it assumes the employer, the keeper, and the contract
owner are adversaries with respect to reading user data. Those last three are
covered by negative tests, not by prose.

This is testnet software written for a bounty in ten days. It has not been
audited.

---

Built with Zama FHEVM. `#ZamaDeveloperProgram`
