import { STEP_ORDER, STEP_SHORT_LABELS, TOTAL_STEPS, type StepId, stepIndex, stepNumber } from "@/lib/onboarding/steps";

/**
 * Tiến độ onboarding.
 *
 * Con số "Step n of 8" nằm trong một `<p>` có id, và `<h1>` của bước trỏ tới nó
 * bằng `aria-describedby`. Nhờ vậy lúc focus nhảy sang tiêu đề bước mới, screen
 * reader đọc "Switch to Sepolia, step 3 of 8" trong một hơi — thay vì phải bắn
 * một `aria-live` riêng, thứ hoặc chen ngang hoặc bị nuốt mất tuỳ trình đọc.
 *
 * Danh sách chấm là `aria-hidden`: nó lặp lại đúng thông tin của con số kia
 * bằng hình ảnh, và bắt người dùng screen reader nghe lại tám nhãn mỗi lần đổi
 * bước là làm phiền chứ không phải làm cho dễ tiếp cận.
 */
export function Stepper({ current, countId }: { current: StepId; countId: string }) {
  const index = stepIndex(current);
  const percent = Math.round((index / (TOTAL_STEPS - 1)) * 100);

  return (
    <div>
      <p id={countId} className="text-fg-muted text-[13px]">
        Step {stepNumber(current)} of {TOTAL_STEPS}
      </p>

      <div aria-hidden="true" className="bg-subtle mt-3 h-[3px] w-full overflow-hidden rounded-full sm:hidden">
        <div
          className="bg-action h-full rounded-full transition-[width] duration-(--duration-panel) ease-(--ease-ui)"
          style={{ width: `${percent}%` }}
        />
      </div>

      <ol aria-hidden="true" className="mt-3 hidden flex-wrap items-center gap-x-2 gap-y-2 sm:flex">
        {STEP_ORDER.map((step, i) => {
          const done = i < index;
          const active = i === index;
          return (
            <li key={step} className="flex items-center gap-2">
              <span
                className={[
                  "inline-flex size-[22px] items-center justify-center rounded-full text-[11px] font-semibold",
                  done
                    ? "bg-action text-on-action"
                    : active
                      ? "border-fg text-fg border-2"
                      : "bg-subtle text-fg-muted",
                ].join(" ")}
              >
                {done ? "✓" : i + 1}
              </span>
              <span className={active ? "text-fg text-[13px] font-medium" : "text-fg-muted text-[13px]"}>
                {STEP_SHORT_LABELS[step]}
              </span>
              {i < TOTAL_STEPS - 1 ? <span className="bg-border-default ml-1 h-px w-4" /> : null}
            </li>
          );
        })}
      </ol>
    </div>
  );
}
