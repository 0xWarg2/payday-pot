import "@fhevm/hardhat-plugin";
import "@nomicfoundation/hardhat-chai-matchers";
import "@nomicfoundation/hardhat-ethers";
import "@nomicfoundation/hardhat-verify";
import "@typechain/hardhat";
import "hardhat-deploy";
import type { HardhatUserConfig } from "hardhat/config";
import { vars } from "hardhat/config";

import "./tasks/accounts";

// Run 'npx hardhat vars setup' to see the list of variables that need to be set

const MNEMONIC: string = vars.get("MNEMONIC", "test test test test test test test test test test test junk");
// Public RPC mặc định — không cần đăng ký. Set INFURA_API_KEY nếu public RPC bị rate limit.
const INFURA_API_KEY: string = vars.get("INFURA_API_KEY", "");
const ETHERSCAN_API_KEY: string = vars.get("ETHERSCAN_API_KEY", "");
const SEPOLIA_RPC_URL: string = INFURA_API_KEY
  ? `https://sepolia.infura.io/v3/${INFURA_API_KEY}`
  : vars.get("SEPOLIA_RPC_URL", "https://ethereum-sepolia-rpc.publicnode.com");

const config: HardhatUserConfig = {
  defaultNetwork: "hardhat",
  namedAccounts: {
    deployer: 0,
    employer: 4,
  },
  // Verify: BA provider, không phụ thuộc vào một cái nào.
  //
  // Etherscan V2 đòi API key (đăng ký tài khoản), Blockscout Sepolia thì KHÔNG
  // — nên Blockscout là đường chính (`npx hardhat verify:blockscout`) và
  // Etherscan chỉ bật khi ai đó thực sự có key. Sourcify là bằng chứng thứ ba,
  // độc lập với explorer: nó khớp metadata thay vì khớp qua UI của một site.
  //
  // Sourcify ở đây là DEAD CODE có chủ ý: client trong hardhat-verify 2.1.3 vẫn
  // gọi API v1 (`/server/check-all-by-addresses`) mà Sourcify đã bỏ — giờ trả
  // 404/HTML. Bật nó chỉ để lệnh `verify` báo cáo đúng vì sao nó không chạy,
  // thay vì im lặng bỏ qua một provider. Đường Sourcify thật là qua Blockscout:
  // Blockscout tự propagate, và bản RC ra `creationMatch=match` +
  // `runtimeMatch=match` — full match, kể cả với `bytecodeHash: "none"`.
  // Kiểm bằng: curl https://sourcify.dev/server/v2/contract/11155111/<address>
  //
  // `enabled: !!ETHERSCAN_API_KEY` là bắt buộc, không phải cho gọn: task `verify`
  // chạy MỌI provider đang bật, và một provider bật mà không có key thì fail cả
  // lệnh — kéo theo cả hai provider đang chạy được cũng không báo cáo gì.
  etherscan: {
    apiKey: {
      sepolia: ETHERSCAN_API_KEY,
    },
    enabled: ETHERSCAN_API_KEY !== "",
  },
  blockscout: {
    enabled: true,
  },
  sourcify: {
    enabled: true,
  },
  networks: {
    hardhat: {
      accounts: {
        mnemonic: MNEMONIC,
      },
      chainId: 31337,
    },
    anvil: {
      accounts: {
        mnemonic: MNEMONIC,
        path: "m/44'/60'/0'/0/",
        count: 10,
      },
      chainId: 31337,
      url: "http://localhost:8545",
    },
    sepolia: {
      accounts: {
        mnemonic: MNEMONIC,
        path: "m/44'/60'/0'/0/",
        count: 10,
      },
      chainId: 11155111,
      url: SEPOLIA_RPC_URL,
    },
  },
  paths: {
    artifacts: "./artifacts",
    cache: "./cache",
    sources: "./contracts",
    tests: "./test",
  },
  solidity: {
    version: "0.8.27",
    settings: {
      metadata: {
        // Not including the metadata hash
        // https://github.com/paulrberg/hardhat-template/issues/31
        bytecodeHash: "none",
      },
      // Disable the optimizer when debugging
      // https://hardhat.org/hardhat-network/#solidity-optimizer-support
      optimizer: {
        enabled: true,
        runs: 800,
      },
      evmVersion: "cancun",
    },
  },
  typechain: {
    outDir: "types",
    target: "ethers-v6",
  },
};

export default config;
