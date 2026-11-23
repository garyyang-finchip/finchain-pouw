// SPDX-License-Identifier: Apache-2.0
pragma solidity 0.8.24;

import {ISeedSource} from "../interfaces/ISeedSource.sol";

/// @notice A seed source whose material anyone can set: for the tests that show the seed is
///         observable and selectable. Not part of the protocol.
contract FixedSeedSource is ISeedSource {
    bytes32 public seedMaterial;

    function set(bytes32 material) external {
        seedMaterial = material;
    }
}
