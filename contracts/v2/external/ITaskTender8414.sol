// SPDX-License-Identifier: Apache-2.0
pragma solidity 0.8.39;

/// @notice The read surface of an ERC-8414 Token-Bound Task Tender contract (TASK-KERNEL v3.0)
///         that the Genesis adapter and the audit use. Types and events mirror the standard's
///         interface; nothing here is called to change a tender.
/// @dev    v2's own copy of the kernel's interface of the same name (contracts/interfaces/), for the
///         reason given in ISeedSource.sol of this directory. A test holds the two to the same ABI.
interface ITaskTender8414 {
    struct TenderTerms {
        address asset;
        uint256 rewardPerCompletion;
        uint64 maxCompletions;
        uint64 submitBy;
        uint64 settleBy;
        uint64 epochLength;
        uint64 maxCompletionsPerEpoch;
        uint64 judgmentWindow;
    }

    enum SubmissionStatus { Pending, Accepted, Rejected }

    struct Submission {
        address fulfiller;
        bytes32 resultHash;
        uint64 taskVersion;
        uint64 submittedAt;
        bool machineSettled;
        SubmissionStatus status;
    }

    struct TaskBinding {
        bytes32 tdHash;
        bytes32 taskHash;
        uint64 version;
    }

    // The events an audit needs to rebuild, from the log alone, who owned and who judged a tender
    // at any moment and which task version was bound: ownership, the judgment right and the task
    // binding all change hands in ERC-8414, and an old state cannot be asked of every node.
    event Transfer(address indexed from, address indexed to, uint256 indexed tokenId);
    event AcceptanceAuthorityChanged(uint256 indexed tokenId, address indexed previousAuthority,
                                     address indexed newAuthority);
    event TaskUpdated(uint256 indexed tokenId, bytes32 tdHash, bytes32 taskHash, uint64 version);

    /// @notice Emitted by every settlement of a submission, whatever its path.
    event FulfillmentAccepted(uint256 indexed tokenId, uint256 indexed submissionId,
                              address indexed fulfiller, uint256 reward);
    /// @notice Emitted immediately before `FulfillmentAccepted` when the settlement came from the
    ///         judgment deadline rather than from a judge. The standard keeps no state for it, so
    ///         only the log tells a default from a ruling; an audit reads it, a contract cannot.
    event FulfillmentClaimedUnjudged(uint256 indexed tokenId, uint256 indexed submissionId,
                                     address indexed fulfiller, uint64 deadline);

    function ownerOf(uint256 tokenId) external view returns (address);
    function acceptanceAuthorityOf(uint256 tokenId) external view returns (address);
    function tenderTermsOf(uint256 tokenId) external view returns (TenderTerms memory);
    function submissionOf(uint256 tokenId, uint256 submissionId) external view returns (Submission memory);
    function taskOf(uint256 tokenId) external view returns (TaskBinding memory);
}
