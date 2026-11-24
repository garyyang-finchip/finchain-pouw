// SPDX-License-Identifier: Apache-2.0
pragma solidity 0.8.24;

/// @notice What the ledger asks before it records anything in a contract account's name on the
///         word of a delegate. A valid signature of the account is not a safety check: an account
///         can accept its owner's signature at all times, also while its own gate refuses every
///         call. The guard is the place where the rules that the account applies to its own calls
///         are applied to the delegated entry too. The kernel knows this interface and nothing of
///         any account type (docs/ledger-v2.md, section 5).
interface IParticipantGuard {
    /// @notice Whether `account` may, now, have `operation` (an OP_* bit) recorded in its name by
    ///         a delegate. The ledger consults it by a static call with a fixed gas limit and
    ///         takes a revert, a short return and any value other than true as a refusal.
    function allows(address account, uint32 operation) external view returns (bool);
}
