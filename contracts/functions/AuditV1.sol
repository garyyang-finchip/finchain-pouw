// SPDX-License-Identifier: Apache-2.0
pragma solidity 0.8.24;

import {IG0Function} from "../interfaces/IG0Function.sol";
import {IGenesisLedger} from "../interfaces/IGenesisLedger.sol";

/// @title  The first G0 reference function: the audit of the previous epoch.
/// @notice One job per worker per epoch. In epoch N the job is the audit of epoch N-1: the worker
///         re-decides the receipts of N-1 from primary data, recomputes their rolling digest and
///         the four GMU totals, and submits the result bound to its own instance; in epoch 0 the
///         subject is the deployment's configuration. An output is accepted only if it equals
///         what the ledger holds, so a worker whose recomputation differs cannot be accepted -
///         the reference client then submits nothing and reports the difference.
///
///         The expected output is computed here from the ledger's own figures, which anyone can
///         read. An accepted receipt therefore shows that an address was present in the epoch
///         and submitted the right value for its instance. It does not show that the audit was
///         carried out, and it is not evidence of any amount of computation. That is the limit
///         of every function verified by recomputation on chain, and the reason the job carries
///         a small fixed GMU.
contract AuditV1 is IG0Function {
    bytes32 public constant FUNCTION_ID = keccak256("finchain-pouw.g0.ref.audit-v1");
    IGenesisLedger public immutable ledger;

    error UndefinedJob(uint32 jobIndex);

    constructor(IGenesisLedger ledger_) {
        ledger = ledger_;
    }

    function functionId() external pure returns (bytes32) {
        return FUNCTION_ID;
    }

    /// @notice What the audit of `epoch` commits to.
    function subjectOf(uint64 epoch) public view returns (bytes32) {
        return epoch == 0 ? ledger.configHash() : ledger.auditSubject(epoch - 1);
    }

    /// @dev Only job 0 exists: a second audit of the same epoch by the same worker would be
    ///      repetition without use, whatever a profile's job count says.
    function evaluate(uint64 epoch, uint32 jobIndex, address, bytes32 instance)
        external view returns (bytes32 inputHash, bytes32 expectedOutput)
    {
        if (jobIndex != 0) revert UndefinedJob(jobIndex);
        inputHash = keccak256(abi.encode(FUNCTION_ID, epoch, subjectOf(epoch)));
        expectedOutput = keccak256(abi.encode(instance, inputHash));
    }
}
