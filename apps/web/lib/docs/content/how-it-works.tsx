import type { DocPageDef } from "../types";

/** Bốn bước — landing hiện `label` + `short`, docs hiện `title` + `body`. Một nguồn. */
export const STEPS = [
  {
    title: "Deposit whatever you want",
    label: "Deposit",
    short: "Encrypted before it leaves your browser.",
    body: "Your deposit is encrypted before it leaves your browser. The pool adds it to your position without ever learning the number — not at deposit time, not later.",
  },
  {
    title: "Your weight builds while it sits",
    label: "Build weight",
    short: "More, for longer, means better odds.",
    body: "Odds are proportional to how much you held and for how long, not to how much you deposited on the last day. Depositing early and leaving it alone is what wins.",
  },
  {
    title: "The round closes and one winner is drawn",
    label: "One is drawn",
    short: "One seed, once, against encrypted weights.",
    body: "Balances are frozen, on-chain randomness is drawn exactly once, and the pool scans the encrypted weights to pick a winner. Nobody, including the pool, learns who won from watching.",
  },
  {
    title: "The winner claims — everyone else keeps everything",
    label: "Everyone keeps theirs",
    short: "Nothing is taken from any deposit.",
    body: "The prize lands as an encrypted balance only the winner can read. Every other saver's deposit is untouched, because the prize was never taken from them in the first place.",
  },
] as const;

export const HOW_IT_WORKS: DocPageDef = {
  slug: "how-it-works",
  title: "How a round works",
  group: "start",
  summary: "Deposit, build weight, close, draw, claim — and why every one of those steps can be run by anyone.",
  source: ["README.md", "docs/DRAW_PROTOCOL.md"],
  sections: [
    {
      id: "four-steps",
      title: "Four steps",
      blocks: [{ kind: "steps", items: STEPS.map((s) => ({ title: s.title, body: s.body })) }],
    },
    {
      id: "phases",
      title: "The four phases of a round",
      blocks: [
        { kind: "figure", id: "round-lifecycle", caption: "One round, four phases. The bottom row never opens, whatever the phase." },
        {
          kind: "p",
          text: "A round moves through four phases on chain. Each transition is a plain function call with no access check: any wallet with gas can send it, and the app exposes every one as a button in the draw room.",
        },
        {
          kind: "table",
          head: ["Phase", "What is happening", "What moves it on"],
          rows: [
            ["Open", "Deposits count toward this round's weight.", "The clock runs out; anyone closes the round."],
            ["Snapshotting", "Each saver's time-weighted balance is frozen, in batches.", "The last batch lands."],
            ["Drawing", "One seed is drawn, then every saver is scanned against it.", "The last scan batch lands."],
            ["Settled", "The result is on chain, encrypted. Winner claims whenever they like.", "Anyone opens the next round."],
          ],
        },
        {
          kind: "callout",
          tone: "neutral",
          title: "An empty round skips the draw",
          text: "If nobody was saving when the round closed, closing it settles it in the same transaction and the sponsored prize rolls over to the next round.",
        },
      ],
    },
    {
      id: "weight",
      title: "Weight is balance multiplied by time",
      blocks: [
        {
          kind: "p",
          text: "The pool keeps, for each saver, an encrypted running total of balance × seconds. Depositing a lot one minute before the round closes buys almost nothing; money that sat there all round counts for the whole round.",
        },
        {
          kind: "p",
          text: "That total is never divided on chain. Dividing every weight by the same round length does not change anyone's odds, so the draw uses the raw area directly. The average balance you see in the app is computed in your browser after decryption, purely so the number reads in USDC.",
        },
      ],
    },
    {
      id: "closing",
      title: "Deposits close on the clock, not on a button",
      blocks: [
        {
          kind: "p",
          text: "Deposits stop counting the moment the round's end time passes, even if nobody has pressed the close button yet. There is no window between the deadline and the snapshot in which a late deposit could slip in.",
        },
        {
          kind: "p",
          text: "Withdrawing is the opposite: it has no gate at all. You can take everything out in any phase — including while weights are being frozen, while the scan is running, and while the pool is paused.",
        },
      ],
    },
    {
      id: "paused",
      title: "What pausing can and cannot do",
      blocks: [
        {
          kind: "p",
          text: "The contract owner can pause the pool. Pausing blocks new deposits and blocks drawing a new seed. It does not block closing a round, freezing weights, continuing a scan, withdrawing, or claiming — pause can never hold anyone's money.",
        },
      ],
    },
  ],
};
