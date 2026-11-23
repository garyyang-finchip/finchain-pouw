// SPDX-License-Identifier: Apache-2.0
pragma solidity 0.8.24;

/// @notice A minimal contract account for the tests: one owner key, one way to act -
///         `execute(target, value, data)`, the call shape of the common smart-account interface.
///         It stands in for an agent whose on-chain identity is a contract and whose key only
///         drives it: what the ledger sees as the worker, and what a tender sees as its owner, is
///         this contract's address, never the key's. Not part of the protocol.
contract TestAccount {
    address public immutable owner;

    error NotOwner();
    error CallFailed(bytes data);

    constructor(address owner_) {
        owner = owner_;
    }

    function execute(address target, uint256 value, bytes calldata data) external returns (bytes memory ret) {
        if (msg.sender != owner) revert NotOwner();
        bool ok;
        (ok, ret) = target.call{value: value}(data);
        if (!ok) revert CallFailed(ret);
    }

    receive() external payable {}

    function onERC721Received(address, address, uint256, bytes calldata) external pure returns (bytes4) {
        return 0x150b7a02;
    }
}
