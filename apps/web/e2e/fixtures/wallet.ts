/**
 * Ví EIP-1193 giả lập — đủ thật để relayer chấp nhận.
 *
 * Vì sao không stub chữ ký: `userDecrypt` gửi một EIP-712 lên relayer, relayer
 * verify nó với ACL onchain của đúng address đó. Một chữ ký bịa sẽ bị từ chối,
 * nên "test reveal" bằng ví bịa chỉ test được đường lỗi. Ở đây chữ ký ký THẬT
 * bằng `ethers.Wallet`, chỉ khác MetaMask ở chỗ không có người bấm nút.
 *
 * Khoá ký nằm ở **tiến trình Node**, không nằm trong page: init script chỉ thấy
 * `window.__pdpSign`, một hàm được `exposeFunction` bắc cầu về Node. Trang web
 * không bao giờ chạm vào private key, nên một lỗi XSS trong lúc test cũng không
 * lấy được gì, và key không đi vào trace/screenshot của Playwright.
 *
 * Khoá lấy từ env, KHÔNG BAO GIỜ hardcode:
 *   E2E_MNEMONIC  — mnemonic của deployer (persona seeded, index 0)
 *   E2E_PRIVATE_KEY — thay thế, nếu chỉ có một khoá lẻ
 * Không set gì thì sinh ví ngẫu nhiên: vẫn đủ cho persona "fresh" (ví trắng chỉ
 * đọc `HIDDEN_HANDLE`), nhưng persona "seeded" sẽ tự skip thay vì đỏ giả.
 *
 * `accountIndex` chọn nhánh trong cùng mnemonic (Day 8: cần 2–3 persona cùng
 * lúc trong một vòng). Chỉ có ý nghĩa với `E2E_MNEMONIC` — một `E2E_PRIVATE_KEY`
 * là đúng một ví, và im lặng trả về ví đó cho mọi index sẽ làm test "hai người
 * gửi tiền" thật ra chỉ có một người. `funded` bắt đúng chuyện đó: index > 0 với
 * khoá lẻ trả `funded: false`, và test tự skip.
 */

import { HDNodeWallet, Mnemonic, Wallet } from "ethers";
import type { Page } from "@playwright/test";

export const SEPOLIA_HEX = "0xaa36a7";
const RPC_URL = "https://ethereum-sepolia-rpc.publicnode.com";

export interface StubWallet {
  address: string;
  /** True khi khoá đến từ env — tức là ví có thể thật sự có tiền trong pot. */
  funded: boolean;
}

function signerFromEnv(fresh: boolean, index: number): { signer: Wallet | HDNodeWallet; funded: boolean } {
  // Persona "fresh incognito" phải là ví trắng KỂ CẢ khi env có khoá đã seed.
  // Không có cờ này thì test đó lặng lẽ đổi ý nghĩa tuỳ máy ai chạy nó.
  if (fresh) return { signer: Wallet.createRandom(), funded: false };
  const mnemonic = process.env["E2E_MNEMONIC"];
  if (mnemonic) {
    return {
      // Cùng derivation path với hardhat.config.ts, nếu không sẽ ra một address
      // khác và mọi assertion "đã seed" sẽ sai một cách rất khó hiểu.
      signer: HDNodeWallet.fromMnemonic(Mnemonic.fromPhrase(mnemonic), `m/44'/60'/0'/0/${index}`),
      funded: true,
    };
  }
  const key = process.env["E2E_PRIVATE_KEY"];
  // Một khoá lẻ chỉ dựng được persona 0. Trả nó cho index 1 sẽ làm "hai ví" hoá
  // ra là một, và test đa-persona sẽ xanh trong lúc không kiểm gì.
  if (key) return { signer: new Wallet(key), funded: index === 0 };
  return { signer: Wallet.createRandom(), funded: false };
}

/**
 * Cài `window.ethereum` TRƯỚC khi bất kỳ script nào của trang chạy.
 *
 * `addInitScript` là bắt buộc chứ không phải tiện: app dò `window.ethereum` lúc
 * mount, nên tiêm sau `goto` là tiêm sau khi nó đã kết luận "không có ví".
 */
export async function installWallet(
  page: Page,
  opts: {
    chainId?: string;
    fresh?: boolean;
    rejectSignatures?: boolean;
    /** Diễn "người dùng bấm Cancel ở hộp thoại GỬI TX" — khác với từ chối chữ ký. */
    rejectTransactions?: boolean;
    preauthorized?: boolean;
    /** Nhánh HD trong cùng mnemonic — persona thứ 2, thứ 3 của một vòng. */
    accountIndex?: number;
  } = {},
): Promise<StubWallet> {
  const { signer, funded } = signerFromEnv(opts.fresh ?? false, opts.accountIndex ?? 0);
  const address = await signer.getAddress();

  await page.exposeFunction("__pdpSign", async (method: string, params: unknown[]): Promise<string> => {
    if (method === "personal_sign") {
      const [message] = params as [string];
      return signer.signMessage(message.startsWith("0x") ? Buffer.from(message.slice(2), "hex") : message);
    }
    // eth_signTypedData_v4 — đường của userDecrypt.
    const [, payload] = params as [string, string];
    const typed = JSON.parse(payload) as {
      domain: Record<string, unknown>;
      types: Record<string, Array<{ name: string; type: string }>>;
      message: Record<string, unknown>;
      primaryType: string;
    };
    // `EIP712Domain` nằm trong payload của ví nhưng ethers tự dựng nó và sẽ ném
    // nếu thấy nó hai lần.
    const { EIP712Domain: _ignored, ...types } = typed.types;
    return signer.signTypedData(typed.domain, types, typed.message);
  });

  await page.addInitScript(
    ({
      address,
      chainId,
      rpcUrl,
      rejectSignatures,
      rejectTransactions,
      preauthorized,
    }: {
      address: string;
      chainId: string;
      rpcUrl: string;
      rejectSignatures: boolean;
      rejectTransactions: boolean;
      preauthorized: boolean;
    }) => {
      type Handler = (payload: unknown) => void;
      const listeners = new Map<string, Set<Handler>>();
      let currentChain = chainId;
      let currentAccounts = [address];
      /**
       * Trang đã được cấp quyền hay chưa — hai câu trả lời rất khác nhau.
       *
       * Ví thật trả `eth_accounts: []` cho một trang chưa từng được duyệt, và
       * chỉ mở ra sau `eth_requestAccounts`. Stub mặc định `true` để giữ nguyên
       * hành vi của các test hiện có (chúng cần vào thẳng dashboard), nhưng mặc
       * định ấy có giá: bước "Connect wallet" bị nhảy qua, nên không test nào
       * từng bấm vào nó. `preauthorized: false` diễn được đúng trình duyệt sạch.
       */
      let authorized = preauthorized;

      const emit = (event: string, payload: unknown): void => {
        for (const handler of listeners.get(event) ?? []) handler(payload);
      };

      const passthrough = async (method: string, params: unknown[]): Promise<unknown> => {
        const response = await fetch(rpcUrl, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ jsonrpc: "2.0", id: Date.now(), method, params }),
        });
        const json = (await response.json()) as {
          result?: unknown;
          error?: { message: string; code: number; data?: unknown };
        };
        // `data` phải đi kèm: đó là revert data, và là thứ DUY NHẤT cho phép
        // `classifyError` gọi tên custom error của contract thay vì rơi về
        // "Something went wrong". Ví thật chuyển nó lên; một stub bỏ nó đi sẽ
        // làm mọi test lỗi-onchain kiểm sai nhánh.
        if (json.error) {
          throw Object.assign(new Error(json.error.message), {
            code: json.error.code,
            ...(json.error.data === undefined ? {} : { data: json.error.data }),
          });
        }
        return json.result;
      };

      const ethereum = {
        isMetaMask: true,
        async request({ method, params = [] }: { method: string; params?: unknown[] }): Promise<unknown> {
          switch (method) {
            case "eth_requestAccounts":
              authorized = true;
              return currentAccounts;
            case "eth_accounts":
              return authorized ? currentAccounts : [];
            case "eth_chainId":
              return currentChain;
            case "wallet_switchEthereumChain": {
              const [target] = params as [{ chainId: string }];
              currentChain = target.chainId;
              emit("chainChanged", currentChain);
              return null;
            }
            case "eth_sendTransaction":
              // Cùng lý do như dưới: `code: 4001` phải sinh ra TRONG page.
              if (rejectTransactions) {
                throw Object.assign(new Error("User denied transaction signature."), { code: 4001 });
              }
              return passthrough(method, params);
            case "personal_sign":
            case "eth_signTypedData_v4":
              // Từ chối phải ném TRONG page, không phải trong Node: property
              // `code` không đi qua được `exposeFunction`, và `code === 4001`
              // chính là thứ duy nhất phân biệt "người dùng bấm Cancel" với
              // "ví hỏng" (`classifyError`). Ném ở Node thì test này sẽ xanh
              // trên nhánh lỗi chung, tức là kiểm sai chỗ.
              if (rejectSignatures) {
                throw Object.assign(new Error("User rejected the request."), { code: 4001 });
              }
              // @ts-expect-error — bắc cầu về Node, chỉ tồn tại lúc test.
              return window.__pdpSign(method, params);
            default:
              return passthrough(method, params);
          }
        },
        on(event: string, handler: Handler): void {
          if (!listeners.has(event)) listeners.set(event, new Set());
          listeners.get(event)!.add(handler);
        },
        removeListener(event: string, handler: Handler): void {
          listeners.get(event)?.delete(handler);
        },
      };

      Object.defineProperty(window, "ethereum", { value: ethereum, configurable: true, writable: true });

      /**
       * Điều khiển ví từ test — đây là cách DUY NHẤT diễn được "đổi account" và
       * "đổi chain" trong trình duyệt thật. Không có nó thì hai trigger clear
       * quan trọng nhất của reveal cache chỉ được kiểm ở tầng unit.
       */
      Object.defineProperty(window, "__pdpWallet", {
        value: {
          setAccounts(next: string[]): void {
            currentAccounts = next;
            emit("accountsChanged", next);
          },
          setChain(next: string): void {
            currentChain = next;
            emit("chainChanged", next);
          },
        },
        configurable: true,
      });
    },
    {
      address,
      chainId: opts.chainId ?? SEPOLIA_HEX,
      rpcUrl: RPC_URL,
      rejectSignatures: opts.rejectSignatures ?? false,
      rejectTransactions: opts.rejectTransactions ?? false,
      preauthorized: opts.preauthorized ?? true,
    },
  );

  return { address, funded };
}

/** Đổi account trong page — kích hoạt `accountsChanged` như ví thật. */
export async function switchAccount(page: Page, next: string): Promise<void> {
  await page.evaluate((addr) => {
    (window as unknown as { __pdpWallet: { setAccounts: (a: string[]) => void } }).__pdpWallet.setAccounts([addr]);
  }, next);
}

/** Đổi chain trong page — kích hoạt `chainChanged`. */
export async function switchChain(page: Page, chainIdHex: string): Promise<void> {
  await page.evaluate((id) => {
    (window as unknown as { __pdpWallet: { setChain: (c: string) => void } }).__pdpWallet.setChain(id);
  }, chainIdHex);
}
