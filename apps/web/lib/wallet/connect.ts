"use client";

import { BrowserProvider, type JsonRpcSigner } from "ethers";
import { classifyError, type PotError } from "@payday-pot/sdk";

import { SEPOLIA_CHAIN_ID, SEPOLIA_HEX, SEPOLIA_RPC } from "../chain/rpc";
import { normalizeAccount, normalizeChainId, resetWallet, setWallet, walletStore } from "./store";

function injected(): NonNullable<Window["ethereum"]> {
  const eth = typeof window === "undefined" ? undefined : window.ethereum;
  if (!eth) throw new Error("No injected ethereum provider found");
  return eth;
}

/**
 * Signer LUÔN dựng mới cho mỗi lần write.
 *
 * Giữ một signer lâu dài là cách chắc chắn để gửi tx bằng account cũ sau khi
 * người dùng đổi account trong ví — ethers cache account lúc `getSigner()`.
 */
export async function getSigner(): Promise<JsonRpcSigner> {
  const provider = new BrowserProvider(injected());
  return provider.getSigner();
}

/** Đọc lại trạng thái ví mà KHÔNG bật popup — dùng lúc mount. */
export async function restoreWallet(): Promise<void> {
  if (typeof window === "undefined") return;
  const eth = window.ethereum;
  if (!eth) {
    setWallet({ hasProvider: false });
    return;
  }
  setWallet({ hasProvider: true });
  try {
    const accounts = (await eth.request({ method: "eth_accounts" })) as unknown[];
    const address = normalizeAccount(accounts[0]);
    const chainId = normalizeChainId(await eth.request({ method: "eth_chainId" }));
    setWallet(
      address
        ? { status: "connected", address, chainId, error: null }
        : { status: "disconnected", address: null, chainId, error: null },
    );
  } catch {
    // Ví từ chối trả lời khi chưa kết nối là chuyện bình thường — không phải lỗi
    // để đưa lên UI. Cứ để trạng thái "disconnected".
  }
}

export async function connectWallet(): Promise<void> {
  if (walletStore.get().status === "connecting") return;
  setWallet({ status: "connecting", error: null });
  try {
    const eth = injected();
    const accounts = (await eth.request({ method: "eth_requestAccounts" })) as unknown[];
    const address = normalizeAccount(accounts[0]);
    if (!address) throw new Error("The wallet returned no account");
    const chainId = normalizeChainId(await eth.request({ method: "eth_chainId" }));
    setWallet({ status: "connected", address, chainId, hasProvider: true, error: null });
  } catch (e) {
    const error = classifyError(e);
    setWallet({ status: "disconnected", address: null, error });
    throw error;
  }
}

/**
 * Chuyển ví về Sepolia. 4902 = chain chưa có trong ví ⇒ thêm rồi thử lại.
 * Không tự reload trang: state onboarding/reveal phải sống sót (R8).
 */
export async function switchToSepolia(): Promise<void> {
  const eth = injected();
  try {
    await eth.request({ method: "wallet_switchEthereumChain", params: [{ chainId: SEPOLIA_HEX }] });
  } catch (e) {
    const code = (e as { code?: number }).code;
    if (code !== 4902) throw classifyError(e);
    await eth.request({
      method: "wallet_addEthereumChain",
      params: [
        {
          chainId: SEPOLIA_HEX,
          chainName: "Ethereum Sepolia",
          nativeCurrency: { name: "Sepolia Ether", symbol: "ETH", decimals: 18 },
          rpcUrls: [SEPOLIA_RPC],
          blockExplorerUrls: ["https://sepolia.etherscan.io"],
        },
      ],
    });
  }
  setWallet({ chainId: normalizeChainId(await eth.request({ method: "eth_chainId" })) });
}

/**
 * Gắn listener của ví một lần duy nhất.
 *
 * Trả về hàm huỷ. `accountsChanged`/`chainChanged` không chỉ cập nhật UI — chúng
 * là hai trong số các trigger BẮT BUỘC xoá reveal cache (PRIVACY §1). Việc xoá
 * do `lib/reveal/store` tự subscribe vào walletStore, nên chỗ này chỉ cần đảm
 * bảo walletStore luôn phản ánh đúng sự thật.
 */
export function watchWallet(): () => void {
  if (typeof window === "undefined") return () => {};
  const eth = window.ethereum;
  if (!eth?.on) return () => {};

  const onAccounts = (...args: never[]): void => {
    const accounts = args[0] as unknown[] | undefined;
    const address = normalizeAccount(accounts?.[0]);
    if (address) setWallet({ status: "connected", address, error: null });
    else resetWallet();
  };
  const onChain = (...args: never[]): void => {
    setWallet({ chainId: normalizeChainId(args[0]) });
  };

  eth.on("accountsChanged", onAccounts);
  eth.on("chainChanged", onChain);
  return () => {
    eth.removeListener?.("accountsChanged", onAccounts);
    eth.removeListener?.("chainChanged", onChain);
  };
}

export { SEPOLIA_CHAIN_ID };
