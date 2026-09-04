import type { DocPageDef } from "../types";

export const PROMISES = [
  {
    title: "The prize is not your neighbour's money",
    label: "Not your money at stake",
    short: "A sponsor funds the prize.",
    body: "It is sponsored — an employer funds the prize for a round out of its own pocket. Nothing is skimmed from deposits to pay it, which is why losing a round costs you exactly nothing.",
  },
  {
    title: "Withdrawing always works",
    label: "Withdraw any time",
    short: "Every phase, even while paused.",
    body: "In every phase of every round, including while the pool is paused and while a draw is in progress. There is no lock-up, no notice period, and no state in which the withdraw button is disabled.",
  },
  {
    title: "Nobody can take your deposit",
    label: "No one can take it",
    short: "No upgrades, no admin key to your savings.",
    body: "The contract cannot be upgraded and has no administrative path to move your principal. Pausing stops new deposits — that is all pausing can do.",
  },
] as const;

/** Bản một dòng cho landing. Bản đầy đủ (`YIELD_CAVEAT`) nằm trong docs. */
export const YIELD_CAVEAT_SHORT = "Sponsored, not yield: the seam for a real yield source is empty in this build.";

export const YIELD_CAVEAT =
  "The prize is sponsored, not generated: the contract has an adapter seam for a real yield source, but none is connected in this build.";

export const PRIZE_AND_SPONSORS: DocPageDef = {
  slug: "prize-and-sponsors",
  title: "Where the prize comes from",
  group: "guarantees",
  summary: "The prize is employer-funded sponsored yield, no deposit is ever spent on it, and nothing in this build earns yield.",
  source: ["README.md", "docs/KNOWN_LIMITATIONS.md"],
  sections: [
    {
      id: "sponsored",
      title: "A sponsor writes the cheque",
      blocks: [
        { kind: "figure", id: "prize-source", caption: "The prize comes from the top row. The bottom row is never spent, and can be withdrawn in any phase." },
        {
          kind: "p",
          text: "An employer — or any sponsor — funds the prize for a round by sending public USDC into the pool, which wraps it into the confidential token. That transfer is the allocation: the pool can never promise a prize that no token backs.",
        },
        {
          kind: "p",
          text: "The prize amount is public on purpose. It is the sponsor's money, not any saver's, and the sponsor needs to see it to know how much more to fund.",
        },
        {
          kind: "callout",
          tone: "prize",
          title: "Sponsored, not generated",
          text: YIELD_CAVEAT,
        },
      ],
    },
    {
      id: "no-loss",
      title: "Why losing a round costs nothing",
      blocks: [{ kind: "cards", items: PROMISES.map((p) => ({ title: p.title, body: p.body })) }],
    },
    {
      id: "no-yield",
      title: "There is no yield strategy in this contract",
      blocks: [
        {
          kind: "p",
          text: "Deposits sit in the pool as confidential USDC and are not put to work: no lending market, no staking, no rehypothecation. Calling the prize “generated yield” would be false, so the app does not.",
        },
        {
          kind: "p",
          text: "What is real is the seam. Prize funding is the only way value enters the prize, and it takes plain USDC. A real yield source would plug in there, and would have to:",
        },
        {
          kind: "ul",
          items: [
            "Hold the principal without breaking withdraw-anytime — either a liquidity buffer or a disclosed withdrawal delay.",
            "Realise into plain USDC before funding; the prize path refuses to fund out of an unrealised position.",
            "Never receive a decryption grant on any per-saver value. It may see the pool's aggregate, nothing more.",
            "Survive a loss without touching principal accounting, which today is strictly one to one.",
          ],
        },
      ],
    },
    {
      id: "rollover",
      title: "Unclaimed and unspent prize money",
      blocks: [
        {
          kind: "p",
          text: "If a round closes with nobody saving, its prize rolls over to the next round. A winner's prize waits as an encrypted balance until they claim it — there is no deadline, and it survives the pool moving on to new rounds.",
        },
      ],
    },
  ],
};
