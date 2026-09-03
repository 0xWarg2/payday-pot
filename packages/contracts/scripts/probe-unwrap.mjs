/**
 * R1 probe — dựng một unwrap TREO THẬT rồi hoàn tất nó, một lần, trên Sepolia.
 *
 * Lý do phải chạy thật: nút *Resume finalize* chưa từng gửi thành công lần nào,
 * và ship một nút chưa từng chạy = dead end.
 *
 *   node probe-unwrap.mjs request            → tạo unwrap treo, in requestId
 *   node probe-unwrap.mjs finalize <reqId>   → publicDecrypt + finalizeUnwrap
 *   node probe-unwrap.mjs status <reqId>     → unwrapRequester(id)
 */
import { execSync } from "node:child_process";
import { ethers } from "ethers";
import { createInstance, SepoliaConfig } from "@zama-fhe/relayer-sdk/node";

const CUSDC = "0x7c5BF43B851c1dff1a4feE8dB225b87f2C223639";
const USDC = "0x9b5Cd13b8eFbB58Dc25A05CF411D8056058aDFfF";
const AMOUNT = 1_000_000n; // 1 USDC

const vars = (k) => execSync(`npx hardhat vars get ${k}`, { encoding: "utf8" }).trim();
const RPC = `https://sepolia.infura.io/v3/${vars("INFURA_API_KEY")}`;
const provider = new ethers.JsonRpcProvider(RPC);
const wallet = ethers.HDNodeWallet.fromPhrase(vars("MNEMONIC"), undefined, "m/44'/60'/0'/0/0").connect(provider);

const cusdc = new ethers.Contract(
  CUSDC,
  [
    "function unwrap(address from, address to, bytes32 encryptedAmount, bytes inputProof) returns (bytes32)",
    "function finalizeUnwrap(bytes32 requestId, uint64 amount, bytes signatures)",
    "function unwrapRequester(bytes32 requestId) view returns (address)",
    "function confidentialBalanceOf(address account) view returns (bytes32)",
    "event UnwrapRequested(address indexed receiver, bytes32 indexed unwrapRequestId, bytes32 amount)",
  ],
  wallet,
);
const usdc = new ethers.Contract(USDC, ["function balanceOf(address) view returns (uint256)"], provider);

const [mode, arg] = process.argv.slice(2);
console.log(`wallet ${wallet.address}`);

if (mode === "request") {
  console.log(`USDC before: ${ethers.formatUnits(await usdc.balanceOf(wallet.address), 6)}`);
  console.log(`cUSDC handle: ${await cusdc.confidentialBalanceOf(wallet.address)}`);

  const fhe = await createInstance({ ...SepoliaConfig, network: RPC });
  const enc = await fhe.createEncryptedInput(CUSDC, wallet.address).add64(AMOUNT).encrypt();
  console.log(`encrypted input ok — handle ${ethers.hexlify(enc.handles[0])}`);

  const tx = await cusdc.unwrap(wallet.address, wallet.address, enc.handles[0], enc.inputProof);
  console.log(`unwrap tx ${tx.hash}`);
  const rc = await tx.wait();
  console.log(`mined block ${rc.blockNumber}  gasUsed ${rc.gasUsed}`);

  let requestId = null;
  for (const log of rc.logs) {
    if (log.address.toLowerCase() !== CUSDC.toLowerCase()) continue;
    const parsed = cusdc.interface.parseLog({ topics: [...log.topics], data: log.data });
    if (parsed?.name === "UnwrapRequested") {
      requestId = parsed.args.unwrapRequestId;
      console.log(`UnwrapRequested receiver=${parsed.args.receiver} requestId=${requestId}`);
    }
  }
  console.log(`\nunwrapRequester(${requestId}) = ${await cusdc.unwrapRequester(requestId)}`);
  console.log(`USDC after request: ${ethers.formatUnits(await usdc.balanceOf(wallet.address), 6)}  ← chưa về, đúng: 2 bước`);
  console.log(`\nREQUEST_ID=${requestId}`);
} else if (mode === "status") {
  console.log(`unwrapRequester(${arg}) = ${await cusdc.unwrapRequester(arg)}`);
} else if (mode === "finalize") {
  console.log(`requester before: ${await cusdc.unwrapRequester(arg)}`);
  const fhe = await createInstance({ ...SepoliaConfig, network: RPC });
  const res = await fhe.publicDecrypt([arg]);
  console.log("publicDecrypt keys:", Object.keys(res));
  console.log("clearValues:", JSON.stringify(res.clearValues, (_, v) => (typeof v === "bigint" ? v.toString() : v)));
  console.log("abiEncodedClearValues:", res.abiEncodedClearValues);
  console.log("decryptionProof len:", res.decryptionProof.length, "bytes:", (res.decryptionProof.length - 2) / 2);

  const clear = Object.values(res.clearValues)[0];
  console.log(`clear amount = ${clear}  (abi.encode(uint64) = ${ethers.AbiCoder.defaultAbiCoder().encode(["uint64"], [clear])})`);
  console.log(`match abiEncodedClearValues: ${ethers.AbiCoder.defaultAbiCoder().encode(["uint64"], [clear]) === res.abiEncodedClearValues}`);

  const tx = await cusdc.finalizeUnwrap(arg, clear, res.decryptionProof);
  console.log(`finalizeUnwrap tx ${tx.hash}`);
  const rc = await tx.wait();
  console.log(`mined block ${rc.blockNumber}  gasUsed ${rc.gasUsed}  status ${rc.status}`);
  console.log(`requester after: ${await cusdc.unwrapRequester(arg)}`);
  console.log(`USDC now: ${ethers.formatUnits(await usdc.balanceOf(wallet.address), 6)}`);
} else {
  console.log("mode: request | finalize <id> | status <id>");
}
