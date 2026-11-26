// SPDX-License-Identifier: Apache-2.0
pragma solidity 0.8.39;

import {ISeedSource} from "../external/ISeedSource.sol";

/// @notice Seed material from the previous block's hash: for any EVM chain and for local runs.
///         Observable before it is captured, and chosen by whoever produces the block.
/// @dev    v2's own copy of the kernel's contract of the same name (contracts/seed/), compiled
///         inside the v2 boundary by the v2 compiler (docs/decisions.md A87, Q33). A test holds the
///         two texts to the same lines apart from this note, the compiler pragma and the import,
///         and holds their answers to be the same.
contract PrevBlockSeedSource is ISeedSource {
    function seedMaterial() external view returns (bytes32) {
        return blockhash(block.number - 1);
    }
}
