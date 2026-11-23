// SPDX-License-Identifier: Apache-2.0
pragma solidity 0.8.24;

import {ISeedSource} from "../interfaces/ISeedSource.sol";

/// @notice Seed material from the previous block's hash: for any EVM chain and for local runs.
///         Observable before it is captured, and chosen by whoever produces the block.
contract PrevBlockSeedSource is ISeedSource {
    function seedMaterial() external view returns (bytes32) {
        return blockhash(block.number - 1);
    }
}
