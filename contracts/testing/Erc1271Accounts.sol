// SPDX-License-Identifier: Apache-2.0
pragma solidity 0.8.24;

// Two generic contract accounts for the tests of ledger v2. Neither is any product's account and
// neither is part of the protocol. They differ in the one thing the tests need to tell apart:
// whose signature the account accepts as its own.

/// @dev The signer of a 65-byte signature, or zero.
function signerOf(bytes32 hash, bytes calldata signature) pure returns (address) {
    if (signature.length != 65) return address(0);
    bytes32 r = bytes32(signature[0:32]);
    bytes32 s = bytes32(signature[32:64]);
    uint8 v = uint8(signature[64]);
    return ecrecover(hash, v, r, s);
}

/// @notice An account that accepts its owner's signature and nobody else's: after a transfer of
///         ownership the former owner's signatures stop verifying at once.
contract OwnerOnlyAccount {
    address public owner;

    error NotOwner();
    error CallFailed(bytes data);

    constructor(address owner_) {
        owner = owner_;
    }

    function transferOwnership(address newOwner) external {
        if (msg.sender != owner) revert NotOwner();
        owner = newOwner;
    }

    function execute(address target, uint256 value, bytes calldata data) external returns (bytes memory ret) {
        if (msg.sender != owner) revert NotOwner();
        bool ok;
        (ok, ret) = target.call{value: value}(data);
        if (!ok) revert CallFailed(ret);
    }

    function isValidSignature(bytes32 hash, bytes calldata signature) external view returns (bytes4) {
        address signer = signerOf(hash, signature);
        return signer != address(0) && signer == owner ? bytes4(0x1626ba7e) : bytes4(0);
    }

    receive() external payable {}

    function onERC721Received(address, address, uint256, bytes calldata) external pure returns (bytes4) {
        return 0x150b7a02;
    }
}

/// @notice An account with an owner and an operator slot. The owner's signature is the account's
///         at all times. The operator's counts only while the owner has enabled operator signing
///         and the account is not suspended. A transfer of ownership changes the owner and
///         nothing else: a former owner that stays in the operator slot keeps whatever the slot
///         gives it. While suspended, `execute` is refused for every call that the owner has not
///         marked as allowed under a suspension.
contract OperatorSlotAccount {
    address public owner;
    address public operator;
    bool public operatorMaySign;
    bool public suspended;
    mapping(address => mapping(bytes4 => bool)) public allowedWhileSuspended;

    error NotOwner();
    error NotOwnerOrOperator();
    error Suspended();
    error CallFailed(bytes data);

    constructor(address owner_, address operator_) {
        owner = owner_;
        operator = operator_;
    }

    modifier onlyOwner() {
        if (msg.sender != owner) revert NotOwner();
        _;
    }

    function transferOwnership(address newOwner) external onlyOwner {
        owner = newOwner;
    }

    function setOperator(address operator_) external onlyOwner {
        operator = operator_;
    }

    function setOperatorMaySign(bool allowed) external onlyOwner {
        operatorMaySign = allowed;
    }

    function setSuspended(bool suspended_) external onlyOwner {
        suspended = suspended_;
    }

    function setAllowedWhileSuspended(address target, bytes4 selector, bool allowed) external onlyOwner {
        allowedWhileSuspended[target][selector] = allowed;
    }

    function execute(address target, uint256 value, bytes calldata data) external returns (bytes memory ret) {
        if (msg.sender != owner && msg.sender != operator) revert NotOwnerOrOperator();
        bytes4 selector = data.length >= 4 ? bytes4(data[:4]) : bytes4(0);
        if (suspended && !allowedWhileSuspended[target][selector]) revert Suspended();
        bool ok;
        (ok, ret) = target.call{value: value}(data);
        if (!ok) revert CallFailed(ret);
    }

    function isValidSignature(bytes32 hash, bytes calldata signature) external view returns (bytes4) {
        address signer = signerOf(hash, signature);
        if (signer == address(0)) return bytes4(0);
        if (signer == owner) return 0x1626ba7e;
        if (signer == operator && operatorMaySign && !suspended) return 0x1626ba7e;
        return bytes4(0);
    }

    receive() external payable {}

    function onERC721Received(address, address, uint256, bytes calldata) external pure returns (bytes4) {
        return 0x150b7a02;
    }
}

/// @notice An account whose answer to a signature check is whatever a test sets: for the cases in
///         which the check itself misbehaves. Not part of the protocol.
///         0 reverts; 1 returns nothing; 2 returns four bytes; 3 never returns; 4 returns the magic
///         value with a stray bit; 5 returns a hundred thousand bytes of zeros; 6 accepts everything.
contract OddSignatureAccount {
    uint8 public mode;

    function setMode(uint8 mode_) external {
        mode = mode_;
    }

    function isValidSignature(bytes32, bytes calldata) external view returns (bytes4) {
        uint8 m = mode;
        if (m == 0) revert("refused");
        if (m == 1) {
            assembly { return(0, 0) }
        }
        if (m == 2) {
            assembly {
                mstore(0, shl(224, 0x1626ba7e))
                return(0, 4)
            }
        }
        if (m == 3) {
            uint256 i;
            while (true) { unchecked { ++i; } }
        }
        if (m == 4) {
            assembly {
                mstore(0, or(shl(224, 0x1626ba7e), 1))
                return(0, 32)
            }
        }
        if (m == 5) {
            assembly { return(0, 100000) }
        }
        return 0x1626ba7e;
    }
}
