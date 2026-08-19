import { DeployFunction } from "hardhat-deploy/types";
import { HardhatRuntimeEnvironment } from "hardhat/types";

const M = 1_000_000n; // 6 decimals

/**
 * Local-only wiring: TestUSDC → TestConfidentialUSDC → PayDayPot.
 * Sepolia deploy is deliberately blocked until Day 9 — the live pot must point
 * at the REAL cUSDCMock wrapper (validated via registry), not our test tokens,
 * and the deployments/sepolia.json manifest flow isn't in place yet.
 */
const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  if (hre.network.name === "sepolia") {
    throw new Error("PayDayPot Sepolia deploy is scheduled for Day 9 (manifest + registry validation first).");
  }

  const { deployer, employer } = await hre.getNamedAccounts();
  const { deploy } = hre.deployments;

  const usdc = await deploy("TestUSDC", { from: deployer, log: true });
  const token = await deploy("TestConfidentialUSDC", { from: deployer, args: [usdc.address], log: true });

  const pot = await deploy("PayDayPot", {
    from: deployer,
    args: [
      token.address,
      employer,
      7n * 24n * 3600n, // epochDuration: 7 days
      10_000n * M, // perUserCap: 10,000 ctUSDC
      32, // participantCap
    ],
    log: true,
  });

  console.log(`PayDayPot contract: `, pot.address);
};
export default func;
func.id = "deploy_paydayPot";
func.tags = ["PayDayPot"];
