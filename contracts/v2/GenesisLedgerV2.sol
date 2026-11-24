// SPDX-License-Identifier: Apache-2.0
pragma solidity 0.8.24;

import {IGenesisLedgerV2} from "./interfaces/IGenesisLedgerV2.sol";
import {IGenesisPolicyV2} from "./interfaces/IGenesisPolicyV2.sol";
import {IParticipantGuard} from "./interfaces/IParticipantGuard.sol";
import {ISeedSource} from "../interfaces/ISeedSource.sol";
import {IG0Function} from "../interfaces/IG0Function.sol";
import "./TypesV2.sol";

/// @title  Genesis Mining ledger, version 2: work receipts, the GMU of verified work per epoch,
///         the epoch's allocation of test points, and the three things v2 adds - a bounded
///         delegation, the cap on a declared operator's aggregate, and work facts apart from
///         receipts (docs/ledger-v2.md).
/// @notice What this contract establishes is that work was recorded, checked by a deterministic
///         rule and counted under parameters fixed before the epoch. It does not establish how
///         much computation a result took, that two parties are independent, that an epoch's
///         seed was unpredictable, or which program decided to do the work.
///
///         As in 0.1.3: an epoch is an interval of the policy's clock; a receipt is final when it
///         is recorded and counts in the epoch it is recorded in; an epoch's ledger is frozen by
///         time alone; the allocation is a pure function of stored figures. Test points are that
///         function's value and nothing else: no balance is kept, nothing is transferred or
///         claimed. The contract holds no funds and cannot be upgraded.
///
///         A participant is the address of record of a receipt. It can send its own work (the
///         direct entry), or sign a permit that lets one separate key send it (the delegated
///         entry). A permit is never registered: it is presented with every call and checked in
///         that call, so what is established is that the account accepts the signature now. It
///         can make the ledger record a G0 submission or a tender's confirmation in the account's
///         name and nothing else: it cannot make the account call anything, move or approve an
///         asset, or authorize a further key.
contract GenesisLedgerV2 is IGenesisLedgerV2 {
    IGenesisPolicyV2 public immutable policy;
    ISeedSource public immutable seedSource;
    /// @notice Separates this deployment's receipts from any other chain's or deployment's:
    ///         keccak256(abi.encode("finchain-pouw.genesis-ledger.v2", chainId, address(this))).
    bytes32 public immutable domain;
    /// @notice The domain of work-fact ids, apart from that of contribution ids:
    ///         keccak256(abi.encode("finchain-pouw.work-fact.v2", chainId, address(this))).
    bytes32 public immutable factDomain;

    /// @notice Gas given to an account's `isValidSignature` and to a guard's `allows`. Both are
    ///         static calls; running out of this gas is a refusal like any other failure.
    uint256 public constant SIGNATURE_GAS = 200_000;
    uint256 public constant GUARD_GAS = 500_000;

    bytes32 public constant EIP712_DOMAIN_TYPEHASH =
        keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)");
    bytes32 public constant PERMIT_TYPEHASH = keccak256(
        "Permit(address account,address delegate,uint32 scope,uint64 notBeforeEpoch,uint64 notAfterEpoch,uint64 nonce,address guard,uint64 guardBindingVersion)"
    );
    bytes32 public constant REVOKE_TYPEHASH = keccak256("Revoke(address account,bytes32 permitDigest)");
    bytes32 public constant RAISE_NONCE_TYPEHASH = keccak256("RaiseNonce(address account,uint64 minNonce)");
    bytes32 private constant NAME_HASH = keccak256("PoUW Genesis Ledger");
    bytes32 private constant VERSION_HASH = keccak256("2");
    bytes4 private constant ERC1271_MAGIC = 0x1626ba7e;
    // the upper half of the curve order is refused, so that a signature has one accepted form
    uint256 private constant SECP256K1_HALF_N = 0x7FFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF5D576E7357A4501DDFE92F46681B20A0;

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

    // The operator an address is attributed to in an epoch: fixed by the address's first receipt
    // of the epoch and never read from the policy again.
    struct Attribution {
        bool recorded;
        uint32 operator;
    }

    mapping(uint64 => EpochState) private _epochs;
    mapping(uint64 => mapping(uint8 => mapping(address => uint128))) private _measured;
    mapping(uint64 => mapping(uint8 => mapping(address => uint128))) private _subsidized;
    mapping(uint64 => mapping(uint8 => mapping(uint32 => uint128))) private _subsidizedOperator;
    mapping(uint64 => mapping(address => Attribution)) private _attribution;
    // subsidized GMU per profile key, for the profile's per-worker cap
    mapping(uint64 => mapping(bytes32 => mapping(address => uint64))) private _accrued;
    mapping(uint64 => mapping(address => uint32)) private _demanderCount;
    mapping(uint64 => mapping(address => mapping(address => uint32))) private _pairCount;

    Receipt[] private _receipts; // receipt id = index + 1
    mapping(uint256 => Status) private _status;
    mapping(bytes32 => uint256) public receiptOfContribution;
    /// @notice The receipt that took the counting of a content key; zero while the key is free.
    ///         One occupancy for the whole deployment: every profile, specification and epoch.
    mapping(bytes32 => uint256) public contentKeyOwner;

    mapping(bytes32 => Fact) private _facts;
    uint256 public factCount;

    // Ending permits is kept per account: nobody can mark another account's permit.
    mapping(address => mapping(bytes32 => bool)) private _revoked;
    mapping(address => uint64) public minNonce;

    constructor(IGenesisPolicyV2 policy_, ISeedSource seedSource_) {
        policy = policy_;
        seedSource = seedSource_;
        domain = keccak256(abi.encode("finchain-pouw.genesis-ledger.v2", block.chainid, address(this)));
        factDomain = keccak256(abi.encode("finchain-pouw.work-fact.v2", block.chainid, address(this)));
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

    // ------------------------------------------------------------------ permits: the statements

    /// @notice The EIP-712 domain of the three statements: name "PoUW Genesis Ledger", version
    ///         "2", this chain and this contract. Computed from the chain id at the time of use.
    function domainSeparator() public view returns (bytes32) {
        return keccak256(abi.encode(EIP712_DOMAIN_TYPEHASH, NAME_HASH, VERSION_HASH, block.chainid, address(this)));
    }

    function permitDigest(Permit calldata p) public view returns (bytes32) {
        return _typed(keccak256(abi.encode(PERMIT_TYPEHASH, p.account, p.delegate, p.scope, p.notBeforeEpoch,
            p.notAfterEpoch, p.nonce, p.guard, p.guardBindingVersion)));
    }

    function revokeDigest(address account, bytes32 permitDigest_) public view returns (bytes32) {
        return _typed(keccak256(abi.encode(REVOKE_TYPEHASH, account, permitDigest_)));
    }

    function raiseNonceDigest(address account, uint64 minNonce_) public view returns (bytes32) {
        return _typed(keccak256(abi.encode(RAISE_NONCE_TYPEHASH, account, minNonce_)));
    }

    function _typed(bytes32 structHash) private view returns (bytes32) {
        return keccak256(abi.encodePacked("\x19\x01", domainSeparator(), structHash));
    }

    // ------------------------------------------------------------------ permits: the check at each use

    function checkPermit(Permit calldata p, bytes calldata signature, address sender, uint32 operation)
        external view returns (bytes32 digest)
    {
        return _checkPermit(p, signature, sender, operation, policy.currentEpoch());
    }

    /// @dev The order is that of docs/ledger-v2.md, section 4: the caller, the scope, the epochs,
    ///      the nonce and the revocation, the signature, the guard.
    function _checkPermit(Permit calldata p, bytes calldata signature, address sender, uint32 operation, uint64 epoch)
        private view returns (bytes32 digest)
    {
        if (operation != OP_SUBMIT_G0 && operation != OP_CONFIRM_TENDER) revert UnknownOperation(operation);
        if (sender != p.delegate) revert NotDelegate(sender, p.delegate);
        if (p.scope & ~KNOWN_SCOPE != 0) revert UnknownScope(p.scope);
        if (p.scope & operation == 0) revert OutOfScope(p.scope, operation);
        if (epoch < p.notBeforeEpoch) revert PermitNotYetValid(epoch, p.notBeforeEpoch);
        if (epoch > p.notAfterEpoch) revert PermitExpired(epoch, p.notAfterEpoch);
        uint64 minimum = minNonce[p.account];
        if (p.nonce < minimum) revert NonceBelowMinimum(p.nonce, minimum);
        digest = permitDigest(p);
        if (_revoked[p.account][digest]) revert PermitRevoked(p.account, digest);
        if (!_validSignature(p.account, digest, signature)) revert BadSignature(p.account);
        _checkGuard(p, operation);
    }

    /// @dev An account without code signs for itself and has no gate of its own to go around: its
    ///      permit names no guard. Any address with code at the time of use is a contract
    ///      account - an externally owned account that has set a code delegation included - and
    ///      is refused unless a guard is bound, the permit was signed for that binding, and the
    ///      guard allows the operation now.
    function _checkGuard(Permit calldata p, uint32 operation) private view {
        if (p.account.code.length == 0) {
            if (p.guard != address(0) || p.guardBindingVersion != 0) revert GuardMismatch(address(0), 0);
            return;
        }
        (address guard, uint64 version) = policy.guardOf(p.account);
        if (guard == address(0)) revert NoGuardBound(p.account);
        if (p.guard != guard || p.guardBindingVersion != version) revert GuardMismatch(guard, version);
        (bool ok, bytes32 word) = _staticWord(guard, GUARD_GAS, abi.encodeCall(IParticipantGuard.allows, (p.account, operation)));
        if (!ok || word != bytes32(uint256(1))) revert GuardRefused(guard);
    }

    /// @dev Whether `account` accepts `signature` over `digest` now. Without code: the ECDSA signer
    ///      is the account. With code: ERC-1271, by a static call with a fixed gas limit; a revert,
    ///      a short return and any value other than the magic value are a refusal.
    function _validSignature(address account, bytes32 digest, bytes calldata signature) private view returns (bool) {
        if (account.code.length == 0) return account != address(0) && _recover(digest, signature) == account;
        (bool ok, bytes32 word) = _staticWord(account, SIGNATURE_GAS, abi.encodeWithSelector(ERC1271_MAGIC, digest, signature));
        return ok && word == bytes32(ERC1271_MAGIC);
    }

    function _recover(bytes32 digest, bytes calldata signature) private pure returns (address) {
        if (signature.length != 65) return address(0);
        bytes32 r = bytes32(signature[0:32]);
        bytes32 s = bytes32(signature[32:64]);
        uint8 v = uint8(signature[64]);
        if (uint256(s) > SECP256K1_HALF_N || (v != 27 && v != 28)) return address(0);
        return ecrecover(digest, v, r, s);
    }

    /// @dev A static call that reads at most one word of the answer, so that neither the gas the
    ///      callee is given nor the size of what it returns is in the callee's hands.
    function _staticWord(address target, uint256 gasLimit, bytes memory data) private view returns (bool ok, bytes32 word) {
        assembly ("memory-safe") {
            mstore(0x00, 0)
            ok := staticcall(gasLimit, target, add(data, 0x20), mload(data), 0x00, 0x20)
            ok := and(ok, gt(returndatasize(), 0x1f))
            word := mload(0x00)
        }
    }

    // ------------------------------------------------------------------ permits: ending them

    function revokePermit(bytes32 digest) external {
        _revoke(msg.sender, digest, PATH_ACCOUNT);
    }

    function revokePermitBySig(address account, bytes32 digest, bytes calldata signature) external {
        if (!_validSignature(account, revokeDigest(account, digest), signature)) revert BadSignature(account);
        _revoke(account, digest, PATH_STATEMENT);
    }

    function renounce(Permit calldata p) external {
        if (msg.sender != p.delegate) revert NotDelegate(msg.sender, p.delegate);
        _revoke(p.account, permitDigest(p), PATH_DELEGATE);
    }

    function raiseMinNonce(uint64 minNonce_) external {
        _raise(msg.sender, minNonce_, PATH_ACCOUNT);
    }

    function raiseMinNonceBySig(address account, uint64 minNonce_, bytes calldata signature) external {
        if (!_validSignature(account, raiseNonceDigest(account, minNonce_), signature)) revert BadSignature(account);
        _raise(account, minNonce_, PATH_STATEMENT);
    }

    function isRevoked(address account, bytes32 digest) external view returns (bool) {
        return _revoked[account][digest];
    }

    /// @dev A mark is permanent and is written once: doing it again changes nothing.
    function _revoke(address account, bytes32 digest, uint8 path) private {
        if (_revoked[account][digest]) return;
        _revoked[account][digest] = true;
        emit PermitEnded(account, digest, path, msg.sender);
    }

    /// @dev The minimum only rises: a value at or below it changes nothing.
    function _raise(address account, uint64 minNonce_, uint8 path) private {
        if (minNonce_ <= minNonce[account]) return;
        minNonce[account] = minNonce_;
        emit MinNonceRaised(account, minNonce_, path, msg.sender);
    }

    // ------------------------------------------------------------------ G0: protocol work

    function submitG0(bytes32 profileKey, uint64 epoch, uint32 jobIndex, bytes32 outputHash)
        external returns (uint256 id)
    {
        _requireRecording(epoch);
        return _submitG0(G0Call(msg.sender, msg.sender, bytes32(0), profileKey, epoch, jobIndex, outputHash));
    }

    function submitG0For(Permit calldata p, bytes calldata signature, bytes32 profileKey, uint64 epoch,
        uint32 jobIndex, bytes32 outputHash) external returns (uint256 id)
    {
        _requireRecording(epoch);
        bytes32 digest = _checkPermit(p, signature, msg.sender, OP_SUBMIT_G0, epoch);
        return _submitG0(G0Call(p.account, msg.sender, digest, profileKey, epoch, jobIndex, outputHash));
    }

    function _requireRecording(uint64 epoch) private view {
        if (policy.paused()) revert Paused();
        uint64 current = policy.currentEpoch();
        if (epoch != current) revert WrongEpoch(current);
    }

    // One G0 submission, whichever entry it came through.
    struct G0Call {
        address participant;   // whose instance and whose receipt it is
        address sender;        // the caller of the entry function
        bytes32 authorization; // zero, or the permit's digest
        bytes32 profileKey;
        uint64 epoch;
        uint32 jobIndex;
        bytes32 outputHash;
    }

    /// @dev The instance and the contribution are the participant's, whoever sends: the same
    ///      instance submitted directly and through a delegate is one contribution, and the second
    ///      submission reverts.
    function _submitG0(G0Call memory c) private returns (uint256 id) {
        _touch(c.epoch);
        Profile memory p = policy.activeProfile(c.profileKey, c.epoch);
        if (p.pool != POOL_G0) revert WrongPool();
        if (c.jobIndex >= p.jobsPerEpoch) revert JobIndexOutOfRange();

        (Receipt memory r, bytes32 expected) = _receiptG0(c, p);
        uint32 operator = policy.operatorOf(c.participant);
        id = _record(r, operator);

        // one reason, the first that applies: rejected, not admitted, operator not declared, worker cap
        Status memory st;
        st.verifier = p.module;
        if (c.outputHash != expected) {
            st.verdict = VERDICT_REJECTED;
            st.ineligible = INELIGIBLE_REJECTED;
        } else {
            st.verdict = VERDICT_ACCEPTED;
            st.gmuMeasured = p.baseGmu;
            if (!policy.isAdmitted(c.participant)) st.ineligible = INELIGIBLE_NOT_ADMITTED;
            else if (operator == 0) st.ineligible = INELIGIBLE_OPERATOR_NOT_DECLARED;
            else (st.gmuSubsidized, st.ineligible) = _subsidy(c.epoch, p, c.participant);
        }
        _finish(id, r, p.key, st, operator);
    }

    function _receiptG0(G0Call memory c, Profile memory p) private view returns (Receipt memory r, bytes32 expected) {
        bytes32 functionId = IG0Function(p.module).functionId();
        // the participant's own instance: different for every participant and every epoch
        r.workId = keccak256(abi.encode(_epochs[c.epoch].seed, functionId, c.jobIndex, c.participant));
        r.contributionId = keccak256(abi.encode(domain, POOL_G0, functionId, c.epoch, c.jobIndex, c.participant));
        uint256 existing = receiptOfContribution[r.contributionId];
        if (existing != 0) revert AlreadySubmitted(existing);
        (r.inputHash, expected) = IG0Function(p.module).evaluate(c.epoch, c.jobIndex, c.participant, r.workId);
        r.epoch = c.epoch;
        r.pool = POOL_G0;
        r.profileId = p.id;
        r.worker = c.participant;
        r.sender = c.sender;
        r.authorization = c.authorization;
        r.role = p.role;
        r.outputHash = c.outputHash;
        r.recordedAt = uint64(block.timestamp);
    }

    // ------------------------------------------------------------------ work facts

    function factId(address source, uint256 tokenId, uint256 submissionId) public view returns (bytes32) {
        return keccak256(abi.encode(factDomain, source, tokenId, submissionId));
    }

    function recordFact(bytes32 profileKey, FactData calldata data) external returns (bytes32 id) {
        Profile memory p = _moduleProfile(profileKey, policy.currentEpoch());
        id = factId(data.source, data.tokenId, data.submissionId);
        Fact storage f = _facts[id];
        if (f.recordedAt != 0) return id;
        f.data = data;
        f.profileId = p.id;
        f.recordedAt = uint64(block.timestamp);
        factCount += 1;
        emit FactRecorded(id, data.source, data.tokenId, data.submissionId, f);
    }

    function factRecorded(bytes32 factId_) external view returns (bool) {
        return _facts[factId_].recordedAt != 0;
    }

    function factOf(bytes32 factId_) external view returns (Fact memory) {
        if (_facts[factId_].recordedAt == 0) revert UnknownFact(factId_);
        return _facts[factId_];
    }

    /// @dev The G1 profile in force under `profileKey`, when the caller is its module and
    ///      recording is not paused.
    function _moduleProfile(bytes32 profileKey, uint64 epoch) private view returns (Profile memory p) {
        if (policy.paused()) revert Paused();
        p = policy.activeProfile(profileKey, epoch);
        if (p.pool != POOL_G1) revert WrongPool();
        if (msg.sender != p.module) revert NotModule();
    }

    // ------------------------------------------------------------------ G1: real demand

    function recordG1(bytes32 profileKey, G1Facts calldata f, G1Extra calldata x, Entry calldata e)
        external returns (uint256 id, uint8 ineligible)
    {
        uint64 epoch = policy.currentEpoch();
        Profile memory p = _moduleProfile(profileKey, epoch);

        // the contribution is the settled submission itself, whatever profile or module reports it
        bytes32 contributionId = keccak256(abi.encode(domain, POOL_G1, f.source, f.tokenId, f.submissionId));
        id = receiptOfContribution[contributionId];
        if (id != 0) return (id, _status[id].ineligible);

        // a version that counts task units is told what the delivery is, and a whole unit has a
        // key; a version that does not can neither state a unit nor name a key
        if (p.countsUnits) {
            if (x.unit == UNIT_NONE || x.unit > UNIT_WRONG_ISSUER) revert BadExtra();
            if (x.unit == UNIT_WHOLE && x.contentKey == bytes32(0)) revert BadExtra();
        } else if (x.unit != UNIT_NONE || x.contentKey != bytes32(0)) {
            revert BadExtra();
        }

        _touch(epoch);
        Receipt memory r = _receiptG1(epoch, p, contributionId, f, x, e);
        uint32 operator = policy.operatorOf(f.worker);
        id = _record(r, operator);
        Status memory st = _judgeG1(id, epoch, p, f, x, operator);
        _finish(id, r, p.key, st, operator);
        ineligible = st.ineligible;
    }

    function _receiptG1(uint64 epoch, Profile memory p, bytes32 contributionId, G1Facts calldata f, G1Extra calldata x,
        Entry calldata e) private view returns (Receipt memory r)
    {
        r.epoch = epoch;
        r.pool = POOL_G1;
        r.profileId = p.id;
        r.worker = f.worker;
        r.counterparty = f.demander;
        r.sender = e.sender;
        r.authorization = e.authorization;
        r.role = p.role;
        r.unit = x.unit;
        r.workId = keccak256(abi.encode(block.chainid, f.source, f.tokenId, f.submissionId));
        r.parent = x.parent;
        r.envelopeHash = x.envelopeHash;
        r.contentKey = x.contentKey;
        r.inputHash = f.inputHash;
        r.outputHash = f.outputHash;
        r.contributionId = contributionId;
        r.recordedAt = uint64(block.timestamp);
    }

    /// @dev The settlement is the verdict; whether the receipt is measured and whether it draws
    ///      the subsidy are answered by the rules in one fixed order (docs/ledger-v2.md, section
    ///      7): not a task unit, duplicate contribution, then self-dealing, before genesis, worker
    ///      not admitted, demander not admitted, worker's operator not declared, demander's
    ///      operator not declared, relation, asset, bounty, demander cap, pair cap, worker cap.
    function _judgeG1(uint256 id, uint64 epoch, Profile memory p, G1Facts calldata f, G1Extra calldata x, uint32 operator)
        private returns (Status memory st)
    {
        st.verdict = VERDICT_ACCEPTED;
        st.verifier = msg.sender;

        uint32 demanderOperator = policy.operatorOf(f.demander);
        if (operator != 0 && (operator == demanderOperator || operator == policy.operatorOf(f.judge))) {
            st.relation = RELATION_DECLARED_RELATED;
        }

        if (p.countsUnits) {
            if (x.unit != UNIT_WHOLE) {
                st.ineligible = INELIGIBLE_NOT_A_TASK_UNIT; // measures nothing and takes no key
                return st;
            }
            uint256 taker = contentKeyOwner[x.contentKey];
            if (taker != 0) {
                st.ineligible = INELIGIBLE_DUPLICATE_CONTRIBUTION; // measures nothing; names the receipt that counted
                st.duplicateOf = taker;
                return st;
            }
            // taking the counting is measurement: it is taken whether or not the subsidy follows
            contentKeyOwner[x.contentKey] = id;
            emit ContentKeyTaken(x.contentKey, id);
        }
        st.gmuMeasured = p.baseGmu;

        (, Params memory q) = policy.paramsFor(epoch);
        if (f.worker == f.demander || f.worker == f.judge) {
            st.ineligible = INELIGIBLE_SELF_DEALING;
        } else if (f.deliveredAt < policy.genesisTime()) {
            st.ineligible = INELIGIBLE_BEFORE_GENESIS;
        } else if (!policy.isAdmitted(f.worker)) {
            st.ineligible = INELIGIBLE_NOT_ADMITTED;
        } else if (!policy.isAdmitted(f.demander)) {
            st.ineligible = INELIGIBLE_DEMANDER_NOT_ADMITTED;
        } else if (operator == 0) {
            st.ineligible = INELIGIBLE_OPERATOR_NOT_DECLARED;
        } else if (demanderOperator == 0) {
            st.ineligible = INELIGIBLE_DEMANDER_OPERATOR_NOT_DECLARED;
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

    /// @dev Stores the receipt and, with the worker's first receipt of the epoch, the operator the
    ///      worker is attributed to in that epoch. Declarations apply from the next epoch only, so
    ///      every later receipt of the epoch would read the same operator.
    function _record(Receipt memory r, uint32 operator) private returns (uint256 id) {
        _receipts.push(r);
        id = _receipts.length;
        receiptOfContribution[r.contributionId] = id;
        Attribution storage a = _attribution[r.epoch][r.worker];
        if (!a.recorded) {
            a.recorded = true;
            a.operator = operator;
        }
        emit ReceiptRecorded(id, r.epoch, r.worker, tx.origin, operator, r);
    }

    function _finish(uint256 id, Receipt memory r, bytes32 profileKey, Status memory st, uint32 operator) private {
        _status[id] = st;
        EpochState storage s = _epochs[r.epoch];
        if (st.gmuMeasured != 0) {
            _measured[r.epoch][r.pool][r.worker] += st.gmuMeasured;
            if (r.pool == POOL_G0) s.measuredG0 += st.gmuMeasured;
            else s.measuredG1 += st.gmuMeasured;
        }
        if (st.gmuSubsidized != 0) {
            _subsidized[r.epoch][r.pool][r.worker] += st.gmuSubsidized;
            _subsidizedOperator[r.epoch][r.pool][operator] += st.gmuSubsidized;
            _accrued[r.epoch][profileKey][r.worker] += st.gmuSubsidized;
            if (r.pool == POOL_G0) s.subsidizedG0 += st.gmuSubsidized;
            else s.subsidizedG1 += st.gmuSubsidized;
        }
        s.receiptCount += 1;
        s.digest = _digestStep(s.digest, id, r, st, operator);
        emit ReceiptStatus(id, st);
    }

    /// @dev The rolling digest of an epoch commits to each receipt's identity, its status, the
    ///      receipt that counted in its place and the operator its worker was attributed to.
    function _digestStep(bytes32 digest, uint256 id, Receipt memory r, Status memory st, uint32 operator)
        private pure returns (bytes32)
    {
        return keccak256(abi.encode(digest, id, r.contributionId, r.worker, r.pool, st.verdict, st.ineligible,
            st.relation, st.gmuMeasured, st.gmuSubsidized, st.duplicateOf, operator));
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

    function subsidizedOfOperator(uint64 epoch, uint8 pool, uint32 operator) external view returns (uint128) {
        return _subsidizedOperator[epoch][pool][operator];
    }

    function operatorAt(uint64 epoch, address party) external view returns (bool recorded, uint32 operator) {
        Attribution storage a = _attribution[epoch][party];
        return (a.recorded, a.operator);
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
    ///         in order with their verdicts, eligibility and attribution, and the four totals.
    function auditSubject(uint64 epoch) external view returns (bytes32) {
        EpochState storage s = _epochs[epoch];
        return keccak256(abi.encode(epoch, s.digest, s.receiptCount, s.measuredG0, s.measuredG1, s.subsidizedG0,
            s.subsidizedG1));
    }

    function operatorShare(uint64 epoch, uint8 pool, uint32 operator) external view returns (uint256) {
        (uint256 poolBudget, uint256 total, Params memory q) = _pool(epoch, pool);
        return _operatorShare(poolBudget, _subsidizedOperator[epoch][pool][operator], total, q.operatorCapBps);
    }

    function allocation(uint64 epoch, address worker) external view returns (uint256) {
        if (!_ended(epoch)) revert EpochNotEnded(epoch);
        return _allocation(epoch, worker);
    }

    function provisionalAllocation(uint64 epoch, address worker) external view returns (uint256) {
        return _allocation(epoch, worker);
    }

    /// @dev The budget of a pool, the pool's subsidized GMU and the parameters of the epoch.
    function _pool(uint64 epoch, uint8 pool) private view returns (uint256 poolBudget, uint256 total, Params memory q) {
        EpochState storage s = _epochs[epoch];
        (, q) = policy.paramsFor(epoch);
        uint256 budget = policy.budgetFor(epoch);
        uint256 budgetG0 = budget * q.splitG0Bps / 10000;
        if (pool == POOL_G0) return (budgetG0, s.subsidizedG0, q);
        if (pool == POOL_G1) return (budget - budgetG0, s.subsidizedG1, q);
        revert WrongPool();
    }

    /// @dev Per pool, with pool budget B, the worker's subsidized GMU g(i), its operator's g(o) and
    ///      the pool's G:
    ///        S(o) = min(floor(B * g(o) / G), floor(B * operatorCapBps / 10000))
    ///        A(i) = min(floor(S(o) * g(i) / g(o)), floor(B * workerCapBps / 10000))
    ///      and zero when G, g(o) or g(i) is zero. The operator is the one stored for the worker
    ///      in that epoch, never the policy's present declaration. What a cap withholds and what
    ///      rounding leaves are allocated to nobody.
    function _allocation(uint64 epoch, address worker) private view returns (uint256 total) {
        Attribution storage a = _attribution[epoch][worker];
        if (!a.recorded) return 0;
        for (uint8 pool = POOL_G0; pool <= POOL_G1; ++pool) {
            uint256 mine = _subsidized[epoch][pool][worker];
            if (mine == 0) continue;
            (uint256 poolBudget, uint256 poolTotal, Params memory q) = _pool(epoch, pool);
            uint256 ofOperator = _subsidizedOperator[epoch][pool][a.operator];
            uint256 share = _operatorShare(poolBudget, ofOperator, poolTotal, q.operatorCapBps);
            if (share == 0 || ofOperator == 0) continue;
            share = share * mine / ofOperator;
            uint256 cap = poolBudget * q.workerCapBps / 10000;
            total += share > cap ? cap : share;
        }
    }

    function _operatorShare(uint256 poolBudget, uint256 ofOperator, uint256 total, uint16 capBps)
        private pure returns (uint256 share)
    {
        if (ofOperator == 0 || total == 0) return 0;
        share = poolBudget * ofOperator / total;
        uint256 cap = poolBudget * capBps / 10000;
        if (share > cap) share = cap;
    }
}
