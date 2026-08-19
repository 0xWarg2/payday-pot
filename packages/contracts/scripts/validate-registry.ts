/**
 * Day 1 — Validate official Zama Sepolia wrapper registry + cUSDC pair (read-only).
 *
 *   pnpm validate:registry
 *
 * Không cần ví/key: chỉ đọc qua public RPC. Xác nhận:
 *  1. Registry map đúng: underlying USDC ↔ cUSDCMock (2 chiều) + isConfidentialTokenValid
 *  2. cUSDC metadata: name/symbol/decimals/rate/underlying
 *  3. ERC-165: cUSDC hỗ trợ interface IERC7984 (bằng chứng cho Decision D2)
 *  4. Cả 2 đường deposit tồn tại trong bytecode impl: confidentialTransferAndCall + confidentialTransferFrom
 */
import { ethers } from "ethers";

const RPCS = [
  "https://ethereum-sepolia-rpc.publicnode.com",
  "https://rpc.sepolia.org",
  "https://sepolia.gateway.tenderly.co",
];

// Official Zama Sepolia addresses (packages/shared/src/manifest.ts giữ bản canonical)
const REGISTRY = "0x2f0750Bbb0A246059d80e94c454586a7F27a128e";
const CUSDC = "0x7c5BF43B851c1dff1a4feE8dB225b87f2C223639";
const USDC = "0x9b5Cd13b8eFbB58Dc25A05CF411D8056058aDFfF";

const REGISTRY_ABI = [
  "function getConfidentialTokenAddress(address) view returns (bool, address)",
  "function getTokenAddress(address) view returns (bool, address)",
  "function isConfidentialTokenValid(address) view returns (bool)",
];

const WRAPPER_ABI = [
  "function name() view returns (string)",
  "function symbol() view returns (string)",
  "function decimals() view returns (uint8)",
  "function rate() view returns (uint256)",
  "function underlying() view returns (address)",
  "function maxTotalSupply() view returns (uint256)",
  "function supportsInterface(bytes4) view returns (bool)",
];

const ERC20_ABI = [
  "function symbol() view returns (string)",
  "function decimals() view returns (uint8)",
];

// IERC7984 (OZ confidential-contracts 0.5.3) — interfaceId = XOR mọi selector
const IERC7984_FNS = [
  "name()",
  "symbol()",
  "decimals()",
  "contractURI()",
  "confidentialTotalSupply()",
  "confidentialBalanceOf(address)",
  "isOperator(address,address)",
  "setOperator(address,uint48)",
  "confidentialTransfer(address,bytes32,bytes)",
  "confidentialTransfer(address,bytes32)",
  "confidentialTransferFrom(address,address,bytes32,bytes)",
  "confidentialTransferFrom(address,address,bytes32)",
  "confidentialTransferAndCall(address,bytes32,bytes,bytes)",
  "confidentialTransferAndCall(address,bytes32,bytes)",
  "confidentialTransferFromAndCall(address,address,bytes32,bytes,bytes)",
  "confidentialTransferFromAndCall(address,address,bytes32,bytes)",
];

let failures = 0;
function check(cond: boolean, label: string, detail = "") {
  console.log(`  ${cond ? "✅" : "❌"} ${label}${detail ? ` — ${detail}` : ""}`);
  if (!cond) failures += 1;
}

function selector(sig: string): string {
  return ethers.id(sig).slice(0, 10);
}

function ierc7984InterfaceId(): string {
  let acc = 0n;
  for (const fn of IERC7984_FNS) acc ^= BigInt(selector(fn));
  return "0x" + acc.toString(16).padStart(8, "0");
}

async function pickProvider(): Promise<ethers.JsonRpcProvider> {
  for (const url of RPCS) {
    try {
      const p = new ethers.JsonRpcProvider(url, 11155111, { staticNetwork: true });
      await p.getBlockNumber();
      console.log(`  ℹ️  RPC: ${url}`);
      return p;
    } catch {
      /* thử RPC kế tiếp */
    }
  }
  throw new Error("Không kết nối được public Sepolia RPC nào");
}

async function main() {
  console.log("\n━━━ Validate Zama Sepolia wrapper registry (read-only) ━━━\n");
  const provider = await pickProvider();

  const registry = new ethers.Contract(REGISTRY, REGISTRY_ABI, provider);
  const cusdc = new ethers.Contract(CUSDC, WRAPPER_ABI, provider);
  const usdc = new ethers.Contract(USDC, ERC20_ABI, provider);

  // 1. Registry mapping 2 chiều
  const [fwdOk, fwdAddr] = await registry.getConfidentialTokenAddress(USDC);
  check(fwdOk && fwdAddr.toLowerCase() === CUSDC.toLowerCase(), "registry: USDC → cUSDC", fwdAddr);
  const [revOk, revAddr] = await registry.getTokenAddress(CUSDC);
  check(revOk && revAddr.toLowerCase() === USDC.toLowerCase(), "registry: cUSDC → USDC", revAddr);
  check(await registry.isConfidentialTokenValid(CUSDC), "registry: isConfidentialTokenValid(cUSDC)");

  // 2. Wrapper metadata
  const [name, symbol, decimals, rate, underlying] = await Promise.all([
    cusdc.name(), cusdc.symbol(), cusdc.decimals(), cusdc.rate(), cusdc.underlying(),
  ]);
  console.log(`  ℹ️  cUSDC: name="${name}" symbol=${symbol} decimals=${decimals} rate=${rate}`);
  check(underlying.toLowerCase() === USDC.toLowerCase(), "cUSDC.underlying() == USDC", underlying);
  check(Number(decimals) === 6, "cUSDC decimals == 6 (khớp giả định euint64/P-3)", String(decimals));
  const [uSymbol, uDecimals] = await Promise.all([usdc.symbol(), usdc.decimals()]);
  console.log(`  ℹ️  underlying: symbol=${uSymbol} decimals=${uDecimals}`);
  check(rate === 10n ** (BigInt(uDecimals) - BigInt(decimals)), "rate khớp chênh lệch decimals", `rate=${rate}`);

  // 3. ERC-165 IERC7984
  const ifaceId = ierc7984InterfaceId();
  check(await cusdc.supportsInterface(ifaceId), `ERC-165 supportsInterface(IERC7984 ${ifaceId})`);

  // 4. Cả 2 đường deposit tồn tại trong impl bytecode (selector nhúng dạng PUSH4)
  const implSlot = "0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc";
  const implAddr = "0x" + (await provider.getStorage(CUSDC, implSlot)).slice(-40);
  const code = await provider.getCode(implAddr);
  console.log(`  ℹ️  cUSDC impl (ERC-1967): ${implAddr} (${(code.length - 2) / 2} bytes)`);
  for (const sig of [
    "confidentialTransferAndCall(address,bytes32,bytes,bytes)",
    "confidentialTransferFrom(address,address,bytes32)",
    "setOperator(address,uint48)",
    "wrap(address,uint256)",
    "unwrap(address,address,bytes32,bytes)",
    "isBlocked(address)",
  ]) {
    check(code.includes(selector(sig).slice(2)), `impl có selector ${sig}`);
  }

  console.log(
    failures === 0
      ? "\n━━━ PASS: registry + cUSDC pair hợp lệ, đủ bằng chứng cho Decision D2 ━━━\n"
      : `\n━━━ FAIL: ${failures} kiểm tra không đạt ━━━\n`,
  );
  if (failures > 0) process.exitCode = 1;
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
