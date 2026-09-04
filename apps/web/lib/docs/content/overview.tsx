import type { DocPageDef } from "../types";
import { STEPS } from "./how-it-works";
import { NOT_ANONYMOUS } from "./privacy";

export const OVERVIEW: DocPageDef = {
  slug: "overview",
  title: "What PayDay Pot is",
  group: "start",
  summary: "A prize-savings pool where balances are encrypted, one saver wins a sponsored prize each round, and nobody loses a cent.",
  source: ["README.md"],
  sections: [
    {
      id: "what-it-is",
      title: "In one paragraph",
      blocks: [
        {
          kind: "p",
          text: "Savers deposit confidential USDC into a shared pool. Each round, one saver wins a prize that a sponsor has funded — everyone else keeps their full deposit. How much anyone holds, how much weight they have in the draw, and how much a winner won are encrypted on chain; only the owner of each value can open it.",
        },
        { kind: "callout", tone: "privacy", title: "Confidential, not anonymous", text: NOT_ANONYMOUS },
        { kind: "figure", id: "encrypted-vs-public", caption: "Left column: only the wallet that owns the value can open it. Right column: on chain, forever, for anyone." },
      ],
    },
    {
      id: "in-one-minute",
      title: "A round in one minute",
      blocks: [
        { kind: "steps", items: STEPS.map((s) => ({ title: s.title, body: s.body })) },
      ],
    },
    {
      id: "try-it",
      title: "Try it",
      blocks: [
        { kind: "figure", id: "setup-path", caption: "Four ordinary transactions, then one encrypted one. About two minutes." },
        {
          kind: "table",
          head: ["", ""],
          rows: [
            ["Network", "Ethereum Sepolia — a test network"],
            ["You need", "A browser wallet and a little Sepolia ETH for gas"],
            ["Test USDC", "Given to you during setup"],
            ["Sign-up", "None — no account, no email"],
          ],
        },
        { kind: "p", text: "Everything on this network is test money. Nothing you do here can cost you real funds." },
        { kind: "cards", items: [{ title: "Start setup →", body: "Connect a wallet, get test USDC, and make a first deposit in about two minutes.", href: "/onboarding" },
            { title: "Read the setup guide →", body: "Each step, the button it uses, and the one number that stays public.", href: "/docs/get-started" }] },
      ],
    },
    {
      id: "what-this-is-not",
      title: "What this is not",
      blocks: [
        {
          kind: "ul",
          items: [
            "Not anonymous. Your address and when you acted are public; only amounts are hidden.",
            "No real yield. The prize is sponsored by an employer, not earned on deposits. The contract has a seam where a yield source could plug in; none is connected.",
            "No payroll integration. Nothing is connected to a payroll system, and the app never claims otherwise — the name describes the habit, not a wiring.",
            "No admin escape hatch. The contract cannot be upgraded and has no function that moves anyone's principal.",
            "No unwrap flow of its own. Turning confidential USDC back into plain USDC is the token's two-step process, and the app can only show you where it stands.",
          ],
        },
      ],
    },
    {
      id: "read-next",
      title: "Read next",
      blocks: [
        {
          kind: "cards",
          items: [
            { title: "How a round works", body: "Deposit, weight, close, draw, claim — and why any wallet can run every step.", href: "/docs/how-it-works" },
            { title: "Where the prize comes from", body: "A sponsor writes the cheque. No deposit is spent on it.", href: "/docs/prize-and-sponsors" },
            { title: "What is hidden, and what is not", body: "Both columns, in full — including the four things that are public and easy to mistake for private.", href: "/docs/privacy" },
            { title: "The draw, and how to check it", body: "One seed, drawn once. Same work for every saver. A receipt you can verify without this app.", href: "/docs/draw-and-fairness" },
            { title: "Contracts and parameters", body: "Addresses, the live pool's numbers, and how to run it yourself.", href: "/docs/contracts" },
            { title: "Known limitations", body: "What this build does not do and what to do when something gets stuck.", href: "/docs/known-limitations" },
          ],
        },
      ],
    },
  ],
};
