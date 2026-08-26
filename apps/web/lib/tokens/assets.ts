"use client";

import { HIDDEN_HANDLE, type PotError } from "@payday-pot/sdk";

import { readProvider } from "../chain/rpc";
import { CUSDC_ADDRESS, FAUCET_AMOUNT, getCusdc, getUnderlying } from "../chain/tokens";
import { classifyReadError } from "../pot/classify-read-error";
import { createExternalStore } from "../store/external-store";
import { sendTx } from "../tx/send";

/**
 * "Tôi đã sẵn sàng gửi tiền chưa" — bước 6 của onboarding (§7 asset readiness).
 *
 * Chú ý sự bất đối xứng cố ý ở đây, nó là cả điểm chính của sản phẩm:
 *
 *  - `underlying` và `allowance` là **plaintext**. USDCMock là ERC-20 thường,
 *    số dư và hạn mức của nó nằm công khai trên chain. Hiện thẳng con số ra là
 *    đúng, giấu đi mới là nói dối.
 *  - `shieldedHandle` là **ciphertext handle**. Ở đây không bao giờ có con số —
 *    muốn thấy nó phải qua reveal có chữ ký, và onboarding cố ý không mời chào
 *    việc đó (§7 acceptance: "No confidential value is auto-decrypted").
 *
 * Nói cách khác: ranh giới riêng tư đi ngang qua giữa hai field liền nhau của
 * cùng một struct, và đó chính xác là ranh giới mà `wrap()` bắc cầu.
 */
export interface AssetsSnapshot {
  /** Ví mà số liệu này thuộc về — chống hiển thị số của account cũ sau khi đổi ví. */
  account: string | null;
  /** Số USDC test đang cầm, đơn vị gốc. Công khai. */
  underlying: bigint | null;
  /** Hạn mức đã duyệt cho wrapper. Công khai. */
  allowance: bigint | null;
  /** Handle cUSDC. `HIDDEN_HANDLE` = chưa từng có. KHÔNG BAO GIỜ là số. */
  shieldedHandle: string | null;
  /** Wrapper chặn địa chỉ này ⇒ `wrap` sẽ revert. */
  blocked: boolean;
  loading: boolean;
  error: PotError | null;
}

export const ASSETS_SERVER_SNAPSHOT: AssetsSnapshot = Object.freeze({
  account: null,
  underlying: null,
  allowance: null,
  shieldedHandle: null,
  blocked: false,
  loading: false,
  error: null,
});

export const assetsStore = createExternalStore<AssetsSnapshot>(ASSETS_SERVER_SNAPSHOT, ASSETS_SERVER_SNAPSHOT);

export function hasShielded(snapshot: AssetsSnapshot): boolean {
  return snapshot.shieldedHandle !== null && snapshot.shieldedHandle !== HIDDEN_HANDLE;
}

/**
 * Đọc qua RPC Sepolia cố định, không qua ví — giống mọi read khác trong app.
 * Ví đang đứng ở mạng khác thì bảng số này vẫn đúng, thay vì trả ra
 * `CALL_EXCEPTION` rồi bị đoán nhầm thành "sai mạng" (R7 ≠ R8).
 */
export async function refreshAssets(account: string | null): Promise<void> {
  if (!account) {
    assetsStore.set(ASSETS_SERVER_SNAPSHOT);
    return;
  }

  assetsStore.set((prev) => ({ ...prev, account, loading: true }));
  try {
    const provider = readProvider();
    const underlying = getUnderlying(provider);
    const cusdc = getCusdc(provider);
    const [balance, allowance, handle, blocked] = await Promise.all([
      underlying["balanceOf"]!(account) as Promise<bigint>,
      underlying["allowance"]!(account, CUSDC_ADDRESS) as Promise<bigint>,
      cusdc["confidentialBalanceOf"]!(account) as Promise<string>,
      cusdc["isBlocked"]!(account) as Promise<boolean>,
    ]);

    // Ví có thể đã đổi trong lúc bốn lời gọi trên đang bay. Kết quả cũ mà ghi đè
    // lên account mới thì người dùng đọc số dư của người khác.
    if (assetsStore.get().account !== account) return;

    assetsStore.set({
      account,
      underlying: balance,
      allowance,
      shieldedHandle: handle,
      blocked,
      loading: false,
      error: null,
    });
  } catch (e) {
    if (assetsStore.get().account !== account) return;
    assetsStore.set((prev) => ({ ...prev, loading: false, error: classifyReadError(e) }));
  }
}

/**
 * R14 — "Get test USDC" ngay trong app.
 *
 * `USDCMock.mint` không owner-gated (probe 26/08), nên không cần đẩy người dùng
 * ra faucet bên thứ ba có captcha và rate limit — tức là không tạo thêm một chỗ
 * để họ rơi rụng đúng lúc đang muốn thử sản phẩm.
 */
export async function mintTestUsdc(account: string): Promise<void> {
  await sendTx({ action: "faucet-mint" }, async (signer) =>
    getUnderlying(signer)["mint"]!(account, FAUCET_AMOUNT),
  );
  await refreshAssets(account);
}

/** R13 — bước 1/2. Duyệt đúng số sắp wrap, không duyệt vô hạn. */
export async function approveWrapper(account: string, amount: bigint): Promise<void> {
  await sendTx({ action: "approve" }, async (signer) =>
    getUnderlying(signer)["approve"]!(CUSDC_ADDRESS, amount),
  );
  await refreshAssets(account);
}

/**
 * R13 — bước 2/2. `wrap(to, amount)` nhận **uint256 plaintext**.
 *
 * Con số này nằm vĩnh viễn trong calldata, ai đọc chain cũng thấy. Đó là lý do
 * `ShieldWarning` phải hiện TRƯỚC nút ký chứ không phải sau: sau khi ký thì lời
 * cảnh báo chỉ còn là một lời xin lỗi. Từ sau bước này trở đi mọi con số đều
 * mã hoá — wrap là điểm duy nhất lộ ra, và nó lộ đúng một lần.
 */
export async function shieldUsdc(account: string, amount: bigint): Promise<void> {
  await sendTx({ action: "wrap" }, async (signer) => getCusdc(signer)["wrap"]!(account, amount));
  await refreshAssets(account);
}
