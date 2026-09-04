import type { DocPageDef } from "../types";

/**
 * Trang setup — chỗ để CHỮ đi, để onboarding trong app chỉ còn một câu mỗi bước
 * và một link "Guide →" trỏ về đây. Mỗi bước gọi đúng tên nút thật trong app.
 */
export const GET_STARTED: DocPageDef = {
  slug: "get-started",
  title: "Get set up in two minutes",
  group: "start",
  summary: "A wallet, a test network, some test USDC, one shield, one deposit. Four ordinary transactions and one encrypted one.",
  source: ["apps/web/components/onboarding/"],
  sections: [
    {
      id: "before-you-start",
      title: "Before you start",
      blocks: [
        {
          kind: "callout",
          tone: "neutral",
          title: "You need two things",
          text: "A browser wallet such as MetaMask, and a little Sepolia ETH for gas from any public faucet. No account, no email, no sign-up — the wallet is the account.",
        },
        { kind: "p", text: "Everything here runs on Ethereum Sepolia, a test network. Nothing you do can cost real money." },
      ],
    },
    {
      id: "steps",
      title: "The five steps",
      blocks: [
        { kind: "figure", id: "setup-path", caption: "Four ordinary transactions, then one encrypted one. About two minutes." },
        {
          kind: "steps",
          items: [
            { title: "Connect a wallet", body: "Open the app and press Connect. Pick the account you want to save from." },
            { title: "Switch to Sepolia", body: "If the wallet is on another network, press Switch to Sepolia and approve the change." },
            { title: "Get test USDC", body: "Press Get 1,000 test USDC. It is play money minted by a faucet — the amount is public." },
            { title: "Shield it", body: "Two clicks: Approve, then Shield. From here on the balance is encrypted. The amount you shield is the last public number." },
            { title: "Deposit", body: "Type an amount and press Deposit. It is encrypted in your browser before it leaves; the chain sees only a handle." },
          ],
        },
      ],
    },
    {
      id: "one-public-number",
      title: "The one public number",
      blocks: [
        {
          kind: "callout",
          tone: "warning",
          title: "Shielding is a normal transaction",
          text: "The amount you shield is visible on the explorer, and anyone can read it. Only what happens after — your deposit, your balance, your odds, your winnings — is encrypted. If that matters to you, shield more than you plan to deposit, or shield in several rounds.",
        },
        { kind: "p", text: "The privacy page lists every sharp edge like this one, in full." },
        { kind: "cards", items: [{ title: "What is hidden, and what is not →", body: "Both columns, including the four things that are public and easy to mistake for private.", href: "/docs/privacy#sharp-edges" }] },
      ],
    },
    {
      id: "after-setup",
      title: "After setup",
      blocks: [
        {
          kind: "cards",
          items: [
            { title: "Make your first deposit", body: "The dashboard shows your position, the next draw and your history — amounts stay behind a signature.", href: "/app" },
            { title: "Fund a prize", body: "Sponsors put up the prize in the open. The Sponsor page shows the pot and how to add to it.", href: "/employer" },
          ],
        },
      ],
    },
    {
      id: "if-something-breaks",
      title: "If something breaks",
      blocks: [
        {
          kind: "table",
          head: ["You see", "What to do"],
          rows: [
            ["Wrong network", "Press Switch to Sepolia. The app will not send anything to another chain."],
            ["Token blocked / faucet says no", "The test token has a per-wallet limit. See the testnet limits."],
            ["Pending unwrap", "Turning shielded USDC back into plain USDC is the token's own two-step process. See what the app can and cannot do about it."],
            ["A value shows dots, not a number", "It is hidden, not zero. Press Reveal and sign; the number lives in your browser for five minutes."],
          ],
        },
        {
          kind: "cards",
          items: [
            { title: "Testnet limits →", body: "Faucet caps, wrapper quirks, and what the mock token will refuse.", href: "/docs/known-limitations#testnet" },
            { title: "Stuck unwrap →", body: "Where an unwrap can pause and what the banner in the app is telling you.", href: "/docs/known-limitations#unwrap" },
          ],
        },
      ],
    },
  ],
};
