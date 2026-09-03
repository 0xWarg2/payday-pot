import { DrawRoom } from "@/components/draw/DrawRoom";
import { DrawRoomShell } from "../DrawRoomShell";

export const metadata = {
  title: "Draw room · PayDay Pot",
  description: "Watch the current round run, step by permissionless step.",
};

/**
 * `/app/draws/current` — segment tĩnh, nên nó luôn thắng `[drawId]` về độ ưu
 * tiên route và "current" không bao giờ bị đọc nhầm thành một số.
 *
 * Trang này KHÔNG biết vòng hiện tại là vòng mấy, và không nên biết: id đó đọc
 * từ chain lúc chạy. Render server một con số vòng ở đây là tự nhận một giá trị
 * sẽ cũ đi ngay khi vòng đổi, và cache của Next sẽ giữ cái cũ đó rất lâu.
 */
export default function CurrentDrawPage() {
  return (
    <DrawRoomShell>
      <DrawRoom epochId={null} />
    </DrawRoomShell>
  );
}
