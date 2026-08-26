import Link from "next/link";

import { OnboardingFlow } from "@/components/onboarding/OnboardingFlow";
import { AppProviders } from "@/components/shell/AppProviders";
import { TxCenter } from "@/components/tx/TxCenter";

export const metadata = {
  title: "Set up · PayDay Pot",
  description: "Join a confidential prize-savings pool on Ethereum Sepolia.",
};

/**
 * Onboarding nằm NGOÀI route group `(shell)` — cố ý.
 *
 * App chrome (nav, wallet pill, network banner) tồn tại để điều hướng giữa các
 * màn hình. Ở đây chỉ có đúng một việc phải làm, và mỗi phần chrome thêm vào là
 * thêm một chỗ để bỏ dở giữa chừng. §7 gọi đúng cái này: một việc trên một màn
 * hình, nội dung tối đa 880px.
 *
 * Vẫn giữ `AppProviders` (khôi phục ví, listener, guard xoá reveal) và
 * `TxCenter` — bước 6 gửi tới ba giao dịch, và một người vừa ký xong mà không
 * thấy dấu vết nào của nó thì sẽ ký lại lần nữa.
 */
export default function OnboardingPage() {
  return (
    <AppProviders>
      <div className="mx-auto w-full max-w-[880px] px-4 pb-24">
        <header className="border-border-default flex items-center justify-between border-b py-4">
          <Link href="/" className="text-[15px] font-semibold tracking-tight">
            PayDay Pot
          </Link>
          <Link href="/" className="text-fg-muted hover:text-fg text-[13px] underline underline-offset-4">
            Leave setup
          </Link>
        </header>

        <main className="pt-10 sm:pt-14">
          <OnboardingFlow />
        </main>
      </div>
      <TxCenter />
    </AppProviders>
  );
}
