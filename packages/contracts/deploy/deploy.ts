import { DeployFunction } from "hardhat-deploy/types";
import { HardhatRuntimeEnvironment } from "hardhat/types";

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployer } = await hre.getNamedAccounts();
  const { deploy } = hre.deployments;

  const deployedCompatSpike = await deploy("CompatSpike", {
    from: deployer,
    log: true,
  });

  console.log(`CompatSpike contract: `, deployedCompatSpike.address);
};
export default func;
func.id = "deploy_compatSpike"; // id required to prevent reexecution
func.tags = ["CompatSpike"];
