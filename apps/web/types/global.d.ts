/**
 * Khai báo global cho những thứ trình duyệt/UMD bơm vào `window`.
 *
 * Để ở một chỗ duy nhất: TS gộp mọi `declare global` trong cùng program, nên
 * hai file khai báo `Window.ethereum` với type lệch nhau sẽ làm cả build gãy
 * bằng một thông điệp không chỉ được về nguyên nhân.
 */

import type { Eip1193Provider } from "ethers";

/** EIP-1193 provider của ví, cộng các phần EIP-1193/6963 mà ethers không type. */
export interface InjectedProvider extends Eip1193Provider {
  request: (args: { method: string; params?: unknown[] }) => Promise<unknown>;
  on?: (event: string, listener: (...args: never[]) => void) => void;
  removeListener?: (event: string, listener: (...args: never[]) => void) => void;
  isMetaMask?: boolean;
}

/**
 * Bề mặt relayer-sdk 0.4.1 mà app thực sự dùng.
 *
 * Chỉ khai báo phần đang gọi. Type đầy đủ của SDK không được ship kèm bundle
 * UMD, và một `any` ở đây sẽ vô hiệu hoá strict mode ở đúng chỗ nguy hiểm nhất
 * (handle vs plaintext).
 */
export interface EncryptedInputBuffer {
  add64: (v: bigint) => void;
  encrypt: () => Promise<{ handles: Uint8Array[]; inputProof: Uint8Array }>;
}

export interface Eip712Payload {
  domain: Record<string, unknown>;
  types: Record<string, unknown>;
  message: Record<string, unknown>;
}

export interface FheInstance {
  createEncryptedInput: (contract: string, user: string) => EncryptedInputBuffer;
  generateKeypair: () => { publicKey: string; privateKey: string };
  /** SDK 0.4.1: `start`/`days` phải là number — UintNumber check, không nhận string. */
  createEIP712: (pubKey: string, contracts: string[], start: number, days: number) => Eip712Payload;
  userDecrypt: (
    pairs: { handle: string; contractAddress: string }[],
    privKey: string,
    pubKey: string,
    signature: string,
    contracts: string[],
    user: string,
    start: number,
    days: number,
  ) => Promise<Record<string, bigint | boolean | string>>;
}

export interface RelayerSDK {
  initSDK: (opts?: { tfheParams?: unknown; kmsParams?: unknown; thread?: number }) => Promise<boolean>;
  createInstance: (config: Record<string, unknown>) => Promise<unknown>;
  SepoliaConfig: Record<string, unknown>;
}

declare global {
  interface Window {
    ethereum?: InjectedProvider;
    relayerSDK?: RelayerSDK;
  }
}
