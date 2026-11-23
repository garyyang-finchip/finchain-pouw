// SPDX-License-Identifier: Apache-2.0
pragma solidity 0.8.24;

/// @notice A G0 reference function: deterministic, recomputed on chain. Requirements a function
///         must meet to be registered in a profile: the cost of an instance does not depend on
///         the seed, the output is a 32-byte digest (no small answer space), and the result has
///         a stated use (docs/genesis-mining-mvp.md, section 5).
interface IG0Function {
    /// @notice Identifies the function across profile versions.
    function functionId() external view returns (bytes32);

    /// @notice The input commitment and the expected output of one worker's instance.
    ///         MUST revert for a job index the function does not define.
    function evaluate(uint64 epoch, uint32 jobIndex, address worker, bytes32 instance)
        external view returns (bytes32 inputHash, bytes32 expectedOutput);
}
