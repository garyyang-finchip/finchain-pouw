// SPDX-License-Identifier: Apache-2.0
pragma solidity 0.8.24;

import {IGenesisLedger} from "./interfaces/IGenesisLedger.sol";
import {IGenesisPolicy} from "./interfaces/IGenesisPolicy.sol";
import {ISeedSource} from "./interfaces/ISeedSource.sol";
import {IG0Function} from "./interfaces/IG0Function.sol";
import "./GenesisTypes.sol";

/// @title  Genesis Mining ledger: work receipts, the GMU of verified work per epoch, and the
///         epoch's allocation of test points.
/// @notice What this contract establishes is that work was recorded, checked by a deterministic
///         rule and counted under parameters fixed before the epoch. It does not establish how
///         much computation a result took, that two parties are independent, or that an epoch's
///         seed was unpredictable.
///
///         An epoch is an interval of the policy's clock. A receipt is final when it is recorded
///         and counts in the epoch it is recorded in, so an epoch's ledger is frozen by time alone:
///         once the interval has passed nothing can be added. The running totals are kept as the
///         receipts come in, which makes the allocation a pure function of stored figures - there
///         is nothing to submit at the close, no order of settlement and no participant bound.
///         Test points are that function's value and nothing else: no balance is kept, nothing
///         is transferred or claimed.
contract GenesisLedger is IGenesisLedger {
    IGenesisPolicy public immutable policy;
    ISeedSource public immutable seedSource;
    /// @notice Separates this deployment's receipts from any other chain's or deployment's.
    bytes32 public immutable domain;

    struct EpochState {
        bytes32 seed;
        bytes32 digest;
        uint64 receiptCount;
        bool isSealed;
        uint128 measuredG0;
        uint128 measuredG1;
        uint128 subsidizedG0;
        uint128 subsidizedG1;
    }

    mapping(uint64 => EpochState) private _epochs;
    mapping(uint64 => mapping(uint8 => mapping(address => uint128))) private _measured;
    mapping(uint64 => mapping(uint8 => mapping(address => uint128))) private _subsidized;
    // subsidized GMU per profile key, for the profile's per-worker cap
    mapping(uint64 => mapping(bytes32 => mapping(address => uint64))) private _accrued;
    mapping(uint64 => mapping(address => uint32)) private _demanderCount;
    mapping(uint64 => mapping(address => mapping(address => uint32))) private _pairCount;

    Receipt[] private _receipts; // receipt id = index + 1
    mapping(uint256 => Status) private _status;
    mapping(bytes32 => uint256) public receiptOfContribution;

    constructor(IGenesisPolicy policy_, ISeedSource seedSource_) {
        policy = policy_;
        seedSource = seedSource_;
        domain = keccak256(abi.encode("finchain-pouw.genesis-ledger.v1", block.chainid, address(this)));
    }

    /// @notice What an audit of the deployment itself attests to (the G0 audit job of epoch 0).
    function configHash() public view returns (bytes32) {
        return keccak256(abi.encode(domain, address(policy), address(seedSource), policy.genesisTime(),
            policy.epochDuration()));
    }

    // ------------------------------------------------------------------ epochs

    function openEpoch() external returns (uint64 epoch) {
        epoch = policy.currentEpoch();
        _touch(epoch);
    }

    function seal(uint64 epoch) external {
        if (!_ended(epoch)) revert EpochNotEnded(epoch);
        if (!_epochs[epoch].isSealed) _seal(epoch);
    }

    /// @dev Capture the epoch's seed on first use and emit the close record of the epoch before.
    function _touch(uint64 epoch) private {
        EpochState storage s = _epochs[epoch];
        if (s.seed != bytes32(0)) return;
        bytes32 material = seedSource.seedMaterial();
        bytes32 seed = keccak256(abi.encode(domain, epoch, material));
        s.seed = seed;
        (uint32 version,) = policy.paramsFor(epoch);
        emit EpochOpened(epoch, seed, material, version);
        if (epoch != 0 && !_epochs[epoch - 1].isSealed) _seal(epoch - 1);
    }

    function _seal(uint64 epoch) private {
        EpochState storage s = _epochs[epoch];
        s.isSealed = true;
        (uint32 version,) = policy.paramsFor(epoch);
        emit EpochSealed(epoch, s.digest, s.receiptCount, version, policy.budgetFor(epoch), s.measuredG0,
            s.measuredG1, s.subsidizedG0, s.subsidizedG1);
    }

    function _ended(uint64 epoch) private view returns (bool) {
        return block.timestamp >= policy.epochEnd(epoch);
    }

    // ------------------------------------------------------------------ G0: protocol work

    function submitG0(bytes32 profileKey, uint64 epoch, uint32 jobIndex, bytes32 outputHash)
        external returns (uint256 id)
    {
        if (policy.paused()) revert Paused();
        uint64 current = policy.currentEpoch();
        if (epoch != current) revert WrongEpoch(current);
        _touch(epoch);

        Profile memory p = policy.activeProfile(profileKey, epoch);
        if (p.pool != POOL_G0) revert WrongPool();
        if (jobIndex >= p.jobsPerEpoch) revert JobIndexOutOfRange();

        bytes32 functionId = IG0Function(p.module).functionId();
        // the worker's own instance: different for every worker and every epoch
        bytes32 instance = keccak256(abi.encode(_epochs[epoch].seed, functionId, jobIndex, msg.sender));
        bytes32 contributionId = keccak256(abi.encode(domain, POOL_G0, functionId, epoch, jobIndex, msg.sender));
        if (receiptOfContribution[contributionId] != 0) revert AlreadySubmitted(receiptOfContribution[contributionId]);

        (bytes32 inputHash, bytes32 expected) = IG0Function(p.module).evaluate(epoch, jobIndex, msg.sender, instance);

        Receipt memory r = Receipt({
            epoch: epoch,
            pool: POOL_G0,
            profileId: p.id,
            worker: msg.sender,
            counterparty: address(0),
            ref: instance,
            inputHash: inputHash,
            outputHash: outputHash,
            contributionId: contributionId,
            recordedAt: uint64(block.timestamp)
        });
        id = _record(r);

        Status memory st;
        st.verifier = p.module;
        if (outputHash != expected) {
            st.verdict = VERDICT_REJECTED;
            st.ineligible = INELIGIBLE_REJECTED;
        } else {
            st.verdict = VERDICT_ACCEPTED;
            st.gmuMeasured = p.baseGmu;
            if (!policy.isAdmitted(msg.sender)) st.ineligible = INELIGIBLE_NOT_ADMITTED;
            else (st.gmuSubsidized, st.ineligible) = _subsidy(epoch, p, msg.sender);
        }
        _finish(id, r, p.key, st);
    }

    // ------------------------------------------------------------------ G1: real demand

    function recordG1(bytes32 profileKey, G1Facts calldata f) external returns (uint256 id, uint8 ineligible) {
        if (policy.paused()) revert Paused();
        uint64 epoch = policy.currentEpoch();
        Profile memory p = policy.activeProfile(profileKey, epoch);
        if (p.pool != POOL_G1) revert WrongPool();
        if (msg.sender != p.module) revert NotAdapter();

        // the contribution is the settled submission itself, whatever profile or adapter reports it
        bytes32 contributionId = keccak256(abi.encode(domain, POOL_G1, f.source, f.tokenId, f.submissionId));
        id = receiptOfContribution[contributionId];
        if (id != 0) return (id, _status[id].ineligible);

        _touch(epoch);
        Receipt memory r = Receipt({
            epoch: epoch,
            pool: POOL_G1,
            profileId: p.id,
            worker: f.worker,
            counterparty: f.demander,
            ref: keccak256(abi.encode(f.source, f.tokenId, f.submissionId)),
            inputHash: f.inputHash,
            outputHash: f.outputHash,
            contributionId: contributionId,
            recordedAt: uint64(block.timestamp)
        });
        id = _record(r);
        Status memory st = _judgeG1(epoch, p, f);
        _finish(id, r, p.key, st);
        ineligible = st.ineligible;
    }

    /// @dev The settlement is the verdict; whether the receipt draws the subsidy is a second
    ///      question, answered by the epoch's rules in a fixed order.
    function _judgeG1(uint64 epoch, Profile memory p, G1Facts calldata f) private returns (Status memory st) {
        st.verdict = VERDICT_ACCEPTED;
        st.verifier = msg.sender;
        st.gmuMeasured = p.baseGmu;

        uint32 operator = policy.operatorOf(f.worker);
        if (operator != 0 && (operator == policy.operatorOf(f.demander) || operator == policy.operatorOf(f.judge))) {
            st.relation = RELATION_DECLARED_RELATED;
        }
        (, Params memory q) = policy.paramsFor(epoch);

        if (f.worker == f.demander || f.worker == f.judge) {
            st.ineligible = INELIGIBLE_SELF_DEALING;
        } else if (f.deliveredAt < policy.genesisTime()) {
            st.ineligible = INELIGIBLE_BEFORE_GENESIS;
        } else if (!policy.isAdmitted(f.worker)) {
            st.ineligible = INELIGIBLE_NOT_ADMITTED;
        } else if (!policy.isAdmitted(f.demander)) {
            st.ineligible = INELIGIBLE_DEMANDER_NOT_ADMITTED;
        } else if (st.relation == RELATION_DECLARED_RELATED && !q.subsidizeDeclaredRelated) {
            st.ineligible = INELIGIBLE_RELATION;
        } else if (f.asset != address(0)) {
            st.ineligible = INELIGIBLE_ASSET;
        } else if (f.reward < q.minBountyWei) {
            st.ineligible = INELIGIBLE_BOUNTY;
        } else if (_demanderCount[epoch][f.demander] >= q.maxSubsidizedPerDemander) {
            st.ineligible = INELIGIBLE_DEMANDER_CAP;
        } else if (_pairCount[epoch][f.demander][f.worker] >= q.maxSubsidizedPerPair) {
            st.ineligible = INELIGIBLE_PAIR_CAP;
        } else {
            (st.gmuSubsidized, st.ineligible) = _subsidy(epoch, p, f.worker);
            if (st.ineligible == ELIGIBLE) {
                _demanderCount[epoch][f.demander] += 1;
                _pairCount[epoch][f.demander][f.worker] += 1;
            }
        }
    }

    // ------------------------------------------------------------------ recording

    /// @dev The GMU of one accepted unit that still fits under the worker's cap for the profile.
    function _subsidy(uint64 epoch, Profile memory p, address worker) private view returns (uint64 gmu, uint8 reason) {
        uint64 used = _accrued[epoch][p.key][worker];
        if (used >= p.maxGmuPerWorkerPerEpoch) return (0, INELIGIBLE_WORKER_CAP);
        uint64 room = p.maxGmuPerWorkerPerEpoch - used;
        return (p.baseGmu < room ? p.baseGmu : room, ELIGIBLE);
    }

    function _record(Receipt memory r) private returns (uint256 id) {
        _receipts.push(r);
        id = _receipts.length;
        receiptOfContribution[r.contributionId] = id;
        emit ReceiptRecorded(id, r.epoch, r.worker, r);
    }

    function _finish(uint256 id, Receipt memory r, bytes32 profileKey, Status memory st) private {
        _status[id] = st;
        EpochState storage s = _epochs[r.epoch];
        if (st.gmuMeasured != 0) {
            _measured[r.epoch][r.pool][r.worker] += st.gmuMeasured;
            if (r.pool == POOL_G0) s.measuredG0 += st.gmuMeasured;
            else s.measuredG1 += st.gmuMeasured;
        }
        if (st.gmuSubsidized != 0) {
            _subsidized[r.epoch][r.pool][r.worker] += st.gmuSubsidized;
            _accrued[r.epoch][profileKey][r.worker] += st.gmuSubsidized;
            if (r.pool == POOL_G0) s.subsidizedG0 += st.gmuSubsidized;
            else s.subsidizedG1 += st.gmuSubsidized;
        }
        s.receiptCount += 1;
        s.digest = keccak256(abi.encode(s.digest, id, r.contributionId, r.worker, r.pool, st.verdict, st.ineligible,
            st.relation, st.gmuMeasured, st.gmuSubsidized));
        emit ReceiptStatus(id, st);
    }

    // ------------------------------------------------------------------ views

    function receiptCount() external view returns (uint256) {
        return _receipts.length;
    }

    function receipt(uint256 id) external view returns (Receipt memory) {
        if (id == 0 || id > _receipts.length) revert UnknownReceipt(id);
        return _receipts[id - 1];
    }

    function status(uint256 id) external view returns (Status memory) {
        if (id == 0 || id > _receipts.length) revert UnknownReceipt(id);
        return _status[id];
    }

    function seedOf(uint64 epoch) external view returns (bytes32) {
        return _epochs[epoch].seed;
    }

    function measuredOf(uint64 epoch, uint8 pool, address worker) external view returns (uint128) {
        return _measured[epoch][pool][worker];
    }

    function subsidizedOf(uint64 epoch, uint8 pool, address worker) external view returns (uint128) {
        return _subsidized[epoch][pool][worker];
    }

    function epochSummary(uint64 epoch) external view returns (EpochSummary memory out) {
        EpochState storage s = _epochs[epoch];
        (uint32 version, Params memory q) = policy.paramsFor(epoch);
        uint128 budget = policy.budgetFor(epoch);
        out.epoch = epoch;
        out.opened = s.seed != bytes32(0);
        out.ended = _ended(epoch);
        out.isSealed = s.isSealed;
        out.seed = s.seed;
        out.digest = s.digest;
        out.receiptCount = s.receiptCount;
        out.paramsVersion = version;
        out.budget = budget;
        out.budgetG0 = uint128(uint256(budget) * q.splitG0Bps / 10000);
        out.budgetG1 = budget - out.budgetG0;
        out.measuredG0 = s.measuredG0;
        out.measuredG1 = s.measuredG1;
        out.subsidizedG0 = s.subsidizedG0;
        out.subsidizedG1 = s.subsidizedG1;
    }

    /// @notice One value that commits to everything an audit of the epoch recomputes: the receipts
    ///         in order with their verdicts and eligibility, and the four totals.
    function auditSubject(uint64 epoch) external view returns (bytes32) {
        EpochState storage s = _epochs[epoch];
        return keccak256(abi.encode(epoch, s.digest, s.receiptCount, s.measuredG0, s.measuredG1, s.subsidizedG0,
            s.subsidizedG1));
    }

    function allocation(uint64 epoch, address worker) external view returns (uint256) {
        if (!_ended(epoch)) revert EpochNotEnded(epoch);
        return _allocation(epoch, worker);
    }

    function provisionalAllocation(uint64 epoch, address worker) external view returns (uint256) {
        return _allocation(epoch, worker);
    }

    /// @dev Per pool: the worker's share of the pool budget in proportion to subsidized GMU, capped
    ///      at the per-worker share. What the cap withholds is not given to anyone else.
    function _allocation(uint64 epoch, address worker) private view returns (uint256) {
        EpochState storage s = _epochs[epoch];
        (, Params memory q) = policy.paramsFor(epoch);
        uint256 budget = policy.budgetFor(epoch);
        uint256 budgetG0 = budget * q.splitG0Bps / 10000;
        return _share(budgetG0, _subsidized[epoch][POOL_G0][worker], s.subsidizedG0, q.workerCapBps)
            + _share(budget - budgetG0, _subsidized[epoch][POOL_G1][worker], s.subsidizedG1, q.workerCapBps);
    }

    function _share(uint256 poolBudget, uint256 contribution, uint256 total, uint16 capBps)
        private pure returns (uint256 share)
    {
        if (contribution == 0 || total == 0) return 0;
        share = poolBudget * contribution / total;
        uint256 cap = poolBudget * capBps / 10000;
        if (share > cap) share = cap;
    }
}
