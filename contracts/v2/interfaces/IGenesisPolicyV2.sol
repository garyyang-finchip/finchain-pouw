// SPDX-License-Identifier: Apache-2.0
pragma solidity 0.8.24;

import {Profile, ProfileSpec, Params, GuardBinding} from "../TypesV2.sol";

interface IGenesisPolicyV2 {
    event StewardshipTransferStarted(address indexed steward, address indexed pendingSteward);
    event StewardshipTransferred(address indexed previousSteward, address indexed steward);
    event PausedSet(bool paused);
    event ProfileRegistered(bytes32 indexed key, bytes32 indexed id, Profile profile);
    event ProfileRetired(bytes32 indexed key, bytes32 indexed id, uint64 retiredFromEpoch);
    event ParamsRegistered(uint32 indexed version, Params params);
    event OperatorDeclared(address indexed party, uint32 operator, uint64 fromEpoch);
    event AdmissionSet(address indexed party, bool admitted, uint64 fromEpoch);
    event GuardBound(address indexed account, address indexed guard, uint64 version, uint64 fromEpoch, bytes32 codeHash);

    error NotSteward();
    error NotPendingSteward();
    error NotStarted();
    error BadProfile();
    error BadParams();
    error BadActivation();
    error BadGuard(address guard);
    error NoActiveProfile(bytes32 key, uint64 epoch);

    // the epoch clock: fixed at deployment, the same for everyone
    function genesisTime() external view returns (uint64);
    function epochDuration() external view returns (uint64);
    function started() external view returns (bool);
    function currentEpoch() external view returns (uint64);
    function nextEpoch() external view returns (uint64);
    function epochStart(uint64 epoch) external view returns (uint64);
    function epochEnd(uint64 epoch) external view returns (uint64);

    function steward() external view returns (address);
    /// @notice Whether the recording of new receipts and facts is stopped. A pause does not stop
    ///         an account from ending its permits, a delegate from giving one up, or anyone from
    ///         opening or sealing an epoch.
    function paused() external view returns (bool);

    // profiles and parameters: versioned, effective from a future epoch, never edited
    function registerProfile(ProfileSpec calldata spec) external returns (bytes32 id);
    function activeProfile(bytes32 key, uint64 epoch) external view returns (Profile memory);
    function profileVersions(bytes32 key) external view returns (Profile[] memory);
    function paramsFor(uint64 epoch) external view returns (uint32 version, Params memory params);
    function paramsCount() external view returns (uint32);
    function budgetFor(uint64 epoch) external view returns (uint128);

    // parties: both values are those in force for the current epoch
    function operatorOf(address party) external view returns (uint32);
    function isAdmitted(address party) external view returns (bool);

    // guards: the binding in force for the current epoch
    function bindGuard(address account, address guard) external;
    function guardOf(address account) external view returns (address guard, uint64 bindingVersion);
    function guardBindingOf(address account)
        external view returns (GuardBinding memory inForce, bool hasPending, GuardBinding memory pending);
}
