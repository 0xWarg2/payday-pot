"use client";

/**
 * Day 1 spike page (throwaway có chủ đích — product UI làm ở Day 6).
 * Chứng minh trong PRODUCTION build: relayer-sdk init (WASM) → connect wallet
 * → encrypt euint64 client-side → tx setValue → EIP-712 user-decrypt.
 *
 * Rule dự án: không log/URL/analytics số tiền plaintext — giá trị decrypt
 * chỉ hiển thị trong UI cho chính chủ.
 */

import { useCallback, useRef, useState } from "react";
import { BrowserProvider, Contract, type Eip1193Provider } from "ethers";

const SEPOLIA_CHAIN_ID = 11155111;
const SEPOLIA_HEX = "0xaa36a7";

const COMPAT_SPIKE_ABI = [
  "function setValue(bytes32 input, bytes inputProof)",
  "function addValue(bytes32 input, bytes inputProof)",
  "function getValue(address account) view returns (bytes32)",
];

type SdkInstance = {
  createEncryptedInput: (contract: string, user: string) => {
    add64: (v: bigint) => void;
    encrypt: () => Promise<{ handles: Uint8Array[]; inputProof: Uint8Array }>;
  };
  generateKeypair: () => { publicKey: string; privateKey: string };
  createEIP712: (pubKey: string, contracts: string[], start: string, days: string) => {
    domain: Record<string, unknown>;
    types: Record<string, unknown>;
    message: Record<string, unknown>;
  };
  userDecrypt: (
    pairs: { handle: string; contractAddress: string }[],
    privKey: string,
    pubKey: string,
    signature: string,
    contracts: string[],
    user: string,
    start: string,
    days: string,
  ) => Promise<Record<string, bigint | boolean | string>>;
};

type RelayerSDK = {
  initSDK: (opts?: { tfheParams?: unknown; kmsParams?: unknown; thread?: number }) => Promise<boolean>;
  createInstance: (config: Record<string, unknown>) => Promise<unknown>;
  SepoliaConfig: Record<string, unknown>;
};

declare global {
  interface Window {
    ethereum?: Eip1193Provider & { request: (a: { method: string; params?: unknown[] }) => Promise<unknown> };
    relayerSDK?: RelayerSDK;
  }
}

const box: React.CSSProperties = { border: "1px solid #2a2f3a", borderRadius: 8, padding: 16, marginBottom: 12 };
const btn: React.CSSProperties = { background: "#f5c542", color: "#111", border: 0, borderRadius: 6, padding: "8px 14px", cursor: "pointer", fontWeight: 700 };
const inp: React.CSSProperties = { background: "#131722", color: "#e6e6e6", border: "1px solid #2a2f3a", borderRadius: 6, padding: 8, width: "100%", boxSizing: "border-box" };

export default function SpikePage() {
  const [log, setLog] = useState<string[]>([]);
  const [sdkReady, setSdkReady] = useState(false);
  const [account, setAccount] = useState<string>("");
  const [contractAddr, setContractAddr] = useState<string>("");
  const [value, setValue] = useState<string>("1000");
  const [decrypted, setDecrypted] = useState<string>("");
  const [busy, setBusy] = useState(false);
  const sdkRef = useRef<SdkInstance | null>(null);

  const say = useCallback((m: string) => setLog((l) => [...l, m]), []);

  const initSdk = useCallback(async () => {
    setBusy(true);
    try {
      say("⏳ Loading relayer-sdk bundle + WASM…");
      const sdk = window.relayerSDK;
      if (!sdk) throw new Error("relayerSDK UMD chưa load (kiểm tra /relayer-sdk-js.umd.js)");
      await sdk.initSDK({
        tfheParams: "/tfhe_bg.wasm",
        kmsParams: "/kms_lib_bg.wasm",
      });
      say("✅ WASM loaded (cross-origin isolated: " + String(crossOriginIsolated) + ")");
      const network = window.ethereum ?? "https://ethereum-sepolia-rpc.publicnode.com";
      const instance = await sdk.createInstance({ ...sdk.SepoliaConfig, network });
      sdkRef.current = instance as unknown as SdkInstance;
      setSdkReady(true);
      say("✅ FHEVM instance created (SepoliaConfig)");
    } catch (e) {
      say("❌ init: " + (e as Error).message);
    } finally {
      setBusy(false);
    }
  }, [say]);

  const connect = useCallback(async () => {
    if (!window.ethereum) return say("❌ Không thấy wallet (cài MetaMask)");
    setBusy(true);
    try {
      const accounts = (await window.ethereum.request({ method: "eth_requestAccounts" })) as string[];
      const chainId = (await window.ethereum.request({ method: "eth_chainId" })) as string;
      if (chainId !== SEPOLIA_HEX) {
        say("⏳ Switching to Sepolia…");
        await window.ethereum.request({ method: "wallet_switchEthereumChain", params: [{ chainId: SEPOLIA_HEX }] });
      }
      setAccount(accounts[0] ?? "");
      say(`✅ Connected ${accounts[0]?.slice(0, 6)}…${accounts[0]?.slice(-4)} on chain ${SEPOLIA_CHAIN_ID}`);
    } catch (e) {
      say("❌ connect: " + (e as Error).message);
    } finally {
      setBusy(false);
    }
  }, [say]);

  const encryptAndSet = useCallback(async () => {
    const sdk = sdkRef.current;
    if (!sdk || !account || !window.ethereum) return say("❌ Cần init SDK + connect wallet trước");
    if (!contractAddr) return say("❌ Nhập địa chỉ CompatSpike (deploy ở bước B7)");
    setBusy(true);
    try {
      say("⏳ Encrypting client-side…");
      const buffer = sdk.createEncryptedInput(contractAddr, account);
      buffer.add64(BigInt(value));
      const { handles, inputProof } = await buffer.encrypt();
      say("✅ Encrypted + proof generated (relayer). Tx chỉ chứa ciphertext.");
      const provider = new BrowserProvider(window.ethereum);
      const signer = await provider.getSigner();
      const contract = new Contract(contractAddr, COMPAT_SPIKE_ABI, signer);
      say("⏳ Sending setValue tx…");
      const tx = await contract.getFunction("setValue")(handles[0], inputProof);
      const receipt = await tx.wait();
      say(`✅ Tx mined: ${receipt.hash}`);
    } catch (e) {
      say("❌ encrypt/set: " + (e as Error).message);
    } finally {
      setBusy(false);
    }
  }, [account, contractAddr, value, say]);

  const decrypt = useCallback(async () => {
    const sdk = sdkRef.current;
    if (!sdk || !account || !window.ethereum) return say("❌ Cần init SDK + connect wallet trước");
    if (!contractAddr) return say("❌ Nhập địa chỉ CompatSpike");
    setBusy(true);
    try {
      const provider = new BrowserProvider(window.ethereum);
      const signer = await provider.getSigner();
      const contract = new Contract(contractAddr, COMPAT_SPIKE_ABI, provider);
      const handle = (await contract.getFunction("getValue")(account)) as string;
      say(`ℹ️ Handle: ${handle.slice(0, 10)}…`);
      const keypair = sdk.generateKeypair();
      const start = Math.floor(Date.now() / 1000).toString();
      const days = "1";
      const eip712 = sdk.createEIP712(keypair.publicKey, [contractAddr], start, days);
      say("⏳ EIP-712 sign + userDecrypt via relayer…");
      const signature = await signer.signTypedData(
        eip712.domain as never,
        { UserDecryptRequestVerification: (eip712.types as Record<string, unknown>).UserDecryptRequestVerification } as never,
        eip712.message as never,
      );
      const result = await sdk.userDecrypt(
        [{ handle, contractAddress: contractAddr }],
        keypair.privateKey,
        keypair.publicKey,
        signature.replace("0x", ""),
        [contractAddr],
        account,
        start,
        days,
      );
      setDecrypted(String(result[handle]));
      say("✅ User-decrypt OK — giá trị hiển thị bên dưới (không log)");
    } catch (e) {
      say("❌ decrypt: " + (e as Error).message);
    } finally {
      setBusy(false);
    }
  }, [account, contractAddr, say]);

  return (
    <main style={{ maxWidth: 640, margin: "40px auto", padding: 16 }}>
      <h1 style={{ fontSize: 20 }}>🧪 PayDay Pot — Day 1 Compatibility Spike</h1>
      <p style={{ color: "#9aa4b2", fontSize: 13 }}>
        Throwaway page: chứng minh SDK init → encrypt → tx → EIP-712 user-decrypt trong production build.
      </p>

      <div style={box}>
        <b>1. Init relayer SDK (WASM)</b>{" "}
        <button style={btn} disabled={busy || sdkReady} onClick={initSdk}>{sdkReady ? "Ready ✓" : "Init SDK"}</button>
      </div>

      <div style={box}>
        <b>2. Connect wallet (Sepolia)</b>{" "}
        <button style={btn} disabled={busy || !!account} onClick={connect}>{account ? `${account.slice(0, 6)}…${account.slice(-4)}` : "Connect"}</button>
      </div>

      <div style={box}>
        <b>3. Encrypt euint64 → setValue</b>
        <div style={{ display: "grid", gap: 8, marginTop: 8 }}>
          <input style={inp} placeholder="CompatSpike address (0x…)" value={contractAddr} onChange={(e) => setContractAddr(e.target.value.trim())} />
          <input style={inp} type="number" min="0" value={value} onChange={(e) => setValue(e.target.value)} />
          <button style={btn} disabled={busy} onClick={encryptAndSet}>Encrypt + Send tx</button>
        </div>
      </div>

      <div style={box}>
        <b>4. EIP-712 user-decrypt</b>{" "}
        <button style={btn} disabled={busy} onClick={decrypt}>Decrypt my value</button>
        {decrypted && <div style={{ marginTop: 8, fontSize: 24 }}>🔓 {decrypted}</div>}
      </div>

      <div style={{ ...box, minHeight: 120, fontSize: 12, whiteSpace: "pre-wrap" }}>
        {log.length === 0 ? "— log —" : log.join("\n")}
      </div>
    </main>
  );
}
