// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import {ZamaEthereumConfig} from "@fhevm/solidity/config/ZamaConfig.sol";
import {IERC20} from "@openzeppelin/contracts/interfaces/IERC20.sol";
import {ERC7984} from "@openzeppelin/confidential-contracts/token/ERC7984/ERC7984.sol";
import {
    ERC7984ERC20Wrapper
} from "@openzeppelin/confidential-contracts/token/ERC7984/extensions/ERC7984ERC20Wrapper.sol";

/// @title TestConfidentialUSDC — local test stand-in for Sepolia cUSDCMock
/// @notice Concrete OZ ERC7984ERC20Wrapper over a 6-decimals underlying,
///         which yields decimals=6 / rate=1 — the same economics as the live
///         ConfidentialWrapperV3 pair validated in COMPATIBILITY_NOTES §2.
///         Funding path in tests mirrors live: mint → approve → wrap().
/// @dev    Must inherit ZamaEthereumConfig — OZ's ERC7984 does not set the
///         FHEVM coprocessor by itself.
contract TestConfidentialUSDC is ERC7984ERC20Wrapper, ZamaEthereumConfig {
    constructor(
        IERC20 underlying_
    ) ERC7984("Confidential Test USDC", "ctUSDC", "") ERC7984ERC20Wrapper(underlying_) {}
}
