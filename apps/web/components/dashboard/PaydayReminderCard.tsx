import { Card, CardHeader } from "@/components/ui/Card";

/**
 * Nhịp payday — và một lời phủ nhận rõ ràng.
 *
 * Sản phẩm này lấy cảm hứng từ thói quen "để dành ngay hôm nhận lương", nên nói
 * về payday là đúng. Nhưng KHÔNG có tích hợp payroll nào cả, và framing bắt buộc
 * cấm để người đọc tin là có. Nên câu phủ nhận không nằm ở footnote — nó nằm
 * trong chính thân thẻ, cùng cỡ chữ với phần còn lại.
 *
 * Không state, không lưu gì: một cái nhắc mà người dùng bật/tắt được sẽ cần một
 * key persist mới, và storage allowlist là thứ đang được test canh giữ.
 */
export function PaydayReminderCard() {
  return (
    <Card className="h-full">
      <CardHeader title="Next payday reminder" hint="Every Friday" />
      <p className="text-fg-muted max-w-[46ch] text-[14px] leading-relaxed">
        Saving works best on the day the money arrives, before it has anywhere else to be. Friday is simply the habit
        this pool is shaped around.
      </p>
      <p className="text-fg-muted mt-3 max-w-[46ch] text-[13px] leading-relaxed">
        Nothing is connected to a payroll system and nothing is scheduled on chain — every deposit is one you make
        yourself.
      </p>
    </Card>
  );
}
