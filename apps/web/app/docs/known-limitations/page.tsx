import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Known limitations — PayDay Pot",
  description: "What this build does not do, what stays public, and what to do when something stalls.",
};

/**
 * Đích của mọi link "docs" trong error taxonomy.
 *
 * Trang này tồn tại vì luật thứ hai của ERROR_RECOVERY_MATRIX: không có dead
 * end. Một số lỗi thật sự không có nút nào bấm được — token từ chối địa chỉ,
 * wrapper chạm trần supply — và với những lỗi đó, thứ tử tế nhất có thể đưa cho
 * người dùng là một lời giải thích thẳng thắn thay vì một nút giả vờ có tác dụng.
 */

const SECTIONS = [
  {
    id: "yield",
    title: "The prize is sponsored, not generated",
    body: [
      "Prizes in this pool are employer-funded sponsored yield. An employer deposits the prize for a round out of its own pocket; the pool does not lend your deposits out, does not stake them, and does not earn anything on them.",
      "The contract exposes a yield-adapter interface so a real yield source could fund the prize instead, but no such adapter is connected in this build. Treat the prize as a simulator with a real settlement path, not as return on your savings.",
    ],
  },
  {
    id: "privacy",
    title: "Encrypted does not mean anonymous",
    body: [
      "What stays encrypted: your deposited principal, your time-weighted balance, your pending prize, and whether you won. Nobody — not the employer, not the keeper, not the contract owner — holds a decryption permission for any of them.",
      "What stays public, permanently, and cannot be hidden by this design: your wallet address, the fact that you interacted with the pool, when you did it, how many participants a round has, and the prize amount. Anyone reading Sepolia can see all of that.",
      "Values you reveal are decrypted inside this browser tab and never leave it. They are cleared after five minutes, and immediately when you hide them, switch account, switch network, hide the tab, or reload.",
    ],
  },
  {
    id: "unwrap",
    title: "Unwrapping happens in two steps and can stall",
    body: [
      "Turning the confidential token back into plain test USDC is a request followed by a settlement. The request burns your confidential balance and asks the decryption oracle for the amount; the oracle then calls the token back to release the USDC.",
      "If the oracle is slow or unavailable, the request sits open. Your funds are not lost — they are held by the token contract against a request that only your receiving address can be paid from — but they will not appear in your wallet until the second step lands.",
      "This build detects that state and tells you about it. It cannot finish the step for you: settling it requires a signature set produced by the decryption oracle's key holders, which this app has no way to produce. If a request stays open, check back later; it settles when the oracle catches up.",
    ],
  },
  {
    id: "draw",
    title: "The draw runs in batches and anyone can continue it",
    body: [
      "Picking a winner over encrypted weights costs more computation than one transaction can hold, so a round is closed, snapshotted and scanned in batches. A keeper normally drives this, but every batch call is permissionless: if the keeper stops, any wallet can continue from exactly where it left off and the outcome does not change.",
      "Randomness for a round is drawn once and is never re-rolled. If a scan transaction fails after the seed exists, the fix is to continue the scan, not to draw again — and the contract refuses to draw again anyway.",
    ],
  },
  {
    id: "caps",
    title: "The pool is deliberately small",
    body: [
      "A round holds a fixed maximum number of participants and a per-wallet deposit cap. Both exist because encrypted arithmetic has a hard compute budget per transaction, and because the encrypted types used here overflow silently rather than reverting — so the caps are what keep the maths honest.",
      "A deposit above the per-wallet cap does not fail with an error. The confidential token refuses the transfer as a whole and hands the amount back, so the transaction succeeds while your position stays exactly as it was. Nothing leaves your wallet, but nothing is added either.",
    ],
  },
  {
    id: "testnet",
    title: "Sepolia only, with test money",
    body: [
      "Everything here runs on Ethereum Sepolia against a mock USDC whose faucet is open to anyone. None of it is real money, and none of the balances mean anything outside the testnet.",
      "There is no payroll integration. Deposits happen because you send them, not because a salary arrives; the payday framing is about the habit, not about a connected employer system.",
      "The contract is not upgradeable and there is no administrative path to move your principal. Pausing the pool stops new deposits and nothing else — withdrawing and claiming stay available in every phase, including while paused.",
    ],
  },
] as const;

export default function KnownLimitationsPage() {
  return (
    <div className="mx-auto w-full max-w-[720px] px-4 py-10 sm:py-14">
      <Link href="/" className="text-fg-muted text-[14px] underline underline-offset-4">
        PayDay Pot
      </Link>
      <h1 className="mt-4 text-[30px] leading-tight font-semibold tracking-tight">Known limitations</h1>
      <p className="text-fg-muted mt-3 text-[16px] leading-relaxed">
        The honest list: what this build does not do, what stays visible to everyone no matter what, and what to do when
        something gets stuck. If an error message sent you here, the relevant section is below.
      </p>

      <nav aria-label="On this page" className="border-border-default mt-8 border-t pt-6">
        <ul className="flex flex-wrap gap-x-4 gap-y-2">
          {SECTIONS.map((section) => (
            <li key={section.id}>
              <a href={`#${section.id}`} className="text-[14px] underline underline-offset-4">
                {section.title}
              </a>
            </li>
          ))}
        </ul>
      </nav>

      <div className="mt-10 flex flex-col gap-10">
        {SECTIONS.map((section) => (
          <section key={section.id} id={section.id} className="scroll-mt-6">
            <h2 className="text-[20px] font-semibold tracking-tight">{section.title}</h2>
            {section.body.map((paragraph) => (
              <p key={paragraph.slice(0, 32)} className="text-fg-muted mt-3 text-[15px] leading-relaxed">
                {paragraph}
              </p>
            ))}
          </section>
        ))}
      </div>

      <p className="border-border-default text-fg-muted mt-12 border-t pt-6 text-[14px]">
        Built with Zama FHEVM on Ethereum Sepolia.
      </p>
    </div>
  );
}
