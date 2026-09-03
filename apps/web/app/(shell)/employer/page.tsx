import { RoleGate } from "@/components/guards/RoleGate";
import { FundPrizePanel } from "@/components/employer/FundPrizePanel";
import { NegativePermissionNotice } from "@/components/employer/NegativePermissionNotice";
import { SponsorOverview } from "@/components/employer/SponsorOverview";
import { WalletGate } from "@/components/guards/WalletGate";

export const metadata = {
  title: "Sponsor · PayDay Pot",
  description: "Fund the prize for a round without seeing anyone's balance.",
};

/**
 * Góc nhìn nhà tài trợ — một trang, một việc.
 *
 * `RoleGate` là một cách xem, KHÔNG phải một quyền: quyền thật là `EMPLOYER`
 * trong contract, và không vai trò nào ở client mở được dữ liệu của ai. Cổng này
 * chỉ để màn hình khỏi nói chuyện với sai người.
 *
 * Thứ tự trên trang là có chủ ý: tình trạng vòng → nạp tiền → **cái mà việc tài
 * trợ không cho bạn**. Đoạn cuối đặt sau khi họ đã ký thì vô nghĩa; đặt trước
 * thì nó chắn đường việc họ đến đây để làm. Ngay sau form là đúng chỗ.
 */
export default function EmployerPage() {
  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-[26px] font-semibold tracking-tight sm:text-[30px]">Sponsor a round</h1>
        <p className="text-fg-muted mt-1 max-w-[64ch] text-[15px] leading-relaxed">
          You put up the prize. You never see who deposited how much — including in your own pool.
        </p>
      </div>

      <RoleGate role="employer">
        <div className="flex flex-col gap-5">
          <SponsorOverview />
          <WalletGate>
            <FundPrizePanel />
          </WalletGate>
          <NegativePermissionNotice />
        </div>
      </RoleGate>
    </div>
  );
}
