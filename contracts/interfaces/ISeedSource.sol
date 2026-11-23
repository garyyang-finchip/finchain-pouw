// SPDX-License-Identifier: Apache-2.0
pragma solidity 0.8.24;

/// @notice Where an epoch's seed material comes from. The material is public and can be
///         observed before it is captured; it serves to make work instances differ per epoch
///         and per worker, and is not a randomness beacon (docs/genesis-mining-mvp.md, section 5).
interface ISeedSource {
    function seedMaterial() external view returns (bytes32);
}
