// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import {FHE, euint64, externalEuint64} from "@fhevm/solidity/lib/FHE.sol";
import {ZamaEthereumConfig} from "@fhevm/solidity/config/ZamaConfig.sol";

/// @title CompatSpike — Day 1 compatibility spike for PayDay Pot
/// @notice Throwaway contract proving the exact FHE API surface Day 2 depends on:
///         encrypted input verification (fromExternal + proof), FHE.add,
///         ACL refresh (allowThis/allow) after every new handle, and a
///         user-owned ciphertext getter for EIP-712 user decryption.
/// @dev    Intentionally NOT the product contract. PayDayPot.sol starts Day 2.
contract CompatSpike is ZamaEthereumConfig {
    /// @dev Per-user encrypted value; each user may only decrypt their own.
    mapping(address account => euint64 value) private _values;

    /// @notice Emitted on every mutation. Deliberately contains no amount —
    ///         mirrors the PayDayPot event rule (action/user only).
    event ValueChanged(address indexed account);

    /// @notice Overwrite caller's encrypted value.
    function setValue(externalEuint64 input, bytes calldata inputProof) external {
        euint64 value = FHE.fromExternal(input, inputProof);

        _values[msg.sender] = value;

        // ACL must be re-granted on every new handle.
        FHE.allowThis(_values[msg.sender]);
        FHE.allow(_values[msg.sender], msg.sender);

        emit ValueChanged(msg.sender);
    }

    /// @notice Add an encrypted amount onto caller's value.
    /// @dev    FHE.add on an uninitialized handle would revert in mock mode;
    ///         initialize deliberately — same rule PayDayPot must follow
    ///         (never treat an uninitialized handle as encrypted zero).
    function addValue(externalEuint64 input, bytes calldata inputProof) external {
        euint64 amount = FHE.fromExternal(input, inputProof);

        euint64 current = _values[msg.sender];
        if (!FHE.isInitialized(current)) {
            current = FHE.asEuint64(0);
        }

        _values[msg.sender] = FHE.add(current, amount);

        FHE.allowThis(_values[msg.sender]);
        FHE.allow(_values[msg.sender], msg.sender);

        emit ValueChanged(msg.sender);
    }

    /// @notice Returns the ciphertext handle for an account.
    /// @dev    Handle itself is public; only ACL-listed parties can decrypt.
    function getValue(address account) external view returns (euint64) {
        return _values[account];
    }
}
