// SPDX-License-Identifier: Apache-2.0
pragma solidity 0.8.24;

import {ISeedSource} from "../interfaces/ISeedSource.sol";

interface IL1Block {
    function hash() external view returns (bytes32);
    function number() external view returns (uint64);
}

/// @notice Seed material on an OP Stack chain: the hash of the latest L1 block the chain knows,
///         read from the L1Block predeploy. It is the most recent L1 origin, public as soon as
///         the L2 block that carries it exists; whoever captures the seed chooses the moment, and
///         the sequencer chooses the origin. Not a randomness beacon.
contract L1BlockSeedSource is ISeedSource {
    IL1Block public constant L1_BLOCK = IL1Block(0x4200000000000000000000000000000000000015);

    function seedMaterial() external view returns (bytes32) {
        return keccak256(abi.encode(L1_BLOCK.number(), L1_BLOCK.hash()));
    }
}
