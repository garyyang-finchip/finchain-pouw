// SPDX-License-Identifier: Apache-2.0
pragma solidity 0.8.39;

import {ISeedSource} from "../external/ISeedSource.sol";

interface IL1Block {
    function hash() external view returns (bytes32);
    function number() external view returns (uint64);
}

/// @notice Seed material on an OP Stack chain: the hash of the latest L1 block the chain knows,
///         read from the L1Block predeploy. It is the most recent L1 origin, public as soon as
///         the L2 block that carries it exists; whoever captures the seed chooses the moment, and
///         the sequencer chooses the origin. Not a randomness beacon.
/// @dev    v2's own copy of the kernel's contract of the same name (contracts/seed/), compiled
///         inside the v2 boundary by the v2 compiler (docs/decisions.md A87, Q33). A test holds the
///         two texts to the same lines apart from this note, the compiler pragma and the import,
///         and holds their answers to be the same.
contract L1BlockSeedSource is ISeedSource {
    IL1Block public constant L1_BLOCK = IL1Block(0x4200000000000000000000000000000000000015);

    function seedMaterial() external view returns (bytes32) {
        return keccak256(abi.encode(L1_BLOCK.number(), L1_BLOCK.hash()));
    }
}
