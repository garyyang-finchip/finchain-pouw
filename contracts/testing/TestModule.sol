// SPDX-License-Identifier: Apache-2.0
pragma solidity 0.8.24;

import {IGenesisLedgerV2} from "../v2/interfaces/IGenesisLedgerV2.sol";
import {G1Facts, G1Extra, Entry, FactData} from "../v2/TypesV2.sol";

/// @notice A G1 module that passes on whatever a test states: for the tests of the ledger's own
///         rules - the order of the reasons, the content key, the caps - apart from any source of
///         work. A real module reads what it states from its source and shows what it claims; this
///         one shows nothing. Not part of the protocol.
contract TestModule {
    IGenesisLedgerV2 public immutable ledger;

    constructor(IGenesisLedgerV2 ledger_) {
        ledger = ledger_;
    }

    function record(bytes32 profileKey, G1Facts calldata f, G1Extra calldata x, Entry calldata e)
        external returns (uint256 id, uint8 ineligible)
    {
        return ledger.recordG1(profileKey, f, x, e);
    }

    function fact(bytes32 profileKey, FactData calldata d) external returns (bytes32) {
        return ledger.recordFact(profileKey, d);
    }
}
