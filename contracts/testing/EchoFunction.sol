// SPDX-License-Identifier: Apache-2.0
pragma solidity 0.8.24;

import {IG0Function} from "../interfaces/IG0Function.sol";

/// @notice A G0 function with as many jobs as a profile gives it, for the tests in which one
///         participant has more than one instance in an epoch. Its output shows nothing and it
///         meets none of the requirements a function must meet to be registered on a public
///         deployment. Not part of the protocol.
contract EchoFunction is IG0Function {
    bytes32 public constant FUNCTION_ID = keccak256("finchain-pouw.testing.echo");

    function functionId() external pure returns (bytes32) {
        return FUNCTION_ID;
    }

    function evaluate(uint64 epoch, uint32 jobIndex, address, bytes32 instance)
        external pure returns (bytes32 inputHash, bytes32 expectedOutput)
    {
        inputHash = keccak256(abi.encode(FUNCTION_ID, epoch, jobIndex));
        expectedOutput = keccak256(abi.encode(instance, inputHash));
    }
}
