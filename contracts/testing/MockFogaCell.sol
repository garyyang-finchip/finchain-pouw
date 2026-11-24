// SPDX-License-Identifier: Apache-2.0
pragma solidity 0.8.24;

import {IFogaCellViews} from "../v2/guards/FogaCellGuard.sol";
import {signerOf} from "./Erc1271Accounts.sol";

/// @notice Stands in for a FOGA Cell Account in the tests of the cell guard: the views the guard
///         reads, with values a test sets, and the account's signature rule for its owner - valid
///         at all times, whatever the safety verdict. No FOGA build product is used here; the
///         published account is checked apart, outside this repository. Not part of the protocol.
contract MockFogaCell {
    uint8 public ACCOUNT_VERSION = 3;
    address public owner;
    address public aid;
    uint256 public clauseCount = 1;
    uint8 public verdict = 1;
    bool public statusFails;
    bytes32[] private _bindings;

    constructor(address owner_) {
        owner = owner_;
        _bindings.push(keccak256("binding 0"));
    }

    function setRevision(uint8 revision) external { ACCOUNT_VERSION = revision; }
    function setOwner(address owner_) external { owner = owner_; }
    function setAid(address registry) external { aid = registry; }
    function setClauseCount(uint256 n) external { clauseCount = n; }
    function setVerdict(uint8 verdict_) external { verdict = verdict_; }
    function setStatusFails(bool fails) external { statusFails = fails; }

    function setBindingCount(uint256 n) external {
        delete _bindings;
        for (uint256 i = 0; i < n; i++) _bindings.push(keccak256(abi.encode("binding", i)));
    }

    function requirement() external view returns (IFogaCellViews.RequirementSet memory r) {
        r.clauses = new IFogaCellViews.Clause[](clauseCount);
    }

    function presentedBindings() external view returns (bytes32[] memory) {
        return _bindings;
    }

    function status() external view returns (uint8, uint8[] memory reasons, uint8[] memory restrictions) {
        require(!statusFails, "registry unavailable");
        reasons = new uint8[](clauseCount);
        restrictions = new uint8[](clauseCount);
        return (verdict, reasons, restrictions);
    }

    function isValidSignature(bytes32 hash, bytes calldata signature) external view returns (bytes4) {
        address signer = signerOf(hash, signature);
        return signer != address(0) && signer == owner ? bytes4(0x1626ba7e) : bytes4(0);
    }
}

/// @notice Stands in for an AID registry: the state of an anchor, as a test sets it.
contract MockAidRegistry {
    mapping(address => uint8) private _state;
    bool public fails;

    function setState(address anchor, uint8 state_) external { _state[anchor] = state_; }
    function setFails(bool fails_) external { fails = fails_; }

    function state(address anchor) external view returns (uint8) {
        require(!fails, "registry unavailable");
        return _state[anchor];
    }
}
