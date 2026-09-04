import type { DocPageDef } from "../types";

export const DRAW_AND_FAIRNESS: DocPageDef = {
  slug: "draw-and-fairness",
  title: "The draw, and how to check it",
  group: "guarantees",
  summary: "One seed, drawn once. The same work for every saver. Every step public, resumable by anyone, and readable from the chain.",
  source: ["docs/DRAW_PROTOCOL.md", "docs/THREAT_MODEL.md"],
  sections: [
    {
      id: "one-seed",
      title: "One seed, once",
      blocks: [
        {
          kind: "p",
          text: "Randomness for a round is drawn on chain exactly once and cannot be drawn again — the contract refuses. If a scan transaction fails after the seed exists, the fix is to send the scan again: it continues from the same cursor and lands on the same result.",
        },
        {
          kind: "callout",
          tone: "privacy",
          title: "The seed is encrypted",
          text: "Nobody can read it, including the pool. Revealing it would reveal where the winner sits in the running total of weights, which would reveal weights.",
        },
      ],
    },
    {
      id: "same-work",
      title: "The same work for every saver",
      blocks: [
        { kind: "figure", id: "draw-scan", caption: "Every saver goes through the identical encrypted comparison. The result is a sealed flag each saver opens alone." },
        {
          kind: "p",
          text: "The scan never branches on an encrypted value. Each saver costs the same fixed set of encrypted operations whether they won or not, so the gas and compute of a scan say nothing about the outcome.",
        },
        {
          kind: "p",
          text: "Claiming works the same way: winner and non-winner call the same function, pay the same gas, and both succeed. The non-winner receives an encrypted zero. If claiming failed for non-winners, the failure itself would announce who won.",
        },
      ],
    },
    {
      id: "batches",
      title: "Batches, cursors, and who may continue",
      blocks: [
        {
          kind: "p",
          text: "Freezing weights and scanning the pool each run in batches because encrypted arithmetic has a hard compute budget per transaction. Progress is a public cursor on chain — “8 of 32” means exactly that — and any wallet can send the next batch. A keeper normally does; if it stops, nothing waits on it.",
        },
      ],
    },
    {
      id: "receipt",
      title: "Reading the receipt",
      blocks: [
        {
          kind: "p",
          text: "The draw room shows a fairness receipt for each round, built from the pool's public events. Every line links to the explorer, so you can check it without trusting this app.",
        },
        {
          kind: "table",
          head: ["Event", "What it proves"],
          rows: [
            ["Round opened", "When the round started and when deposits stop counting."],
            ["Sponsor funded the prize", "The prize came from the sponsor's wallet, not from deposits."],
            ["Round closed with N savers frozen in", "Who was in the round was fixed at the deadline."],
            ["Weights frozen up to saver N", "Every saver's weight was frozen, batch by batch."],
            ["Random seed drawn — once", "There is exactly one of these per round."],
            ["Pool scanned up to saver N", "The scan covered everyone, in order."],
            ["Round settled", "The result was sealed in the same transaction as the last scan."],
          ],
        },
      ],
    },
    {
      id: "what-you-cannot-check",
      title: "What you cannot check from outside",
      blocks: [
        {
          kind: "p",
          text: "You cannot tell who won by reading the chain, and neither can the pool's operators — that is the point. What you can check is that the seed was drawn once, that every saver was frozen and scanned, and that the winner's claim and everyone else's claim look identical.",
        },
      ],
    },
  ],
};
