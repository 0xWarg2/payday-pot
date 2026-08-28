"use client";

import { useEffect, useState } from "react";
import { getPot, readEpoch, type EpochView, type PotError, type PotState } from "@payday-pot/sdk";

import { readProvider } from "../chain/rpc";
import { classifyReadError } from "../pot/classify-read-error";
import { potReadsStore, type DeploymentStatus } from "../pot/reads";
import { useStore } from "../store/external-store";

/**
 * Một vòng — hiện tại hoặc quá khứ — với đúng những trạng thái nó thật sự có.
 *
 * `not-found` là nhánh quan trọng nhất và cũng là nhánh dễ quên nhất:
 * `epochInfo(99)` KHÔNG revert. Mapping trả struct rỗng, và struct rỗng đọc ra
 * `phase: Open`, `start: 0`, `end: 0` — nghĩa là `/app/draws/99` sẽ vẽ ra một
 * vòng đang mở nhận tiền, với ngày đóng là 1/1/1970. Nên phải so với
 * `currentEpochId` TRƯỚC khi đọc, không phải sau.
 *
 * Vòng hiện tại đi thẳng từ `potReadsStore` (đã poll sẵn 15s) thay vì đọc lại:
 * hai nguồn cho cùng một con số là hai con số sẽ lệch nhau, và Draw Room là chỗ
 * cuối cùng nên để điều đó xảy ra.
 */
export type EpochLoad =
  | { kind: "loading" }
  | { kind: "not-deployed" }
  | { kind: "mismatch" }
  | { kind: "not-found"; requested: bigint; currentEpochId: bigint }
  | { kind: "error"; error: PotError }
  /** Vòng đang chạy — có cả trạng thái toàn cục, nên keeper panel dùng được. */
  | { kind: "current"; view: EpochView; state: PotState }
  /** Vòng cũ — chỉ đọc. `paused`/`participantCount` cố ý KHÔNG có ở đây. */
  | { kind: "past"; view: EpochView };

export function useEpochView(requested: bigint | null): EpochLoad {
  const reads = useStore(potReadsStore);
  const current = reads.state;
  const currentId = current?.epochId ?? null;

  const [past, setPast] = useState<{ id: string; view: EpochView } | null>(null);
  const [pastError, setPastError] = useState<PotError | null>(null);

  const wantsPast =
    requested !== null && currentId !== null && requested !== currentId && requested >= 1n && requested < currentId;
  const pastKey = wantsPast && requested !== null ? requested.toString() : null;

  useEffect(() => {
    if (pastKey === null) return;
    let alive = true;
    setPast(null);
    setPastError(null);
    void (async () => {
      try {
        const view = await readEpoch(getPot(readProvider()), BigInt(pastKey));
        if (alive) setPast({ id: pastKey, view });
      } catch (e) {
        if (alive) setPastError(classifyReadError(e));
      }
    })();
    return () => {
      alive = false;
    };
  }, [pastKey]);

  const gate = deploymentGate(reads.deployment);
  if (gate) return gate;

  if (current === null) return reads.error ? { kind: "error", error: reads.error } : { kind: "loading" };

  if (requested === null || requested === current.epochId) {
    return { kind: "current", view: current, state: current };
  }
  if (requested < 1n || requested > current.epochId) {
    return { kind: "not-found", requested, currentEpochId: current.epochId };
  }
  if (pastError) return { kind: "error", error: pastError };
  if (past && past.id === requested.toString()) return { kind: "past", view: past.view };
  return { kind: "loading" };
}

function deploymentGate(status: DeploymentStatus): EpochLoad | null {
  if (status === "not-deployed") return { kind: "not-deployed" };
  if (status === "mismatch") return { kind: "mismatch" };
  return null;
}
