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
import { BrowserProvider, Contract, getAddress, type Eip1193Provider } from "ethers";

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
  // SDK 0.4.1: start/days phải là number (UintNumber check), không nhận string
  createEIP712: (pubKey: string, contracts: string[], start: number, days: number) => {
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
    start: number,
    days: number,
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
  // CompatSpike trên Sepolia — xem deployments/sepolia.json
  const [contractAddr, setContractAddr] = useState<string>("0xceEee18891D4d53699E2Ab28C402fA0C5D721603");
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
      // Luôn đọc chain qua RPC Sepolia cố định — không dùng window.ethereum:
      // MetaMask có thể đang đứng ở mạng khác lúc init → CALL_EXCEPTION.
      // MetaMask chỉ dùng để ký tx/EIP-712 (qua ethers signer ở bước 2–4).
      const network = "https://ethereum-sepolia-rpc.publicnode.com";
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
    if (!window.ethereum) return say("❌ No wallet found (install MetaMask)");
    setBusy(true);
    try {
      const accounts = (await window.ethereum.request({ method: "eth_requestAccounts" })) as string[];
      const chainId = (await window.ethereum.request({ method: "eth_chainId" })) as string;
      if (chainId !== SEPOLIA_HEX) {
        say("⏳ Switching to Sepolia…");
        await window.ethereum.request({ method: "wallet_switchEthereumChain", params: [{ chainId: SEPOLIA_HEX }] });
      }
      // relayer-sdk đòi address checksummed — MetaMask trả về lowercase
      setAccount(accounts[0] ? getAddress(accounts[0]) : "");
      say(`✅ Connected ${accounts[0]?.slice(0, 6)}…${accounts[0]?.slice(-4)} on chain ${SEPOLIA_CHAIN_ID}`);
    } catch (e) {
      say("❌ connect: " + (e as Error).message);
    } finally {
      setBusy(false);
    }
  }, [say]);

  const encryptAndSet = useCallback(async () => {
    const sdk = sdkRef.current;
    if (!sdk || !account || !window.ethereum) return say("❌ Init SDK + connect wallet first");
    if (!contractAddr) return say("❌ Enter the CompatSpike contract address");
    setBusy(true);
    try {
      say("⏳ Encrypting client-side…");
      const buffer = sdk.createEncryptedInput(getAddress(contractAddr.trim()), account);
      buffer.add64(BigInt(value));
      const { handles, inputProof } = await buffer.encrypt();
      say("✅ Encrypted + proof generated (relayer). Tx carries ciphertext only.");
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
    if (!sdk || !account || !window.ethereum) return say("❌ Init SDK + connect wallet first");
    if (!contractAddr) return say("❌ Enter the CompatSpike contract address");
    setBusy(true);
    try {
      const caddr = getAddress(contractAddr.trim());
      const provider = new BrowserProvider(window.ethereum);
      const signer = await provider.getSigner();
      const contract = new Contract(caddr, COMPAT_SPIKE_ABI, provider);
      const handle = (await contract.getFunction("getValue")(account)) as string;
      say(`ℹ️ Handle: ${handle.slice(0, 10)}…`);
      const keypair = sdk.generateKeypair();
      const start = Math.floor(Date.now() / 1000);
      const days = 1;
      const eip712 = sdk.createEIP712(keypair.publicKey, [caddr], start, days);
      say("⏳ EIP-712 sign + userDecrypt via relayer…");
      const signature = await signer.signTypedData(
        eip712.domain as never,
        { UserDecryptRequestVerification: (eip712.types as Record<string, unknown>).UserDecryptRequestVerification } as never,
        eip712.message as never,
      );
      const result = await sdk.userDecrypt(
        [{ handle, contractAddress: caddr }],
        keypair.privateKey,
        keypair.publicKey,
        signature.replace("0x", ""),
        [caddr],
        account,
        start,
        days,
      );
      setDecrypted(String(result[handle]));
      say("✅ User-decrypt OK — value shown below (never logged)");
    } catch (e) {
      say("❌ decrypt: " + (e as Error).message);
    } finally {
      setBusy(false);
    }
  }, [account, contractAddr, say]);

  return (
    <div style={{ minHeight: "100vh", background: "#0b0e14", color: "#e6e6e6", fontFamily: "ui-monospace, monospace" }}>
    <main style={{ maxWidth: 640, margin: "0 auto", padding: "40px 16px" }}>
      <h1 style={{ fontSize: 20 }}>🧪 PayDay Pot — Day 1 Compatibility Spike</h1>
      <p style={{ color: "#9aa4b2", fontSize: 13 }}>
        Throwaway page: prove SDK init → encrypt → tx → EIP-712 user-decrypt in a production build.
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
    </div>
  );
}
