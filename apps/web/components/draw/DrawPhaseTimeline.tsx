import type { DrawStage } from "@/lib/draw/room";

/**
 * Năm mốc, tất cả đều công khai.
 *
 * Đây là bản dịch của cursor onchain sang tiếng người — và là toàn bộ nội dung
 * của Draw Room mà người xem có thể tự kiểm chứng bằng một block explorer. Vì
 * vậy nó là `<ol>`: thứ tự có ý nghĩa, và một screen reader cần biết "bước 3
 * trên 5" chứ không phải một đống div phát sáng.
 *
 * Trạng thái được mã hoá bằng CHỮ (`aria-label` và nhãn nhìn thấy được), không
 * chỉ bằng màu — chấm sáng một mình thì người không phân biệt được màu sẽ không
 * đọc ra được mốc nào đang chạy.
 */
export function DrawPhaseTimeline({ stages }: { stages: readonly DrawStage[] }) {
  return (
    <ol className="flex flex-col gap-4" data-testid="draw-timeline">
      {stages.map((stage) => (
        <li key={stage.id} data-testid={`draw-stage-${stage.id}`} data-status={stage.status} className="flex gap-3">
          <StageDot status={stage.status} />
          <div className="min-w-0 flex-1">
            <p className="flex flex-wrap items-baseline gap-x-2 text-[14px] font-medium">
              {stage.label}
              <span className="text-draw-fg-muted text-[12px] font-normal">{STATUS_WORD[stage.status]}</span>
            </p>
            <p className="text-draw-fg-muted mt-0.5 max-w-[62ch] text-[13px] leading-relaxed">{stage.detail}</p>
            {stage.progress ? <Progress done={stage.progress.done} total={stage.progress.total} /> : null}
          </div>
        </li>
      ))}
    </ol>
  );
}

const STATUS_WORD: Record<DrawStage["status"], string> = {
  done: "· done",
  active: "· in progress",
  upcoming: "· not started",
};

function StageDot({ status }: { status: DrawStage["status"] }) {
  const fill =
    status === "done" ? "bg-privacy" : status === "active" ? "bg-draw-violet" : "bg-draw-border";
  return (
    <span aria-hidden="true" className="mt-1.5 flex flex-col items-center gap-1">
      <span className={`size-2.5 rounded-full ${fill}`} />
    </span>
  );
}

/**
 * Tiến độ = hai con số onchain, hiện ra nguyên vẹn.
 *
 * Cố ý KHÔNG làm phần trăm làm tròn: "58%" không đối chiếu được với bất cứ thứ
 * gì trên explorer, còn "7 of 12" thì đối chiếu được thẳng với `snapshotProgress`.
 * Thanh bar chỉ là hình minh hoạ cho hai con số đó.
 */
function Progress({ done, total }: { done: number; total: number }) {
  const ratio = total > 0 ? Math.min(1, done / total) : 0;
  return (
    <div className="mt-2 max-w-[260px]">
      <p className="tabular text-draw-fg-muted text-[12px]" data-testid="draw-progress">
        {done} of {total} savers
      </p>
      <div
        role="progressbar"
        aria-valuenow={done}
        aria-valuemin={0}
        aria-valuemax={total}
        aria-label="Savers processed"
        className="bg-draw-border mt-1.5 h-1 w-full overflow-hidden rounded-full"
      >
        <div className="bg-privacy h-full rounded-full" style={{ width: `${ratio * 100}%` }} />
      </div>
    </div>
  );
}
