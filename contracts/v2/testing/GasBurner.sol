// SPDX-License-Identifier: Apache-2.0
pragma solidity 0.8.39;

/// @notice A view that uses whatever gas it is given, down to a little, and then answers 1: for the
///         test of how the probe of contract accounts reads a call that succeeded with all of its
///         bound. Not part of the protocol, and never deployed.
contract GasBurner {
    function read() external view returns (uint256) {
        assembly {
            for {} gt(gas(), 1000) {} {}
            mstore(0, 1)
            return(0, 32)
        }
    }
}
