// SPDX-License-Identifier: Apache-2.0
pragma solidity 0.8.24;

/// @notice Stands in for the OP Stack L1Block predeploy in the test of the L1 seed source: the two
///         getters the source reads, with values a test can set. Not part of the protocol.
contract MockL1Block {
    bytes32 public hash;
    uint64 public number;

    function set(uint64 number_, bytes32 hash_) external {
        number = number_;
        hash = hash_;
    }
}
