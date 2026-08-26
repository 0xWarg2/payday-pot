import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

import { DeployFunction } from "hardhat-deploy/types";
import { HardhatRuntimeEnvironment } from "hardhat/types";

const M = 1_000_000n; // 6 decimals

const REPO = resolve(__dirname, "../../..");
const MANIFEST = resolve(REPO, "deployments/sepolia.json");
const ARTIFACT = resolve(__dirname, "../artifacts/contracts/PayDayPot.sol/PayDayPot.json");

/** Config của pot. Env override để Day 8 dựng epoch ngắn mà không sửa code. */
function potConfig(employer: string) {
  const num = (name: string, fallback: bigint) => (process.env[name] ? BigInt(process.env[name]!) : fallback);
  return {
    employer: process.env.POT_EMPLOYER ?? employer,
    // 2 ngày: đủ để Day 6–7 dựng UI mà epoch không hết hạn giữa chừng (deposit
    // đóng từ ep.end tới startNewEpoch — KNOWN_LIMITATIONS §6). Day 8 deploy lại
    // với POT_EPOCH_DURATION=3600 để diễn trọn vòng draw.
    epochDuration: num("POT_EPOCH_DURATION", 2n * 24n * 3600n),
    perUserCap: num("POT_PER_USER_CAP", 10_000n * M),
    participantCap: Number(num("POT_PARTICIPANT_CAP", 32n)),
  };
}

/**
 * Local: dựng cả TestUSDC → TestConfidentialUSDC → PayDayPot.
 * Sepolia: chỉ deploy pot, trỏ vào cUSDCMock THẬT, và chỉ khi được bật tường minh.
 *
 * Bản Sepolia deploy ở đây luôn là `kind: "dev"` — dùng để dựng UI Day 6–8, có
 * thể deploy đè bất cứ lúc nào. Bản `rc` của Day 9 là một bước TAY riêng: deploy
 * dev → `hardhat verify` → sửa `kind`/`verified` trong deployments/sepolia.json.
 * `pnpm manifest:check` từ chối một entry `rc` chưa verified, nên không có đường
 * nào vô tình gắn nhãn RC cho một contract chưa ai đọc được source.
 */
const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployer, employer } = await hre.getNamedAccounts();
  const { deploy } = hre.deployments;
  const cfg = potConfig(employer);

  if (hre.network.name !== "sepolia") {
    const usdc = await deploy("TestUSDC", { from: deployer, log: true });
    const token = await deploy("TestConfidentialUSDC", { from: deployer, args: [usdc.address], log: true });
    const pot = await deploy("PayDayPot", {
      from: deployer,
      args: [token.address, cfg.employer, cfg.epochDuration, cfg.perUserCap, cfg.participantCap],
      log: true,
    });
    console.log(`PayDayPot contract: `, pot.address);
    return;
  }

  // --- Sepolia -----------------------------------------------------------
  if (process.env.PAYDAY_POT_DEV_DEPLOY !== "1") {
    throw new Error(
      "Refusing to deploy to Sepolia without an explicit opt-in.\n" +
        "  PAYDAY_POT_DEV_DEPLOY=1 npx hardhat deploy --network sepolia --tags PayDayPot\n" +
        "This writes a `dev` deployment into deployments/sepolia.json. The Day 9 RC is a separate, manual promotion.",
    );
  }

  const manifest = JSON.parse(readFileSync(MANIFEST, "utf8"));
  const { cUSDCMock, underlyingUSDCMock, confidentialWrapperRegistry } = manifest.official;

  // Không tin số cứng: xác nhận cặp token qua registry NGAY TRƯỚC khi tiêu gas.
  // Constructor của pot đọc underlying()/rate() — trỏ nhầm token là hỏng vĩnh
  // viễn (contract non-upgradeable), nên rẻ nhất là chặn ở đây.
  const registry = await hre.ethers.getContractAt(
    ["function getConfidentialTokenAddress(address) view returns (bool, address)", "function isConfidentialTokenValid(address) view returns (bool)"],
    confidentialWrapperRegistry,
  );
  const [mapped, mappedAddr] = await registry.getConfidentialTokenAddress(underlyingUSDCMock);
  if (!mapped || mappedAddr.toLowerCase() !== cUSDCMock.toLowerCase()) {
    throw new Error(`registry does not map ${underlyingUSDCMock} → ${cUSDCMock} (got ${mappedAddr})`);
  }
  if (!(await registry.isConfidentialTokenValid(cUSDCMock))) {
    throw new Error(`registry says ${cUSDCMock} is not a valid confidential token`);
  }

  const wrapper = await hre.ethers.getContractAt(
    ["function underlying() view returns (address)", "function rate() view returns (uint256)", "function decimals() view returns (uint8)"],
    cUSDCMock,
  );
  const [underlying, rate, decimals] = await Promise.all([wrapper.underlying(), wrapper.rate(), wrapper.decimals()]);
  if (underlying.toLowerCase() !== underlyingUSDCMock.toLowerCase()) {
    throw new Error(`cUSDCMock.underlying() = ${underlying}, expected ${underlyingUSDCMock}`);
  }
  if (Number(decimals) !== 6) throw new Error(`cUSDCMock.decimals() = ${decimals}, expected 6 (euint64 budget assumes 6)`);
  // Wrapper là proxy UUPS của bên khác và ĐÃ bị upgrade một lần giữa Day 1 và
  // Day 6 (KNOWN_LIMITATIONS §10). Ghi lại impl mà pot được deploy chống lại —
  // sau này wrapper đổi thì còn có mốc để so, thay vì đoán.
  const IMPL_SLOT = "0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc";
  const implSlot = await hre.ethers.provider.getStorage(cUSDCMock, IMPL_SLOT);
  const wrapperImpl = hre.ethers.getAddress("0x" + implSlot.slice(-40));
  console.log(`  ✓ registry + wrapper validated — rate=${rate} decimals=${decimals} impl=${wrapperImpl}`);

  const balance = await hre.ethers.provider.getBalance(deployer);
  if (balance < hre.ethers.parseEther("0.02")) {
    throw new Error(`deployer ${deployer} has ${hre.ethers.formatEther(balance)} ETH — top up before deploying`);
  }

  console.log(`  deployer  ${deployer}`);
  console.log(`  employer  ${cfg.employer}`);
  console.log(`  epoch     ${cfg.epochDuration}s · perUserCap ${cfg.perUserCap} · participantCap ${cfg.participantCap}`);

  const pot = await deploy("PayDayPot", {
    from: deployer,
    args: [cUSDCMock, cfg.employer, cfg.epochDuration, cfg.perUserCap, cfg.participantCap],
    log: true,
  });

  const abi = JSON.parse(readFileSync(ARTIFACT, "utf8")).abi;
  const abiHash = createHash("sha256").update(JSON.stringify(abi)).digest("hex");
  const commit = execFileSync("git", ["rev-parse", "HEAD"], { cwd: REPO, encoding: "utf8" }).trim();
  const receipt = pot.receipt;

  manifest.contracts.PayDayPot = {
    address: pot.address,
    deployBlock: receipt?.blockNumber ?? 0,
    deployTx: pot.transactionHash ?? receipt?.transactionHash ?? "",
    kind: "dev",
    commit,
    abiHash,
    verified: false,
    token: cUSDCMock,
    tokenImpl: wrapperImpl,
    note: `dev deploy for UI work — epoch ${cfg.epochDuration}s, perUserCap ${cfg.perUserCap}, participantCap ${cfg.participantCap}`,
  };
  manifest.updatedAt = new Date().toISOString();
  writeFileSync(MANIFEST, JSON.stringify(manifest, null, 2) + "\n");
  console.log(`  ✓ recorded in deployments/sepolia.json (kind=dev, commit ${commit.slice(0, 8)}, abiHash ${abiHash.slice(0, 12)}…)`);

  execFileSync("node", [resolve(__dirname, "../scripts/sync-manifest.mjs")], { stdio: "inherit" });
};
export default func;
func.id = "deploy_paydayPot";
func.tags = ["PayDayPot"];
