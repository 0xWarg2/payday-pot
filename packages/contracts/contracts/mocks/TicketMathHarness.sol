// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import {FHE, euint64, euint128, externalEuint64} from "@fhevm/solidity/lib/FHE.sol";
import {ZamaEthereumConfig} from "@fhevm/solidity/config/ZamaConfig.sol";

/// @title TicketMathHarness — TEST-ONLY mirror of PayDayPot's P-2 ticket math
/// @notice The pot's randomness cannot be injected (requestRandom takes no
///         parameters BY DESIGN, rule #7), so the mandatory overflow-boundary
///         test (max random × max weight) runs the identical promote → mul →
///         shr(64) → downcast chain here on caller-supplied encrypted inputs.
/// @dev    Test fixture only, never deployed to a public network by our
///         scripts. Any change to requestRandom's ticket derivation must be
///         mirrored here or the boundary tests stop guarding the real math.
contract TicketMathHarness is ZamaEthereumConfig {
    euint64 private _lastTicket;

    /// @notice Compute ticket = ⌊random · weight / 2^64⌋ exactly as
    ///         PayDayPot.requestRandom does, and grant the caller decrypt
    ///         rights on the result for exact-value assertions.
    function computeTicket(externalEuint64 randomIn, externalEuint64 weightIn, bytes calldata inputProof) external {
        euint64 rnd = FHE.fromExternal(randomIn, inputProof);
        euint64 weight = FHE.fromExternal(weightIn, inputProof);

        // EXACT copy of PayDayPot.requestRandom's ticket derivation (P-2).
        euint128 product = FHE.mul(FHE.asEuint128(rnd), FHE.asEuint128(weight));
        euint64 ticket = FHE.asEuint64(FHE.shr(product, 64));

        _lastTicket = ticket;
        FHE.allowThis(ticket);
        FHE.allow(ticket, msg.sender);
    }

    function lastTicket() external view returns (euint64) {
        return _lastTicket;
    }
}
