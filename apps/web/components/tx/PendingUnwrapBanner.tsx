"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

import { SEPOLIA_CHAIN_ID } from "@/lib/chain/rpc";
import { useStore } from "@/lib/store/external-store";
import { findPendingUnwraps, type PendingUnwrap } from "@/lib/tx/pending-unwrap";
import { txRecordsFor, txStore } from "@/lib/tx/store";
import { Button } from "@/components/ui/Button";
import { EXPLORER } from "./TxRow";

/**
 * R1 — unwrap hai bước bị bỏ dở.
 *
 * `unwrap` trên cUSDC không trả tiền ngay: nó tạo một yêu cầu, KMS ký, rồi ai đó
 * phải gọi `finalizeUnwrap`. Đóng tab giữa hai bước là chuyện rất dễ xảy ra, và
 * hậu quả trông giống hệt "tiền bốc hơi" nếu app im lặng.
 *
 * Hôm nay banner này chỉ PHÁT HIỆN và nói ra sự thật; nút hoàn tất tự động cần
 * chữ ký KMS mà relayer SDK chưa chắc phơi ra, nên nó là việc của Day 8. Nói
 * thẳng ra như vậy vẫn tốt hơn nhiều so với một nút bấm vào thì không có gì xảy
 * ra — và "Check again" cho người dùng cách tự xác nhận khi trạng thái đổi.
 */
const EMPTY: PendingUnwrap[] = [];

export function PendingUnwrapBanner() {
  const snapshot = useStore(txStore);
  const [pending, setPending] = useState<PendingUnwrap[]>(EMPTY);
  const [checking, setChecking] = useState(false);

  // Khoá theo NỘI DUNG, không theo identity. `txRecordsFor` filter ra một mảng
  // mới mỗi lần render; lấy mảng đó làm dependency thì `check` được dựng lại mỗi
  // render, effect chạy lại, setState, render tiếp — vòng lặp vô hạn chứ không
  // phải một lần fetch thừa.
  const hashes = txRecordsFor(snapshot, SEPOLIA_CHAIN_ID, "unwrap")
    .map((r) => r.txHash)
    .join(",");

  const check = useCallback(async () => {
    const list = hashes === "" ? [] : hashes.split(",");
    if (list.length === 0) {
      setPending((prev) => (prev.length === 0 ? prev : EMPTY));
      return;
    }
    setChecking(true);
    try {
      const found = await findPendingUnwraps(list);
      // Giữ nguyên reference khi kết quả không đổi: banner này poll lại mỗi lần
      // tx status đổi, và một mảng mới có cùng nội dung vẫn làm cả cây render.
      setPending((prev) => (sameUnwraps(prev, found) ? prev : found));
    } finally {
      setChecking(false);
    }
  }, [hashes]);

  useEffect(() => {
    void check();
  }, [check]);

  if (pending.length === 0) return null;
  const first = pending[0];

  return (
    <div className="border-warning/30 bg-warning/5 rounded-card flex flex-col gap-3 border p-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        <p className="text-[14px] font-semibold">
          {pending.length === 1 ? "An unwrap is waiting to finish" : `${pending.length} unwraps are waiting to finish`}
        </p>
        <p className="text-fg-muted mt-1 text-[13px] leading-relaxed">
          Unwrapping runs in two steps. The first one went through; the second has not settled yet, so the USDC has not
          landed in your wallet. Nothing is lost — the request stays open on the token contract.{" "}
          {first ? (
            <a
              href={`${EXPLORER}/tx/${first.txHash}`}
              target="_blank"
              rel="noreferrer"
              className="underline underline-offset-4"
            >
              View the request
            </a>
          ) : null}
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <Link
          data-cta
          href="/docs/known-limitations#unwrap"
          className="rounded-control border-border-default bg-surface inline-flex items-center px-3 text-[14px] font-medium"
        >
          What to do
        </Link>
        <Button size="sm" variant="secondary" loading={checking} onClick={() => void check()}>
          Check again
        </Button>
      </div>
    </div>
  );
}

function sameUnwraps(a: readonly PendingUnwrap[], b: readonly PendingUnwrap[]): boolean {
  return a.length === b.length && a.every((item, i) => item.txHash === b[i]?.txHash);
}
