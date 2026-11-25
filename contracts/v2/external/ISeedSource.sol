// SPDX-License-Identifier: Apache-2.0
pragma solidity 0.8.39;

/// @notice Where an epoch's seed material comes from. The material is public and can be
///         observed before it is captured; it serves to make work instances differ per epoch
///         and per worker, and is not a randomness beacon (docs/genesis-mining-mvp.md, section 5).
/// @dev    v2's own copy of the kernel's interface of the same name (contracts/interfaces/). The v2
///         contracts are compiled apart from the kernel, by another compiler, and import nothing from
///         outside contracts/v2: what the two share is this interface as an ABI, and a test holds the
///         two declarations to the same ABI.
interface ISeedSource {
    function seedMaterial() external view returns (bytes32);
}
