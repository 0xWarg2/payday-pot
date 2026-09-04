"use client";

import { Button } from "@/components/ui/Button";
import { formatAmount, shortAddress } from "@/lib/format";
import { assetsStore, hasShielded } from "@/lib/tokens/assets";
import { potReadsStore } from "@/lib/pot/reads";
import { useStore } from "@/lib/store/external-store";
import type { Role } from "@/lib/onboarding/role";
import type { StepId } from "@/lib/onboarding/steps";
import { walletStore } from "@/lib/wallet/store";

const ROLE_NOUN: Record<Role, string> = { employee: "Saver", employer: "Prize sponsor" };

/**
 * Bước 7 — xem lại.
 *
 * Không có gì để gửi ở đây. Contract không có hàm enroll: bạn vào pool bằng
 * khoản gửi đầu tiên, nên một nút "Confirm enrollment" ở màn hình này sẽ là một
 * giao dịch giả để làm cho luồng trông trọn vẹn. Nút ở đây chỉ đóng phần setup.
 *
 * Đổi lại, màn hình này phải làm đúng một việc cho tử tế: nói lại toàn bộ những
 * gì sắp đúng về người dùng, kèm đường sửa cho từng dòng. Một bản tóm tắt không
 * sửa được thì không phải review, nó là màn hình chờ.
 */
export function ReviewStep({
  role,
  onEdit,
  onConfirm,
}: {
  role: Role;
  onEdit: (step: StepId) => void;
  onConfirm: () => void;
}) {
  const wallet = useStore(walletStore);
  const assets = useStore(assetsStore);
  const reads = useStore(potReadsStore);
  const shielded = hasShielded(assets);

  return (
    <div>
      <p className="text-fg-muted max-w-[62ch] text-[16px] leading-relaxed">
        Nothing is sent here. You join with your first deposit — check the lines below first.
      </p>

      <dl className="mt-6 flex flex-col">
        <Row label="Joining as" value={ROLE_NOUN[role]} onEdit={() => onEdit("role")} />
        {/* Không có "Change" ở đây: EIP-1193 không cho trang ngắt kết nối một
            ví. Nói cho người dùng biết chỗ đổi thật sự nằm ở đâu vẫn tốt hơn
            một nút bấm vào rồi không xảy ra gì. */}
        <Row
          label="Address"
          value={wallet.address ? shortAddress(wallet.address) : "Not connected"}
          mono
          note="Switch accounts in your wallet; this page follows."
        />
        <Row label="Network" value="Ethereum Sepolia · test money only" />
        <Row
          label="Pool contract"
          value={reads.config ? shortAddress(reads.config.address) : "Not live yet"}
          mono={Boolean(reads.config)}
        />
        <Row
          label="Shielded USDC"
          value={shielded ? "Present — amount encrypted" : "None yet"}
          note={shielded ? undefined : "Deposits need shielded USDC. You can do this later."}
          onEdit={() => onEdit("assets")}
        />
        <Row
          label="Approved for the shielded token"
          value={assets.allowance === null ? "—" : `${formatAmount(assets.allowance)} USDC`}
          note="On the public test token. Grants no access to anything encrypted."
          onEdit={() => onEdit("assets")}
        />
        <Row
          label="Privacy disclosure"
          value="Read and accepted"
          note="Amounts encrypted; address and timing public."
          onEdit={() => onEdit("consent")}
        />
      </dl>

      <div className="mt-8">
        <Button onClick={onConfirm}>Finish setup</Button>
      </div>
    </div>
  );
}

function Row({
  label,
  value,
  note,
  mono = false,
  onEdit,
}: {
  label: string;
  value: string;
  note?: string;
  mono?: boolean;
  onEdit?: () => void;
}) {
  // Ghi chú luôn xuống dòng riêng. Để nó chung hàng flex với label/value thì
  // flex-shrink bóp nó lại vừa chỗ trống, nên dòng nào chú thích ngắn sẽ nằm
  // cùng hàng còn dòng nào dài mới rớt xuống — cùng một cấu trúc mà trông như
  // hai kiểu khác nhau.
  return (
    <div className="border-border-default border-t py-3">
      <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
        <dt className="text-fg-muted min-w-[180px] text-[13px]">{label}</dt>
        <dd className={`text-[15px] font-medium ${mono ? "font-mono text-[14px]" : ""}`}>{value}</dd>
        {onEdit ? (
          <button
            type="button"
            onClick={onEdit}
            className="text-fg-muted hover:text-fg ml-auto min-h-0 min-w-0 text-[13px] underline underline-offset-4"
          >
            Change
          </button>
        ) : null}
      </div>
      {note ? <dd className="text-fg-muted mt-1 max-w-[60ch] text-[12px] leading-relaxed">{note}</dd> : null}
    </div>
  );
}
