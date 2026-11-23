// SPDX-License-Identifier: Apache-2.0
pragma solidity 0.8.24;

import {IGenesisPolicy} from "./interfaces/IGenesisPolicy.sol";
import {Profile, Params, POOL_G0, POOL_G1} from "./GenesisTypes.sol";

/// @title  Genesis Mining policy: the epoch clock, the versioned work profiles and reward
///         parameters, and the parties' declarations (operator, admission to the early subsidy).
/// @notice Everything here is decided before the epoch it applies to: a profile or parameter
///         version, an operator declaration and an admission take effect from a later epoch. A
///         version that is still ahead can be replaced; once its epoch has begun it is never
///         edited. The steward registers versions and declarations and can pause recording; it
///         cannot touch a receipt, a verdict or an allocation, none of which live here. With the
///         steward gone, the versions in force keep running.
contract GenesisPolicy is IGenesisPolicy {
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

    mapping(address => Party) private _parties;

    modifier onlySteward() {
        if (msg.sender != steward) revert NotSteward();
        _;
    }

    /// @param genesisTime_ start of epoch 0; not in the past, so that the first profiles and
    ///        admissions can be registered for epoch 0
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

    /// @notice Stop or resume the recording of new receipts. Nothing else is affected.
    function setPaused(bool paused_) external onlySteward {
        paused = paused_;
        emit PausedSet(paused_);
    }

    // ------------------------------------------------------------------ profiles

    /// @notice Register the next version of a work profile, in force from `activeFromEpoch`
    ///         (a future epoch, after the previous version's) until a later version replaces it.
    ///         Registering again for the epoch of a version that is still ahead replaces that
    ///         version: a mistake can be corrected until the epoch begins, not after.
    function registerProfile(
        string calldata name,
        uint8 pool,
        address module,
        uint64 baseGmu,
        uint64 maxGmuPerWorkerPerEpoch,
        uint32 jobsPerEpoch,
        uint64 activeFromEpoch
    ) external onlySteward returns (bytes32 id) {
        if (bytes(name).length == 0 || pool > POOL_G1 || module == address(0)) revert BadProfile();
        if (baseGmu == 0 || maxGmuPerWorkerPerEpoch < baseGmu) revert BadProfile();
        if ((pool == POOL_G0) != (jobsPerEpoch != 0)) revert BadProfile();
        if (activeFromEpoch < nextEpoch()) revert BadActivation();

        bytes32 key = keccak256(bytes(name));
        Profile[] storage versions = _profiles[key];
        uint256 n = versions.length;
        if (n != 0) {
            uint64 lastFrom = versions[n - 1].activeFromEpoch;
            if (activeFromEpoch < lastFrom) revert BadActivation();
            if (activeFromEpoch == lastFrom) {
                versions.pop(); // still ahead (its epoch is not before the next one): replaced
                n -= 1;
            }
        }
        // a name's pool is fixed by the first version that stands
        if (n != 0 && versions[n - 1].pool != pool) revert BadActivation();
        uint32 version = uint32(n + 1);
        id = keccak256(abi.encode(key, version));
        versions.push(Profile({
            key: key,
            id: id,
            pool: pool,
            version: version,
            module: module,
            baseGmu: baseGmu,
            maxGmuPerWorkerPerEpoch: maxGmuPerWorkerPerEpoch,
            jobsPerEpoch: jobsPerEpoch,
            activeFromEpoch: activeFromEpoch,
            retiredFromEpoch: type(uint64).max,
            name: name
        }));
        emit ProfileRegistered(key, id, versions[n]);
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

    function _checkParams(Params memory p) private pure {
        if (p.splitG0Bps > 10000 || p.workerCapBps == 0 || p.workerCapBps > 10000) revert BadParams();
    }

    // ------------------------------------------------------------------ parties

    /// @notice Declare which operator controls an address (0 = undeclared), from the next epoch.
    ///         A declaration is a statement by the steward, used to label related parties; an
    ///         undeclared relation is not thereby excluded.
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

    /// @dev Whether a scheduled change applies to the current epoch.
    function _inForce(bool scheduled, uint64 from) private view returns (bool) {
        return scheduled && block.timestamp >= genesisTime && currentEpoch() >= from;
    }
}
