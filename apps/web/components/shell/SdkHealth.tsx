"use client";

import { fheHealthStore } from "@/lib/fhevm/instance";
import { useStore } from "@/lib/store/external-store";
import { NoticeBanner } from "@/components/ui/ErrorPanel";
import { NoSsr } from "@/components/privacy/NoSsr";

/**
 * Sức khoẻ của dịch vụ mã hoá — cảnh báo, không phải chặn.
 *
 * Khi WASM không nạp được thì reveal không chạy, nhưng gửi tiền, rút tiền và
 * xem trạng thái công khai vẫn chạy bình thường. Đó là lý do đây là một dải
 * cảnh báo chứ không phải một màn hình lỗi: mất khả năng NHÌN số dư không đồng
 * nghĩa với mất quyền kiểm soát tiền.
 */
export function SdkHealth() {
  return (
    <NoSsr>
      <SdkHealthInner />
    </NoSsr>
  );
}

function SdkHealthInner() {
  const health = useStore(fheHealthStore);
  if (health.message === null) return null;

  return (
    <div className="mx-auto w-full max-w-[1120px] px-4 pt-4">
      <NoticeBanner
        tone={health.status === "error" ? "warning" : "privacy"}
        title={health.status === "error" ? "Revealing is unavailable right now" : "Decryption may be slow"}
        detail={`${health.message} Your funds and every other action are unaffected.`}
      />
    </div>
  );
}
