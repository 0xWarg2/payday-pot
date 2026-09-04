import type { DocPageDef } from "../types";

/**
 * Đích của mọi link "docs" trong error taxonomy.
 *
 * Trang này tồn tại vì luật thứ hai của ERROR_RECOVERY_MATRIX: không có dead
 * end. Một số lỗi thật sự không có nút nào bấm được — token từ chối địa chỉ,
 * wrapper chạm trần supply — và với những lỗi đó, thứ tử tế nhất có thể đưa cho
 * người dùng là một lời giải thích thẳng thắn thay vì một nút giả vờ có tác dụng.
 *
 * Bảy id section là API công khai: `ErrorPanel`, `PendingUnwrapBanner` (#unwrap)
 * và test copy trỏ vào chúng. Đổi id là đổi URL.
 */
export const KNOWN_LIMITATIONS: DocPageDef = {
  slug: "known-limitations",
  title: "Known limitations",
  group: "reference",
  summary:
    "What this build does not do, what stays visible to everyone no matter what, and what to do when something gets stuck.",
  source: ["docs/KNOWN_LIMITATIONS.md", "docs/ERROR_RECOVERY_MATRIX.md"],
  sections: [
    {
      id: "yield",
      title: "The prize is sponsored, not generated",
      blocks: [
        {
          kind: "p",
          text: "Prizes in this pool are employer-funded sponsored yield. An employer deposits the prize for a round out of its own pocket; the pool does not lend your deposits out, does not stake them, and does not earn anything on them.",
        },
        {
          kind: "p",
          text: "The contract exposes a yield-adapter interface so a real yield source could fund the prize instead, but no such adapter is connected in this build. Treat the prize as a simulator with a real settlement path, not as return on your savings.",
        },
      ],
    },
    {
      id: "privacy",
      title: "Encrypted does not mean anonymous",
      blocks: [
        {
          kind: "p",
          text: "What stays encrypted: your deposited principal, your time-weighted balance, your pending prize, and whether you won. Nobody — not the employer, not the keeper, not the contract owner — holds a decryption permission for any of them.",
        },
        {
          kind: "p",
          text: "What stays public, permanently, and cannot be hidden by this design: your wallet address, the fact that you interacted with the pool, when you did it, how many participants a round has, and the prize amount. Anyone reading Sepolia can see all of that.",
        },
        {
          kind: "p",
          text: "Values you reveal are decrypted inside this browser tab and never leave it. They are cleared after five minutes, and immediately when you hide them, switch account, switch network, hide the tab, or reload.",
        },
      ],
    },
    {
      id: "decryption",
      title: "Opening your own numbers depends on a service that is sometimes unavailable",
      blocks: [
        {
          kind: "p",
          text: "Revealing a value is not a read from the chain. The encrypted value is held onchain, but turning it back into a number takes a threshold key-management service run by a committee of independent parties: they each return a share, and your browser reassembles the number locally from those shares.",
        },
        {
          kind: "p",
          text: "On this testnet that service is sometimes unable to produce a usable set of shares. It answers that it succeeded, and the reassembly then fails — which means nothing was sent, nothing changed, and nothing was decrypted. It is not a slow network you can wait out, and it is not something this app can fix from its side.",
        },
        {
          kind: "p",
          text: "What this app does about it: it asks for each value separately when asking for them together fails, because the outcome depends on which values are asked for and shifts over time. So you may see one number open while another stays closed. A value that could not be opened stays closed — it is never shown as zero — and the screen says which one it was.",
        },
        {
          kind: "p",
          text: "Everything else keeps working while this is happening: depositing, withdrawing, claiming, and running the draw do not go through that service. Only looking at your own numbers does.",
        },
      ],
    },
    {
      id: "unwrap",
      title: "Unwrapping happens in two steps and can stall",
      blocks: [
        {
          kind: "p",
          text: "Turning the confidential token back into plain test USDC is a request followed by a settlement. The request burns your confidential balance and marks that one amount publicly decryptable; the settlement proves the decrypted amount back to the token contract, which then releases the USDC.",
        },
        {
          kind: "p",
          text: "If the tab closes or the network drops in between, the request sits open. Your funds are not lost — they are held by the token contract against a request that can only ever pay your receiving address — but they will not appear in your wallet until the second step lands.",
        },
        {
          kind: "p",
          text: "This build detects that state by reading the chain for your address, so it finds a stalled request even if it was started somewhere else entirely, and offers to finish it. Settling is permissionless: any wallet can complete it for you, which is also why someone else finishing it looks like success here rather than an error.",
        },
        {
          kind: "p",
          text: "Two edges worth knowing. The lookback is about a week of blocks — the widest window a single public RPC query allows — so a request older than that is real but invisible to this screen; the token contract still honours it. And because a request settles against whatever balance was actually burnt, a request made for more than you held settles for zero: the token caps instead of failing, and this screen says so in plain words rather than showing a tick.",
        },
        {
          kind: "p",
          text: "This app deliberately has no unwrap button of its own. Withdrawing from the pool returns confidential USDC, which stays confidential; converting it back to plain USDC is a token-level operation you do wherever you wrapped it. What this screen owes you is the way out when that operation stalls — not a second place to start it.",
        },
      ],
    },
    {
      id: "draw",
      title: "The draw runs in batches and anyone can continue it",
      blocks: [
        {
          kind: "p",
          text: "Picking a winner over encrypted weights costs more computation than one transaction can hold, so a round is closed, snapshotted and scanned in batches. A keeper normally drives this, but every batch call is permissionless: if the keeper stops, any wallet can continue from exactly where it left off and the outcome does not change.",
        },
        {
          kind: "p",
          text: "Randomness for a round is drawn once and is never re-rolled. If a scan transaction fails after the seed exists, the fix is to continue the scan, not to draw again — and the contract refuses to draw again anyway.",
        },
      ],
    },
    {
      id: "caps",
      title: "The pool is deliberately small",
      blocks: [
        {
          kind: "p",
          text: "A round holds a fixed maximum number of participants and a per-wallet deposit cap. Both exist because encrypted arithmetic has a hard compute budget per transaction, and because the encrypted types used here overflow silently rather than reverting — so the caps are what keep the maths honest.",
        },
        {
          kind: "p",
          text: "A deposit above the per-wallet cap does not fail with an error. The confidential token refuses the transfer as a whole and hands the amount back, so the transaction succeeds while your position stays exactly as it was. Nothing leaves your wallet, but nothing is added either.",
        },
      ],
    },
    {
      id: "testnet",
      title: "Sepolia only, with test money",
      blocks: [
        {
          kind: "p",
          text: "Everything here runs on Ethereum Sepolia against a mock USDC whose faucet is open to anyone. None of it is real money, and none of the balances mean anything outside the testnet.",
        },
        {
          kind: "p",
          text: "There is no payroll integration. Deposits happen because you send them, not because a salary arrives; the payday framing is about the habit, not about a connected employer system.",
        },
        {
          kind: "p",
          text: "The contract is not upgradeable and there is no administrative path to move your principal. Pausing the pool stops new deposits and nothing else — withdrawing and claiming stay available in every phase, including while paused.",
        },
      ],
    },
  ],
};
