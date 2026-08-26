// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import {FHE, euint64, externalEuint64} from "@fhevm/solidity/lib/FHE.sol";
import {ZamaEthereumConfig} from "@fhevm/solidity/config/ZamaConfig.sol";
import {IERC20} from "@openzeppelin/contracts/interfaces/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {
    IERC7984ERC20Wrapper
} from "@openzeppelin/confidential-contracts/interfaces/IERC7984ERC20Wrapper.sol";

/// @title CompatSpike — compatibility spike for PayDay Pot
/// @notice Throwaway contract proving the exact FHE API surface Day 2 depends on:
///         encrypted input verification (fromExternal + proof), FHE.add,
///         ACL refresh (allowThis/allow) after every new handle, and a
///         user-owned ciphertext getter for EIP-712 user decryption.
///         Day 5 adds `spikeWrap` — the wrap-BY-CONTRACT shape Day 5's
///         `fundPrize` depends on (never exercised before Day 5).
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

    // ---------------------------------------------------------------------
    // Day 5 spike — wrap BY CONTRACT (the fundPrize shape)
    // ---------------------------------------------------------------------

    /// @notice Pull `amount` underlying from `msg.sender`, then wrap it into
    ///         confidential tokens credited to THIS contract.
    /// @dev    This is the exact 3-step sequence PayDayPot.fundPrize uses:
    ///         pull (reverting ERC-20 semantics — the plaintext backing check
    ///         R12 needs) → forceApprove → wrapper.wrap(address(this), …).
    ///         `wrap` is SYNCHRONOUS (unlike unwrap, which is a 2-tx async
    ///         request/finalize dance we deliberately never enter), and its
    ///         `_mint` grants this contract a persistent ACL on the resulting
    ///         balance handle. Proving that here de-risks Day 5's funding
    ///         path before a single line of product code is written.
    function spikeWrap(IERC7984ERC20Wrapper wrapper, uint256 amount) external {
        IERC20 underlying = IERC20(wrapper.underlying());
        SafeERC20.safeTransferFrom(underlying, msg.sender, address(this), amount);
        // forceApprove, not approve: non-standard ERC-20s revert when setting a
        // non-zero allowance over a non-zero one (leftovers can never happen
        // here, but the product contract must not depend on that reasoning).
        SafeERC20.forceApprove(underlying, address(wrapper), amount);
        wrapper.wrap(address(this), amount);
    }

    /// @notice Send `amount` of this contract's confidential balance to `to`.
    /// @dev    The defundPrize shape: a trivially-encrypted amount this
    ///         contract owns the ACL on, granted transiently to the token so
    ///         `confidentialTransfer` accepts it (ERC-7984 requires
    ///         FHE.isAllowed(amount, msg.sender)).
    function spikeTransfer(IERC7984ERC20Wrapper wrapper, address to, uint64 amount) external {
        euint64 value = FHE.asEuint64(amount);
        FHE.allowThis(value);
        FHE.allowTransient(value, address(wrapper));
        wrapper.confidentialTransfer(to, value);
    }
}
