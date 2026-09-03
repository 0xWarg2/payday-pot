import { SavingsTabs } from "@/components/savings/SavingsTabs";

export const metadata = {
  title: "Savings · PayDay Pot",
  description: "Deposit into the pool, or take your savings back out.",
};

/**
 * Deposit, withdraw, claim, history.
 *
 * Trang này là server component mỏng: mọi thứ có state đều nằm dưới
 * `SavingsTabs`, và không có gì ở đây được phép biết một con số nào. Tiêu đề và
 * đoạn dẫn nói trước hai điều người dùng cần biết trước khi gõ số đầu tiên — cái
 * gì mã hoá, và tiền của họ lấy ra được lúc nào.
 */
export default function SavingsPage() {
  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-[26px] font-semibold tracking-tight sm:text-[30px]">Savings</h1>
        <p className="text-fg-muted mt-1 max-w-[64ch] text-[15px] leading-relaxed">
          Amounts are encrypted in your browser before they are sent, and the pool credits what actually arrives rather
          than what was asked for. Taking your savings out works in every stage of every round, including while the pool
          is paused.
        </p>
      </div>
      <SavingsTabs />
    </div>
  );
}
