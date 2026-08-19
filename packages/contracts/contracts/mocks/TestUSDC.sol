// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/// @title TestUSDC — local test stand-in for the Sepolia mock USDC
/// @notice 6-decimals ERC-20 with an open mint. Test/demo fixture only,
///         never deployed to a public network by our scripts.
contract TestUSDC is ERC20 {
    constructor() ERC20("Test USDC", "tUSDC") {}

    function decimals() public pure override returns (uint8) {
        return 6;
    }

    /// @notice Open faucet — anyone can mint (test-only).
    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }
}
