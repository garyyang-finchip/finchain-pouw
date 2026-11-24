// SPDX-License-Identifier: Apache-2.0
pragma solidity 0.8.24;

import {IGenesisLedgerV2} from "./interfaces/IGenesisLedgerV2.sol";
import {ITaskTender8414} from "../interfaces/ITaskTender8414.sol";
import {G1Facts, G1Extra, Entry, Permit, FactData, OP_CONFIRM_TENDER} from "./TypesV2.sol";

/// @title  G1 module of ledger v2 for ERC-8414 tenders: records a settlement as a fact, and turns
///         a settlement that its demander confirms into a Genesis receipt.
/// @notice Reads one ERC-8414 contract and changes nothing in it. Two records, kept apart:
///
///         A fact is what anyone can have recorded of a settled submission: what this contract
///         reads from the tender in that call. It counts nothing and stands in nobody's way.
///
///         A receipt exists only when the tender's owner confirms: by its own call (`confirm`),
///         or through the one key it named in a permit (`confirmFor`). A tender, and the right to
///         judge it, can be handed to any address without that address agreeing, so "who owns
///         the tender now" is not evidence of whose demand it was; the owner's confirmation is
///         the statement the ledger relies on. The standard does not expose who funded a tender,
///         so nothing stronger can be read from it; two parties who agree to pretend are not
///         detected.
///
///         On the delegated entry this contract reads its own caller, has the ledger check the
///         permit for that caller, and requires the permit's account to be the tender's owner.
///         No caller can state a sender, and the origin of the transaction is never read.
///
///         The owner and the acceptance authority are read when the confirmation is recorded and
///         not as they were when the submission settled: the standard keeps no state of who held
///         either at that moment (docs/ledger-v2.md, section 10).
///
///         This module serves a profile version that does not count task units: it states no
///         unit, no content key, no parent and no envelope.
contract TenderAdapter8414V2 {
    IGenesisLedgerV2 public immutable ledger;
    ITaskTender8414 public immutable taskToken;
    bytes32 public immutable profileKey;

    event TenderFact(uint256 indexed tokenId, uint256 indexed submissionId, bytes32 factId, address recorder);
    event TenderConfirmed(uint256 indexed tokenId, uint256 indexed submissionId, uint256 receiptId, uint8 ineligible,
        address sender, bytes32 authorization);

    error NotSettled(uint256 tokenId, uint256 submissionId);
    error NotDemander(address caller, address owner);
    error NotOwnersPermit(address account, address owner);

    constructor(IGenesisLedgerV2 ledger_, ITaskTender8414 taskToken_, string memory profileName) {
        ledger = ledger_;
        taskToken = taskToken_;
        profileKey = keccak256(bytes(profileName));
    }

    /// @notice Record the settlement of a submission as a fact. Anyone may call. A second call for
    ///         the same submission returns the fact that exists.
    function recordFact(uint256 tokenId, uint256 submissionId) external returns (bytes32 factId) {
        ITaskTender8414.Submission memory s = _settled(tokenId, submissionId);
        ITaskTender8414.TenderTerms memory t = taskToken.tenderTermsOf(tokenId);
        FactData memory d;
        d.source = address(taskToken);
        d.tokenId = tokenId;
        d.submissionId = submissionId;
        d.fulfiller = s.fulfiller;
        d.owner = taskToken.ownerOf(tokenId);
        d.judge = taskToken.acceptanceAuthorityOf(tokenId);
        d.taskHash = _taskHash(tokenId, s.taskVersion);
        d.resultHash = s.resultHash;
        d.asset = t.asset;
        d.reward = t.rewardPerCompletion;
        d.deliveredAt = s.submittedAt;
        d.recorder = msg.sender;
        factId = ledger.recordFact(profileKey, d);
        emit TenderFact(tokenId, submissionId, factId, msg.sender);
    }

    /// @notice Confirm one settled submission of a tender the caller owns. A second call for the
    ///         same submission returns the receipt that exists.
    function confirm(uint256 tokenId, uint256 submissionId) external returns (uint256 receiptId, uint8 ineligible) {
        address owner = taskToken.ownerOf(tokenId);
        if (msg.sender != owner) revert NotDemander(msg.sender, owner);
        return _confirm(tokenId, submissionId, owner, Entry({sender: msg.sender, authorization: bytes32(0)}));
    }

    /// @notice The same as the delegate named in `permit`, for a tender that `permit.account` owns.
    function confirmFor(Permit calldata permit, bytes calldata signature, uint256 tokenId, uint256 submissionId)
        external returns (uint256 receiptId, uint8 ineligible)
    {
        address owner = taskToken.ownerOf(tokenId);
        if (permit.account != owner) revert NotOwnersPermit(permit.account, owner);
        bytes32 digest = ledger.checkPermit(permit, signature, msg.sender, OP_CONFIRM_TENDER);
        return _confirm(tokenId, submissionId, owner, Entry({sender: msg.sender, authorization: digest}));
    }

    function _confirm(uint256 tokenId, uint256 submissionId, address owner, Entry memory entry)
        private returns (uint256 receiptId, uint8 ineligible)
    {
        ITaskTender8414.Submission memory s = _settled(tokenId, submissionId);
        ITaskTender8414.TenderTerms memory t = taskToken.tenderTermsOf(tokenId);

        G1Facts memory f;
        f.source = address(taskToken);
        f.tokenId = tokenId;
        f.submissionId = submissionId;
        f.worker = s.fulfiller;
        f.demander = owner;
        f.judge = taskToken.acceptanceAuthorityOf(tokenId);
        f.inputHash = _taskHash(tokenId, s.taskVersion);
        f.outputHash = s.resultHash;
        f.asset = t.asset;
        f.reward = t.rewardPerCompletion;
        f.deliveredAt = s.submittedAt;

        G1Extra memory x; // no unit, no key, no parent, no envelope
        (receiptId, ineligible) = ledger.recordG1(profileKey, f, x, entry);
        emit TenderConfirmed(tokenId, submissionId, receiptId, ineligible, entry.sender, entry.authorization);
    }

    function _settled(uint256 tokenId, uint256 submissionId) private view returns (ITaskTender8414.Submission memory s) {
        s = taskToken.submissionOf(tokenId, submissionId);
        if (s.status != ITaskTender8414.SubmissionStatus.Accepted) revert NotSettled(tokenId, submissionId);
    }

    /// @dev The task as cited by the submission; zero when the binding has moved on since.
    function _taskHash(uint256 tokenId, uint64 taskVersion) private view returns (bytes32) {
        ITaskTender8414.TaskBinding memory b = taskToken.taskOf(tokenId);
        return b.version == taskVersion ? b.taskHash : bytes32(0);
    }
}
