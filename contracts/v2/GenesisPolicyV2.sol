// SPDX-License-Identifier: Apache-2.0
pragma solidity 0.8.39;

import {IGenesisPolicyV2} from "./interfaces/IGenesisPolicyV2.sol";
import {Profile, ProfileSpec, Params, GuardBinding, POOL_G0, POOL_G1, ROLE_PUBLIC_SERVICE} from "./TypesV2.sol";

/// @title  Genesis Mining policy of ledger v2: the epoch clock, the versioned work profiles and
///         reward parameters, the parties' declarations (operator, admission to the early
///         subsidy) and the guard bound to a contract account.
/// @notice Everything here is decided before the epoch it applies to: a profile or parameter
///         version, an operator declaration, an admission and a guard binding take effect from a
///         later epoch. A version that is still ahead can be replaced; once its epoch has begun
///         it is never edited. The steward registers versions, declarations and bindings and can
///         pause recording; it cannot touch a receipt, a verdict, a permit or an allocation, none
///         of which live here. With the steward gone, the versions in force keep running.
///
///         What v2 adds to the policy of 0.1.3: the operator cap of a parameter version, the
///         contribution class and the task-unit rule of a profile version, and the guard binding
///         of an account with a version that only rises (docs/ledger-v2.md).
contract GenesisPolicyV2 is IGenesisPolicyV2 {
    uint64 public immutable genesisTime;   // start of epoch 0
    uint64 public immutable epochDuration; // seconds; fixed for the life of the deployment

    address public steward;
    address public pendingSteward;
    bool public paused;

    mapping(bytes32 => Profile[]) private _profiles; // versions per profile key, in order of activation
    Params[] private _params;                         // versions in order of activation; index + 1 = version

    // A value in force and at most one change scheduled for a later epoch.
    struct Party {
        uint32 operator;
        uint32 nextOperator;
        uint64 nextOperatorFrom;
        bool hasNextOperator;
        bool admitted;
        bool nextAdmitted;
        bool hasNextAdmitted;
        uint64 nextAdmittedFrom;
    }

    // The guard binding in force, at most one scheduled for a later epoch, and the counter that
    // numbers every binding of the account: a number is used once, also by a binding that was
    // replaced before its epoch began.
    struct GuardSlot {
        GuardBinding inForce;
        GuardBinding next;
        bool hasNext;
        uint64 lastVersion;
    }

    mapping(address => Party) private _parties;
    mapping(address => GuardSlot) private _guards;

    modifier onlySteward() {
        if (msg.sender != steward) revert NotSteward();
        _;
    }

    /// @param genesisTime_ start of epoch 0; not in the past, so that the first profiles,
    ///        admissions and bindings can be registered for epoch 0
    constructor(address steward_, uint64 genesisTime_, uint64 epochDuration_, Params memory initialParams) {
        if (steward_ == address(0) || epochDuration_ == 0 || genesisTime_ < block.timestamp) revert BadParams();
        steward = steward_;
        genesisTime = genesisTime_;
        epochDuration = epochDuration_;
        initialParams.activeFromEpoch = 0;
        _checkParams(initialParams);
        _params.push(initialParams);
        emit StewardshipTransferred(address(0), steward_);
        emit ParamsRegistered(1, initialParams);
    }

    // ------------------------------------------------------------------ clock

    function started() public view returns (bool) {
        return block.timestamp >= genesisTime;
    }

    function currentEpoch() public view returns (uint64) {
        if (block.timestamp < genesisTime) revert NotStarted();
        return uint64((block.timestamp - genesisTime) / epochDuration);
    }

    /// @notice The first epoch a change made now can apply to.
    function nextEpoch() public view returns (uint64) {
        return block.timestamp < genesisTime ? 0 : currentEpoch() + 1;
    }

    function epochStart(uint64 epoch) public view returns (uint64) {
        return genesisTime + epoch * epochDuration;
    }

    function epochEnd(uint64 epoch) public view returns (uint64) {
        return genesisTime + (epoch + 1) * epochDuration;
    }

    // ------------------------------------------------------------------ stewardship

    function transferStewardship(address newSteward) external onlySteward {
        pendingSteward = newSteward;
        emit StewardshipTransferStarted(steward, newSteward);
    }

    function acceptStewardship() external {
        if (msg.sender != pendingSteward) revert NotPendingSteward();
        emit StewardshipTransferred(steward, msg.sender);
        steward = msg.sender;
        pendingSteward = address(0);
    }

    /// @notice Stop or resume the recording of new receipts and facts. Nothing else is affected:
    ///         permits can still be ended and epochs opened and sealed.
    function setPaused(bool paused_) external onlySteward {
        paused = paused_;
        emit PausedSet(paused_);
    }

    // ------------------------------------------------------------------ profiles

    /// @notice Register the next version of a work profile, in force from `spec.activeFromEpoch`
    ///         (a future epoch, after the previous version's) until a later version replaces it.
    ///         Registering again for the epoch of a version that is still ahead replaces that
    ///         version: a mistake can be corrected until the epoch begins, not after.
    function registerProfile(ProfileSpec calldata spec) external onlySteward returns (bytes32 id) {
        if (bytes(spec.name).length == 0 || spec.pool > POOL_G1 || spec.module == address(0)) revert BadProfile();
        if (spec.baseGmu == 0 || spec.maxGmuPerWorkerPerEpoch < spec.baseGmu) revert BadProfile();
        if ((spec.pool == POOL_G0) != (spec.jobsPerEpoch != 0)) revert BadProfile();
        if (spec.role > ROLE_PUBLIC_SERVICE) revert BadProfile();
        // only a G1 version can count task units, and a version that counts them commits to what
        // they are and to who issues them; a version that does not carries neither commitment
        if (spec.countsUnits) {
            if (spec.pool != POOL_G1 || spec.unitSetRoot == bytes32(0) || spec.issuerSetRoot == bytes32(0)) revert BadProfile();
        } else if (spec.unitSetRoot != bytes32(0) || spec.issuerSetRoot != bytes32(0)) {
            revert BadProfile();
        }
        if (spec.activeFromEpoch < nextEpoch()) revert BadActivation();

        bytes32 key = keccak256(bytes(spec.name));
        Profile[] storage versions = _profiles[key];
        uint256 n = versions.length;
        if (n != 0) {
            uint64 lastFrom = versions[n - 1].activeFromEpoch;
            if (spec.activeFromEpoch < lastFrom) revert BadActivation();
            if (spec.activeFromEpoch == lastFrom) {
                versions.pop(); // still ahead (its epoch is not before the next one): replaced
                n -= 1;
            }
        }
        // a name's pool is fixed by the first version that stands
        if (n != 0 && versions[n - 1].pool != spec.pool) revert BadActivation();
        uint32 version = uint32(n + 1);
        id = keccak256(abi.encode(key, version));
        Profile storage p = versions.push();
        p.key = key;
        p.id = id;
        p.pool = spec.pool;
        p.version = version;
        p.module = spec.module;
        p.baseGmu = spec.baseGmu;
        p.maxGmuPerWorkerPerEpoch = spec.maxGmuPerWorkerPerEpoch;
        p.jobsPerEpoch = spec.jobsPerEpoch;
        p.activeFromEpoch = spec.activeFromEpoch;
        p.retiredFromEpoch = type(uint64).max;
        p.role = spec.role;
        p.countsUnits = spec.countsUnits;
        p.unitSetRoot = spec.unitSetRoot;
        p.issuerSetRoot = spec.issuerSetRoot;
        p.name = spec.name;
        emit ProfileRegistered(key, id, p);
    }

    /// @notice Stop the latest version of a profile from `fromEpoch` (a future epoch). Receipts
    ///         already recorded under it are untouched. A retirement in force is final: work of
    ///         that kind resumes only with a new version.
    function retireProfile(bytes32 key, uint64 fromEpoch) external onlySteward {
        Profile[] storage versions = _profiles[key];
        uint256 n = versions.length;
        uint64 next = nextEpoch();
        if (n == 0) revert BadProfile();
        Profile storage last = versions[n - 1];
        if (fromEpoch < next || fromEpoch < last.activeFromEpoch || last.retiredFromEpoch < next) revert BadActivation();
        last.retiredFromEpoch = fromEpoch;
        emit ProfileRetired(key, last.id, fromEpoch);
    }

    function activeProfile(bytes32 key, uint64 epoch) public view returns (Profile memory) {
        Profile[] storage versions = _profiles[key];
        for (uint256 i = versions.length; i != 0; --i) {
            Profile storage p = versions[i - 1];
            if (p.activeFromEpoch <= epoch) {
                if (epoch >= p.retiredFromEpoch) break;
                return p;
            }
        }
        revert NoActiveProfile(key, epoch);
    }

    function profileVersions(bytes32 key) external view returns (Profile[] memory) {
        return _profiles[key];
    }

    // ------------------------------------------------------------------ parameters

    /// @notice Register the next parameter version, in force from `p.activeFromEpoch` (a future
    ///         epoch, after the previous version's). Registering again for the epoch of a version
    ///         that is still ahead replaces that version.
    function registerParams(Params calldata p) external onlySteward returns (uint32 version) {
        uint64 lastFrom = _params[_params.length - 1].activeFromEpoch;
        if (p.activeFromEpoch < nextEpoch() || p.activeFromEpoch < lastFrom) revert BadActivation();
        _checkParams(p);
        if (p.activeFromEpoch == lastFrom) _params[_params.length - 1] = p; // still ahead: replaced
        else _params.push(p);
        version = uint32(_params.length);
        emit ParamsRegistered(version, p);
    }

    function paramsFor(uint64 epoch) public view returns (uint32 version, Params memory params) {
        for (uint256 i = _params.length; i != 0; --i) {
            if (_params[i - 1].activeFromEpoch <= epoch) return (uint32(i), _params[i - 1]);
        }
        revert BadParams(); // unreachable: version 1 applies from epoch 0
    }

    function paramsCount() external view returns (uint32) {
        return uint32(_params.length);
    }

    /// @notice Test points of an epoch: the version's base, halved every `halvingInterval` epochs
    ///         counted from the version's first epoch.
    function budgetFor(uint64 epoch) public view returns (uint128) {
        (, Params memory p) = paramsFor(epoch);
        if (p.halvingInterval == 0) return p.budgetBase;
        uint256 halvings = (epoch - p.activeFromEpoch) / p.halvingInterval;
        return halvings >= 128 ? 0 : uint128(p.budgetBase >> halvings);
    }

    /// @dev Both caps are shares of a pool above zero. Their relation is a deployment's choice and
    ///      is not enforced: with the operator cap above the address cap an operator is allocated
    ///      more by holding more addresses, within the operator cap (docs/ledger-v2.md, section 8).
    function _checkParams(Params memory p) private pure {
        if (p.splitG0Bps > 10000 || p.workerCapBps == 0 || p.workerCapBps > 10000) revert BadParams();
        if (p.operatorCapBps == 0 || p.operatorCapBps > 10000) revert BadParams();
    }

    // ------------------------------------------------------------------ parties

    /// @notice Declare which operator controls an address (0 = undeclared), from the next epoch.
    ///         A declaration is a statement by the steward, used to label related parties and to
    ///         add up what the addresses of one operator are allocated; an undeclared relation is
    ///         not thereby excluded. An address has one operator throughout an epoch.
    function declareOperator(address party, uint32 operator) external onlySteward {
        Party storage q = _parties[party];
        if (_inForce(q.hasNextOperator, q.nextOperatorFrom)) q.operator = q.nextOperator;
        uint64 from = nextEpoch();
        q.nextOperator = operator;
        q.nextOperatorFrom = from;
        q.hasNextOperator = true;
        emit OperatorDeclared(party, operator, from);
    }

    /// @notice Admit an address to the early subsidy, or withdraw the admission, from the next
    ///         epoch. An admitted address is subsidized as a worker, and the tenders it owns can
    ///         be subsidized. Work by or for an address that is not admitted is recorded and
    ///         measured; it earns no test points.
    function setAdmission(address party, bool admitted) external onlySteward {
        Party storage q = _parties[party];
        if (_inForce(q.hasNextAdmitted, q.nextAdmittedFrom)) q.admitted = q.nextAdmitted;
        uint64 from = nextEpoch();
        q.nextAdmitted = admitted;
        q.nextAdmittedFrom = from;
        q.hasNextAdmitted = true;
        emit AdmissionSet(party, admitted, from);
    }

    function operatorOf(address party) external view returns (uint32) {
        Party storage q = _parties[party];
        return _inForce(q.hasNextOperator, q.nextOperatorFrom) ? q.nextOperator : q.operator;
    }

    function isAdmitted(address party) external view returns (bool) {
        Party storage q = _parties[party];
        return _inForce(q.hasNextAdmitted, q.nextAdmittedFrom) ? q.nextAdmitted : q.admitted;
    }

    // ------------------------------------------------------------------ guards

    /// @notice Bind a guard to a contract account, from the next epoch; the zero address unbinds.
    ///         Every call numbers its binding with the account's next version, whatever the guard:
    ///         a version is never reused, not by binding the same guard again and not when a
    ///         binding is replaced before its epoch has begun. A permit names the guard and the
    ///         version it was signed for, so a change of binding always asks for a new permit.
    ///         The binding in force stays in force until the scheduled one's epoch begins.
    function bindGuard(address account, address guard) external onlySteward {
        if (guard != address(0) && guard.code.length == 0) revert BadGuard(guard);
        GuardSlot storage s = _guards[account];
        if (s.hasNext && _reached(s.next.fromEpoch)) s.inForce = s.next;
        uint64 from = nextEpoch();
        s.lastVersion += 1;
        s.next = GuardBinding({
            guard: guard,
            version: s.lastVersion,
            fromEpoch: from,
            codeHash: guard == address(0) ? bytes32(0) : guard.codehash
        });
        s.hasNext = true;
        emit GuardBound(account, guard, s.lastVersion, from, s.next.codeHash);
    }

    /// @notice The guard binding in force for the current epoch: zero and zero when none was ever
    ///         bound, and the zero guard with a version above zero after an unbinding.
    function guardOf(address account) external view returns (address guard, uint64 bindingVersion) {
        GuardSlot storage s = _guards[account];
        GuardBinding storage b = s.hasNext && _reached(s.next.fromEpoch) ? s.next : s.inForce;
        return (b.guard, b.version);
    }

    /// @notice The binding in force and, when one is scheduled for an epoch that has not begun,
    ///         that one beside it.
    function guardBindingOf(address account)
        external view returns (GuardBinding memory inForce, bool hasPending, GuardBinding memory pending)
    {
        GuardSlot storage s = _guards[account];
        if (s.hasNext && _reached(s.next.fromEpoch)) return (s.next, false, pending);
        return (s.inForce, s.hasNext, s.next);
    }

    /// @dev Whether a scheduled change applies to the current epoch.
    function _inForce(bool scheduled, uint64 from) private view returns (bool) {
        return scheduled && _reached(from);
    }

    function _reached(uint64 from) private view returns (bool) {
        return block.timestamp >= genesisTime && currentEpoch() >= from;
    }
}
