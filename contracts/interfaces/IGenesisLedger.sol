// SPDX-License-Identifier: Apache-2.0
pragma solidity 0.8.24;

import {Receipt, Status, G1Facts, EpochSummary} from "../GenesisTypes.sol";

interface IGenesisLedger {
    event EpochOpened(uint64 indexed epoch, bytes32 seed, bytes32 seedMaterial, uint32 paramsVersion);
    event ReceiptRecorded(uint256 indexed id, uint64 indexed epoch, address indexed worker, Receipt receipt);
    event ReceiptStatus(uint256 indexed id, Status status);
    event EpochSealed(uint64 indexed epoch, bytes32 digest, uint64 receiptCount, uint32 paramsVersion,
        uint128 budget, uint128 measuredG0, uint128 measuredG1, uint128 subsidizedG0, uint128 subsidizedG1);

    error Paused();
    error WrongPool();
    error JobIndexOutOfRange();
    error WrongEpoch(uint64 current);
    error AlreadySubmitted(uint256 receiptId);
    error NotAdapter();
    error EpochNotEnded(uint64 epoch);
    error UnknownReceipt(uint256 id);

    function domain() external view returns (bytes32);
    function configHash() external view returns (bytes32);

    /// @notice Capture the current epoch's seed if nobody has yet. Anyone may call; the first
    ///         receipt of an epoch does the same.
    function openEpoch() external returns (uint64 epoch);

    /// @notice Emit the close record of an ended epoch. Anyone may call, once the epoch's interval
    ///         has passed; it takes no figures and changes none.
    function seal(uint64 epoch) external;

    /// @notice Submit the output of the caller's own instance of a G0 job of the current epoch.
    ///         `epoch` names the epoch the output was computed for: a submission that lands after
    ///         that epoch has turned reverts and spends nothing. One attempt per instance: a wrong
    ///         output for the epoch named is recorded as rejected.
    function submitG0(bytes32 profileKey, uint64 epoch, uint32 jobIndex, bytes32 outputHash)
        external returns (uint256 id);

    /// @notice Record a settled real-demand contribution. Only the active G1 profile's adapter.
    ///         Recording the same contribution again returns the existing receipt.
    function recordG1(bytes32 profileKey, G1Facts calldata facts) external returns (uint256 id, uint8 ineligible);

    function receiptCount() external view returns (uint256);
    function receipt(uint256 id) external view returns (Receipt memory);
    function status(uint256 id) external view returns (Status memory);
    function receiptOfContribution(bytes32 contributionId) external view returns (uint256);

    function seedOf(uint64 epoch) external view returns (bytes32);
    function epochSummary(uint64 epoch) external view returns (EpochSummary memory);
    function auditSubject(uint64 epoch) external view returns (bytes32);
    function measuredOf(uint64 epoch, uint8 pool, address worker) external view returns (uint128);
    function subsidizedOf(uint64 epoch, uint8 pool, address worker) external view returns (uint128);

    /// @notice A worker's test points of an ended epoch: a pure function of the epoch's frozen
    ///         ledger and its pinned parameters. Reverts while the epoch is running.
    function allocation(uint64 epoch, address worker) external view returns (uint256);

    /// @notice The same computation on a running epoch: provisional, it changes with every receipt.
    function provisionalAllocation(uint64 epoch, address worker) external view returns (uint256);
}
