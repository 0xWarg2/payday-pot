"use client";

import { useEffect, useState } from "react";
import type { EpochView } from "@payday-pot/sdk";

import { DrawButton, DrawCard, DrawCardHeader, DrawNotice, DrawPublicBadge } from "./DrawSurface";
import { explorerAddress, explorerTx, readFairnessReceipt, type ReceiptResult } from "@/lib/draw/receipt";
import { formatAbsolute, formatAmount, shortHash } from "@/lib/format";

/**
 * Tab bằng chứng.
 *
 * Nguyên tắc: mỗi dòng ở đây phải đối chiếu được với một thứ ngoài màn hình
 * này. Bảng trên cùng là các view công khai của contract; danh sách dưới là log
 * thật, mỗi dòng một tx hash bấm được. Nếu một dòng không kiểm chứng được thì
 * nó không thuộc về tab này — nó là quảng cáo.
 *
 * Và phần "cái gì KHÔNG ở đây" cũng là bằng chứng. Một biên lai công bằng mà im
 * lặng về những gì nó không chứng minh được thì đang mời người đọc tự suy ra
 * nhiều hơn sự thật.
 */
export function FairnessReceipt({ view, potAddress }: { view: EpochView; potAddress: string | null }) {
  const [result, setResult] = useState<ReceiptResult | null>(null);
  const [nonce, setNonce] = useState(0);
  const epochId = view.epochId;

  useEffect(() => {
    let alive = true;
    setResult(null);
    void readFairnessReceipt(epochId).then((r) => {
      if (alive) setResult(r);
    });
    return () => {
      alive = false;
    };
  }, [epochId, nonce]);

  return (
    <div className="flex flex-col gap-5">
      <DrawCard data-testid="fairness-facts">
        <DrawCardHeader
          title={`Round ${epochId} on chain`}
          hint="Every value here is readable by anyone from the contract, with no permission and no account."
          action={<DrawPublicBadge />}
        />
        <dl className="grid gap-x-6 gap-y-4 sm:grid-cols-2">
          <Fact label="Pool contract">
            {potAddress ? (
              <a
                href={explorerAddress(potAddress)}
                target="_blank"
                rel="noreferrer noopener"
                className="font-mono break-all underline underline-offset-4"
              >
                {potAddress}
              </a>
            ) : (
              "—"
            )}
          </Fact>
          <Fact label="Prize (public by design)">{formatAmount(view.prizeAmount)} USDC</Fact>
          <Fact label="Deposits open">{formatAbsolute(view.start)}</Fact>
          <Fact label="Deposits close">{formatAbsolute(view.end)}</Fact>
          <Fact label="Weights frozen">
            <span className="tabular">
              {view.snapshot.cursor} of {view.snapshot.total}
            </span>
          </Fact>
          <Fact label="Pool scanned">
            <span className="tabular">
              {view.draw.cursor} of {view.draw.total}
            </span>
          </Fact>
          <Fact label="Seed drawn">{view.draw.drawn ? "Yes — once, and it cannot be redrawn" : "Not yet"}</Fact>
          <Fact label="Stage">{view.phase}</Fact>
        </dl>
      </DrawCard>

      <DrawCard data-testid="fairness-log">
        <DrawCardHeader
          title="What the chain recorded"
          hint="Round lifecycle only. Each line links to the transaction that produced it."
        />
        {result === null ? (
          <p className="text-draw-fg-muted text-[13px]">Reading the logs…</p>
        ) : result.kind === "unavailable" ? (
          <DrawNotice tone="warning" title="Logs could not be loaded here">
            {result.reason}{" "}
            {potAddress ? (
              <a
                href={explorerAddress(potAddress)}
                target="_blank"
                rel="noreferrer noopener"
                className="text-draw-fg underline underline-offset-4"
              >
                Open the contract on Etherscan
              </a>
            ) : null}
            <span className="mt-3 block">
              <DrawButton size="sm" variant="secondary" onClick={() => setNonce((n) => n + 1)}>
                Try again
              </DrawButton>
            </span>
          </DrawNotice>
        ) : result.events.length === 0 ? (
          <p className="text-draw-fg-muted text-[13px] leading-relaxed">
            Nothing has been recorded for this round yet.
          </p>
        ) : (
          <ol className="flex flex-col gap-3">
            {result.events.map((e) => (
              <li key={`${e.txHash}-${e.name}-${e.blockNumber}`} className="flex flex-wrap items-baseline gap-x-3">
                <span className="text-[14px]">{e.label}</span>
                <a
                  href={explorerTx(e.txHash)}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="text-draw-fg-muted font-mono text-[12px] underline underline-offset-4"
                >
                  {shortHash(e.txHash)}
                </a>
                <span className="tabular text-draw-fg-muted text-[12px]">block {e.blockNumber}</span>
              </li>
            ))}
          </ol>
        )}
      </DrawCard>

      <DrawCard data-testid="fairness-absences">
        <DrawCardHeader title="What this receipt deliberately does not contain" />
        <ul className="text-draw-fg-muted flex list-disc flex-col gap-2 pl-5 text-[13px] leading-relaxed">
          <li>
            <span className="text-draw-fg">No winner.</span> The pool never learns who won in the clear — the result is
            written encrypted to every saver at once, and only its owner can open it.
          </li>
          <li>
            <span className="text-draw-fg">No amounts.</span> Deposits, balances and winnings never appear in a log.
            The one number that is public is the sponsor&rsquo;s prize, because it is the sponsor&rsquo;s money.
          </li>
          <li>
            <span className="text-draw-fg">No roster.</span> Deposits, withdrawals and claims are on chain and anyone
            can query them, but this page does not assemble them next to the draw — putting those two lists side by side
            is exactly the inference this product exists to prevent.
          </li>
          <li>
            <span className="text-draw-fg">Addresses and timing are still public.</span> That is true of every
            transaction on a public chain, and no amount of encryption changes it.
          </li>
        </ul>
      </DrawCard>
    </div>
  );
}

function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-draw-fg-muted text-[13px]">{label}</dt>
      <dd className="mt-1 text-[14px] break-words">{children}</dd>
    </div>
  );
}
