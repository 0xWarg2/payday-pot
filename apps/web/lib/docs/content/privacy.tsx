import type { DocPageDef } from "../types";

export const ENCRYPTED = [
  "How much you deposited",
  "Your balance right now",
  "Your time-weighted odds",
  "Whether you won",
  "How much you won",
] as const;

export const PUBLIC = [
  "Your wallet address",
  "That you interacted with the pool, and when",
  "How many people are in a round",
  "The prize amount for a round",
  "Every rule the pool runs on",
] as const;

/** Câu framing bắt buộc — test pin `/does not make you anonymous/i` trên landing. */
export const NOT_ANONYMOUS =
  "This pool keeps amounts confidential. It does not make you anonymous: your address and your timing stay public.";

export const PRIVACY: DocPageDef = {
  slug: "privacy",
  title: "What is hidden, and what is not",
  group: "guarantees",
  summary: "Amounts are encrypted and only you can open them. Addresses, timing and the prize are public, permanently.",
  source: ["docs/PRIVACY.md", "docs/THREAT_MODEL.md"],
  sections: [
    {
      id: "two-columns",
      title: "Both columns, in full",
      blocks: [
        { kind: "figure", id: "encrypted-vs-public", caption: "Two columns, no third. If it is not in the left column, assume it is public." },
        { kind: "p", text: NOT_ANONYMOUS },
        {
          kind: "compare",
          encrypted: ENCRYPTED,
          public: PUBLIC,
          note: {
            encrypted:
              "Only you hold the permission to decrypt these. Not your employer, not the operator running the draw, not whoever deployed the contract.",
            public:
              "Anyone reading the chain sees these. If linking your address to this pool is itself a problem for you, use an address that is not tied to you.",
          },
        },
      ],
    },
    {
      id: "who-can-decrypt",
      title: "Who holds a decryption permission",
      blocks: [
        { kind: "figure", id: "who-can-decrypt", caption: "The same handle reaches everyone. Only your signature turns yours into a number, and only in your browser." },
        {
          kind: "p",
          text: "Every permission the contract grants goes to the wallet that owns the value, and to nobody else. The employer, the keeper and the contract owner are denied — and that denial is held in place by tests, not by a promise.",
        },
        {
          kind: "table",
          head: ["Value", "Who can open it"],
          rows: [
            ["Your deposit balance", "Only you"],
            ["Your weight in the draw", "Only you"],
            ["Your prize waiting to be claimed", "Only you — and every saver is granted theirs, so opening it does not mark you as the winner"],
            ["Whether you won", "Nobody, including you; the prize balance is how you find out"],
            ["The pool's total balance, total weight and the random seed", "Nobody"],
          ],
        },
        {
          kind: "p",
          text: "Nothing in the contract ever marks a value as publicly decryptable.",
        },
      ],
    },
    {
      id: "in-your-browser",
      title: "Opened values stay in this tab",
      blocks: [
        {
          kind: "p",
          text: "When you reveal a value it is decrypted inside your browser and kept only in memory. It is cleared after five minutes, and immediately when you hide it, switch account, switch network, hide the tab, or reload. It is never written to storage, a URL, analytics, or a log.",
        },
      ],
    },
    {
      id: "sharp-edges",
      title: "Four things that are public and easy to mistake for private",
      blocks: [
        {
          kind: "ul",
          items: [
            "Who deposited, withdrew or claimed, and when. Only the amounts are hidden.",
            "The amount you wrap into the confidential token. That step is the last plaintext before encryption, so wrapping 10,000 and depositing straight after tells an observer roughly what you deposited.",
            "The amount you unwrap back to plain USDC. The token makes that one number publicly decryptable by design — unwrapping winnings right after claiming publishes the pair of address and amount.",
            "The sponsored prize for the current round. It is the sponsor's money, and it is public so they can see what they funded.",
          ],
        },
        {
          kind: "callout",
          tone: "privacy",
          title: "Events carry no amounts",
          text: "Every event the pool emits carries only addresses, round numbers and public counters — never an amount, plaintext or encrypted.",
        },
      ],
    },
  ],
};
