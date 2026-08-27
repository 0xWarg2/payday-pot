"use client";

import { useEffect, useState } from "react";

import { Button } from "@/components/ui/Button";
import type { EncryptPhase } from "@/lib/fhevm/encrypt";

/**
 * Mười giây mã hoá, và người dùng phải hiểu mình đang chờ cái gì.
 *
 * Đo được 9752 ms cho một `add64().encrypt()` trên relayer thật (quirk #25).
 * Một spinner trần ở đây là lỗi sản phẩm chứ không phải chuyện thẩm mỹ: mười
 * giây không giải thích thì người dùng sẽ bấm lại, và bấm lại nghĩa là mã hoá
 * hai lần — chậm hơn, không nhanh hơn.
 *
 * Nên: nói tên việc đang làm, đếm giây đã trôi (không phải progress bar giả —
 * ta không biết còn bao lâu, và một thanh chạy đến 90% rồi đứng còn tệ hơn),
 * và luôn có nút huỷ kèm câu khẳng định đúng: ở bước này **chưa có tx nào**.
 */
const PHASE_COPY: Record<EncryptPhase, string> = {
  starting: "Starting the encryption service in your browser…",
  encrypting: "Encrypting your amount and building its proof…",
  done: "Encrypted.",
};

export function EncryptProgress({ phase, onCancel }: { phase: EncryptPhase; onCancel: () => void }) {
  const elapsed = useElapsedSeconds();

  return (
    <div className="border-privacy/30 bg-privacy-subtle rounded-card border p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p role="status" className="flex items-center gap-2 text-[14px] font-medium">
            <span
              aria-hidden="true"
              className="border-privacy size-3 shrink-0 animate-spin rounded-full border-2 border-t-transparent"
            />
            {PHASE_COPY[phase]}
          </p>
          <p className="text-fg-muted mt-2 text-[13px] leading-relaxed">
            This normally takes about ten seconds and happens entirely on your device. Your wallet has not been asked
            for anything yet, so there is no transaction to lose.
          </p>
          <p className="text-fg-muted tabular mt-2 text-[12px]">{elapsed}s elapsed</p>
        </div>
        <Button size="sm" variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </div>
  );
}

function useElapsedSeconds(): number {
  const [seconds, setSeconds] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => clearInterval(id);
  }, []);
  return seconds;
}
