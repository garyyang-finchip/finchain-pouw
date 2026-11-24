// SPDX-License-Identifier: Apache-2.0
pragma solidity 0.8.24;

import {IParticipantGuard} from "../interfaces/IParticipantGuard.sol";
import {OP_SUBMIT_G0, OP_CONFIRM_TENDER} from "../TypesV2.sol";

/// @notice The public views of a FOGA Cell Account (account revision 3) that the guard reads. Only
///         the shape of the answers matters here: the requirement set and the registry verdict
///         are decoded as far as the count of clauses and the verdict, and no further.
interface IFogaCellViews {
    struct Intervener {
        address account;
        uint8 rights;
    }

    struct Clause {
        address specRegistry;
        bytes32 specId;
        uint32[] versions;
        address adopter;
        bytes32 subjectKey;
        bytes32 scopeKey;
        uint16 enforcement;
        Intervener[] interveners;
    }

    struct RequirementSet {
        uint8 combinator;
        uint16 k;
        Clause[] clauses;
    }

    function ACCOUNT_VERSION() external view returns (uint8);
    function requirement() external view returns (RequirementSet memory);
    function presentedBindings() external view returns (bytes32[] memory);
    /// @return verdict 0 unknown, 1 satisfied, 2 not satisfied
    function status() external view returns (uint8 verdict, uint8[] memory reasons, uint8[] memory restrictions);
    /// @return the AID registry the account names, or zero
    function aid() external view returns (address);
}

interface IAidStateView {
    /// @return 0 dormant, 1 active, 2 stale, 3 retired
    function state(address anchor) external view returns (uint8);
}

/// @title  Guard for FOGA Cell Accounts on the delegated entry of the Genesis ledger.
/// @notice An optional module, outside the kernel. A cell's owner signature is valid at all times,
///         also while the cell's safety binding is suspended and its own `execute` is refused; a
///         delegated entry that asked for the signature only would go around the cell's gate.
///         This guard is what the ledger asks instead. It reads the account's own public views
///         and allows an operation only when all of the following hold now:
///
///           - the account is of the revision this guard was written against;
///           - the account has presented as many bindings as its requirement has clauses;
///           - the registry's verdict on those bindings is "satisfied";
///           - where the account names an AID registry, its anchor is ACTIVE there.
///
///         The rule is the same for both operations. It is the stricter rule of the delegated
///         PoUW entry and not a restatement of the account's gate: the account asks for the
///         anchor only on calls its owner marked as commitment-class, and it lets some calls
///         through under a suspension; this guard does neither. A view that fails makes the call
///         fail, which the ledger takes as a refusal.
///
///         The guard holds no state, names no account and no registry, and changes nothing of
///         FOGA: it is bound to an account by the policy's steward.
contract FogaCellGuard is IParticipantGuard {
    uint8 public constant ACCOUNT_REVISION = 3;
    uint8 private constant VERDICT_SATISFIED = 1;
    uint8 private constant STATE_ACTIVE = 1;

    function allows(address account, uint32 operation) external view returns (bool) {
        if (operation != OP_SUBMIT_G0 && operation != OP_CONFIRM_TENDER) return false;
        IFogaCellViews cell = IFogaCellViews(account);
        if (cell.ACCOUNT_VERSION() != ACCOUNT_REVISION) return false;
        if (cell.presentedBindings().length != cell.requirement().clauses.length) return false;
        (uint8 verdict,,) = cell.status();
        if (verdict != VERDICT_SATISFIED) return false;
        address registry = cell.aid();
        if (registry != address(0) && IAidStateView(registry).state(account) != STATE_ACTIVE) return false;
        return true;
    }
}
