// SPDX-License-Identifier: Apache-2.0
pragma solidity 0.8.24;

import {ITaskVerifier} from "../vendor/erc8414/interfaces/ITaskVerifier.sol";

interface IAuthorityOfTender {
    function setAcceptanceAuthority(uint256 tokenId, address newAuthority) external;
}

/// @notice A verifier that accepts every submission and, while it does so, hands the right to
///         judge the tender on to another address. The reference contract of ERC-8414 calls the
///         verifier before it emits the acceptance, by a call that can change state, and the
///         right to judge can be handed on from inside that call: the tender's log then shows
///         the successor as the last authority before the acceptance, although this contract
///         verified. With the zero address as successor it hands nothing on: the plain verifier
///         the other is compared with. For the test of what an audit can and cannot say. Not
///         part of the protocol.
contract HandoverVerifier is ITaskVerifier {
    address public immutable successor;

    constructor(address successor_) {
        successor = successor_;
    }

    function supportsInterface(bytes4 id) external pure returns (bool) {
        return id == type(ITaskVerifier).interfaceId || id == 0x01ffc9a7;
    }

    function verifyFulfillment(address taskContract, uint256 tokenId, uint256, address, bytes32, bytes calldata)
        external returns (bool)
    {
        if (successor != address(0)) IAuthorityOfTender(taskContract).setAcceptanceAuthority(tokenId, successor);
        return true;
    }
}
