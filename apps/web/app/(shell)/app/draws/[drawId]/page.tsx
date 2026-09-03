import { notFound } from "next/navigation";

import { DrawRoom } from "@/components/draw/DrawRoom";
import { DrawRoomShell } from "../DrawRoomShell";

export const metadata = {
  title: "Draw room · PayDay Pot",
  description: "A past round, and the on-chain record of how it ran.",
};

/**
 * `/app/draws/<n>` — một vòng cụ thể.
 *
 * Chỉ chấp nhận chữ số, và chặn ở đây thay vì để `BigInt()` ném lúc render:
 * `BigInt("abc")` ném `SyntaxError` bên trong cây client và biến một URL gõ sai
 * thành màn hình trắng. `notFound()` cho ra trang 404 thật.
 *
 * Vòng CÓ TỒN TẠI HAY KHÔNG thì không kiểm ở đây được — nó cần một lời gọi RPC,
 * và mapping của contract không revert với id lạ (nó trả struct rỗng trông y
 * như một vòng đang mở). Việc đó thuộc về `useEpochView`, nơi đã có
 * `currentEpochId` để so.
 */
export default async function DrawPage({ params }: { params: Promise<{ drawId: string }> }) {
  const { drawId } = await params;
  if (!/^\d+$/.test(drawId)) notFound();

  return (
    <DrawRoomShell>
      <DrawRoom epochId={BigInt(drawId)} />
    </DrawRoomShell>
  );
}
