import { EncryptedBadge, PublicBadge } from "@/components/ui/Card";

const ENCRYPTED = [
  "How much you deposited",
  "Your balance right now",
  "Your time-weighted odds",
  "Whether you won",
  "How much you won",
] as const;

const PUBLIC = [
  "Your wallet address",
  "That you interacted with the pool, and when",
  "How many people are in a round",
  "The prize amount for a round",
  "Every rule the pool runs on",
] as const;

/**
 * Nói thẳng ra cái KHÔNG được bảo vệ.
 *
 * Đây là section quan trọng nhất trang này. Sản phẩm bảo mật *số tiền*, không
 * bảo mật *danh tính* — address và thời điểm vẫn nằm công khai trên chain mãi
 * mãi. Một người đọc lướt qua chữ "confidential" rất dễ tự suy ra "ẩn danh", và
 * nếu để họ tự phát hiện ra sự thật sau khi đã gửi tiền thì đó là lỗi của trang
 * này chứ không phải của họ. Cột phải dài bằng cột trái là có chủ đích.
 */
export function PrivacyComparison() {
  return (
    <section className="py-14 sm:py-20">
      <h2 className="text-[28px] leading-tight font-semibold tracking-tight sm:text-[34px]">
        What is hidden, and what is not
      </h2>
      <p className="text-fg-muted mt-3 max-w-[60ch] text-[16px] leading-relaxed">
        This pool keeps amounts confidential. It does not make you anonymous, and it would be dishonest to imply
        otherwise — so here is the whole of it, both columns.
      </p>

      <div className="mt-8 grid gap-4 sm:grid-cols-2">
        <div className="border-privacy/30 bg-privacy-subtle rounded-card border p-5 sm:p-6">
          <EncryptedBadge>Encrypted on chain</EncryptedBadge>
          <ul className="mt-4 flex flex-col gap-3">
            {ENCRYPTED.map((item) => (
              <li key={item} className="text-[15px] leading-snug">
                {item}
              </li>
            ))}
          </ul>
          <p className="text-fg-muted mt-5 text-[13px] leading-relaxed">
            Only you hold the permission to decrypt these. Not your employer, not the operator running the draw, not
            whoever deployed the contract.
          </p>
        </div>

        <div className="border-border-default bg-surface rounded-card border p-5 sm:p-6">
          <PublicBadge>Public forever</PublicBadge>
          <ul className="mt-4 flex flex-col gap-3">
            {PUBLIC.map((item) => (
              <li key={item} className="text-[15px] leading-snug">
                {item}
              </li>
            ))}
          </ul>
          <p className="text-fg-muted mt-5 text-[13px] leading-relaxed">
            Anyone reading the chain sees these. If linking your address to this pool is itself a problem for you, use
            an address that is not tied to you.
          </p>
        </div>
      </div>
    </section>
  );
}
