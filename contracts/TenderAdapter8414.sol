// SPDX-License-Identifier: Apache-2.0
pragma solidity 0.8.24;

import {IGenesisLedger} from "./interfaces/IGenesisLedger.sol";
import {ITaskTender8414} from "./interfaces/ITaskTender8414.sol";
import {G1Facts} from "./GenesisTypes.sol";

/// @title  G1 adapter: turns a settled ERC-8414 fulfillment into a Genesis receipt.
/// @notice Reads one ERC-8414 contract and changes nothing in it. A fulfillment that the tender
///         has settled - by its judge, by its verifier, or by default after the judgment window -
///         is reported to the ledger with the facts the subsidy rules need; the ledger decides
///         eligibility. The bounty was paid by the tender's own vault and is not touched here.
///
///         Only the tender's owner can bridge. A tender, and the right to judge it, can be handed
///         to any address without that address agreeing, so "who owns the tender now" is not
///         evidence of whose demand it was: a worker could settle a tender of its own and push it
///         onto somebody else. The owner's own call is the statement the ledger relies on - this
///         was my tender, and it was settled. The standard does not expose who funded a tender, so
///         nothing stronger can be read from it; two parties who agree to pretend are not detected.
contract TenderAdapter8414 {
    IGenesisLedger public immutable ledger;
    ITaskTender8414 public immutable taskToken;
    bytes32 public immutable profileKey;

    event TenderBridged(uint256 indexed tokenId, uint256 indexed submissionId, uint256 receiptId, uint8 ineligible);

    error NotSettled(uint256 tokenId, uint256 submissionId);
    error NotDemander(address caller, address owner);

    constructor(IGenesisLedger ledger_, ITaskTender8414 taskToken_, string memory profileName) {
        ledger = ledger_;
        taskToken = taskToken_;
        profileKey = keccak256(bytes(profileName));
    }

    /// @notice Bridge one settled submission of a tender the caller owns. A second call for the
    ///         same submission returns the receipt that exists.
    function bridge(uint256 tokenId, uint256 submissionId) external returns (uint256 receiptId, uint8 ineligible) {
        address owner = taskToken.ownerOf(tokenId);
        if (msg.sender != owner) revert NotDemander(msg.sender, owner);
        ITaskTender8414.Submission memory s = taskToken.submissionOf(tokenId, submissionId);
        if (s.status != ITaskTender8414.SubmissionStatus.Accepted) revert NotSettled(tokenId, submissionId);
        ITaskTender8414.TenderTerms memory t = taskToken.tenderTermsOf(tokenId);
        ITaskTender8414.TaskBinding memory b = taskToken.taskOf(tokenId);

        G1Facts memory f;
        f.source = address(taskToken);
        f.tokenId = tokenId;
        f.submissionId = submissionId;
        f.worker = s.fulfiller;
        f.demander = owner;
        f.judge = taskToken.acceptanceAuthorityOf(tokenId);
        // the task as cited by the submission; zero when the binding has moved on since
        f.inputHash = b.version == s.taskVersion ? b.taskHash : bytes32(0);
        f.outputHash = s.resultHash;
        f.asset = t.asset;
        f.reward = t.rewardPerCompletion;
        f.deliveredAt = s.submittedAt;

        (receiptId, ineligible) = ledger.recordG1(profileKey, f);
        emit TenderBridged(tokenId, submissionId, receiptId, ineligible);
    }
}
