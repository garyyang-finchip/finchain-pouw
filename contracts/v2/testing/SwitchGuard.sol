// SPDX-License-Identifier: Apache-2.0
pragma solidity 0.8.39;

import {IParticipantGuard} from "../interfaces/IParticipantGuard.sol";

/// @notice A guard whose answer a test sets. Not part of the protocol.
///         0 allows; 1 refuses; 2 reverts; 3 returns the number two; 4 never returns; 5 returns
///         nothing.
contract SwitchGuard is IParticipantGuard {
    uint8 public mode;

    function setMode(uint8 mode_) external {
        mode = mode_;
    }

    function allows(address, uint32) external view returns (bool) {
        uint8 m = mode;
        if (m == 1) return false;
        if (m == 2) revert("refused");
        if (m == 3) {
            assembly {
                mstore(0, 2)
                return(0, 32)
            }
        }
        if (m == 4) {
            uint256 i;
            while (true) { unchecked { ++i; } }
        }
        if (m == 5) {
            assembly { return(0, 0) }
        }
        return true;
    }
}
