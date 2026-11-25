// SPDX-License-Identifier: Apache-2.0
pragma solidity 0.8.39;

import {Receipt, Status, G1Facts, G1Extra, Entry, Permit, FactData, Fact, EpochSummary} from "../TypesV2.sol";

interface IGenesisLedgerV2 {
    event EpochOpened(uint64 indexed epoch, bytes32 seed, bytes32 seedMaterial, uint32 paramsVersion);
    /// @param origin   the top-level sender of the transaction. A record and nothing else: it takes
    ///                 no part in any authorization and is not stated to be whoever bore the fee
    /// @param operator the worker's declared operator as it was in force when the receipt was
    ///                 recorded: the attribution the epoch's allocation uses
    event ReceiptRecorded(uint256 indexed id, uint64 indexed epoch, address indexed worker, address origin,
        uint32 operator, Receipt receipt);
    event ReceiptStatus(uint256 indexed id, Status status);
    event EpochSealed(uint64 indexed epoch, bytes32 digest, uint64 receiptCount, uint32 paramsVersion,
        uint128 budget, uint128 measuredG0, uint128 measuredG1, uint128 subsidizedG0, uint128 subsidizedG1);
    event ContentKeyTaken(bytes32 indexed contentKey, uint256 indexed receiptId);
    event FactRecorded(bytes32 indexed factId, address indexed source, uint256 indexed tokenId, uint256 submissionId,
        Fact fact);
    /// @param path PATH_ACCOUNT, PATH_STATEMENT or PATH_DELEGATE
    event PermitEnded(address indexed account, bytes32 indexed digest, uint8 path, address by);
    event MinNonceRaised(address indexed account, uint64 minNonce, uint8 path, address by);

    error Paused();
    error WrongPool();
    error JobIndexOutOfRange();
    error WrongEpoch(uint64 current);
    error AlreadySubmitted(uint256 receiptId);
    error NotModule();
    error BadExtra();
    error EpochNotEnded(uint64 epoch);
    error UnknownReceipt(uint256 id);
    error UnknownFact(bytes32 factId);
    // a permit that cannot be used, in the order the checks are made
    error UnknownOperation(uint32 operation);
    error NotDelegate(address caller, address delegate);
    error UnknownScope(uint32 scope);
    error OutOfScope(uint32 scope, uint32 operation);
    error PermitNotYetValid(uint64 current, uint64 notBeforeEpoch);
    error PermitExpired(uint64 current, uint64 notAfterEpoch);
    error NonceBelowMinimum(uint64 nonce, uint64 minimum);
    error PermitRevoked(address account, bytes32 digest);
    error BadSignature(address account);
    error NoGuardBound(address account);
    error GuardMismatch(address bound, uint64 boundVersion);
    error GuardRefused(address guard);

    function domain() external view returns (bytes32);
    function factDomain() external view returns (bytes32);
    function configHash() external view returns (bytes32);

    // ------------------------------------------------------------------ epochs

    /// @notice Capture the current epoch's seed if nobody has yet. Anyone may call; the first
    ///         receipt of an epoch does the same.
    function openEpoch() external returns (uint64 epoch);

    /// @notice Emit the close record of an ended epoch. Anyone may call, once the epoch's interval
    ///         has passed; it takes no figures and changes none.
    function seal(uint64 epoch) external;

    // ------------------------------------------------------------------ G0

    /// @notice Submit the output of the caller's own instance of a G0 job of the current epoch:
    ///         the direct entry, as in 0.1.3. The caller is the participant and the sender.
    function submitG0(bytes32 profileKey, uint64 epoch, uint32 jobIndex, bytes32 outputHash)
        external returns (uint256 id);

    /// @notice The delegated entry: the caller, named as the delegate of `permit`, submits the
    ///         output of the instance of `permit.account`. The permit and its signature are
    ///         checked in this call (`checkPermit`); the instance, the contribution and the
    ///         receipt's worker are the account's, the receipt's sender is the caller.
    function submitG0For(Permit calldata permit, bytes calldata signature, bytes32 profileKey, uint64 epoch,
        uint32 jobIndex, bytes32 outputHash) external returns (uint256 id);

    // ------------------------------------------------------------------ permits

    function domainSeparator() external view returns (bytes32);
    function permitDigest(Permit calldata permit) external view returns (bytes32);
    function revokeDigest(address account, bytes32 permitDigest_) external view returns (bytes32);
    function raiseNonceDigest(address account, uint64 minNonce_) external view returns (bytes32);

    /// @notice Every check of a permit, in order; reverts with the first that fails and returns
    ///         the permit's digest otherwise. `sender` is the caller of the entry function, which
    ///         the entry function reads for itself: the ledger its own caller for G0, a profile's
    ///         module its own caller for G1. `operation` is one OP_* bit.
    function checkPermit(Permit calldata permit, bytes calldata signature, address sender, uint32 operation)
        external view returns (bytes32 digest);

    /// @notice End one permit of the caller's own, for good.
    function revokePermit(bytes32 digest) external;
    /// @notice The same on the word of a `Revoke` statement signed by `account`; anyone may relay it.
    function revokePermitBySig(address account, bytes32 digest, bytes calldata signature) external;
    /// @notice The delegate gives a permit up, for good. Only `permit.delegate` may call.
    function renounce(Permit calldata permit) external;
    /// @notice End every permit of the caller's own whose nonce is below `minNonce_`. The minimum
    ///         only rises; a value that is not above it changes nothing.
    function raiseMinNonce(uint64 minNonce_) external;
    /// @notice The same on the word of a `RaiseNonce` statement signed by `account`.
    function raiseMinNonceBySig(address account, uint64 minNonce_, bytes calldata signature) external;

    function minNonce(address account) external view returns (uint64);
    function isRevoked(address account, bytes32 digest) external view returns (bool);

    // ------------------------------------------------------------------ G1 and facts

    /// @notice Record a settlement as a profile's module read it, apart from any receipt. Only the
    ///         active G1 profile's module. Recording the same settlement again returns the fact
    ///         that exists.
    function recordFact(bytes32 profileKey, FactData calldata data) external returns (bytes32 factId);

    /// @notice Record a confirmed real-demand contribution. Only the active G1 profile's module.
    ///         Recording the same contribution again returns the existing receipt.
    function recordG1(bytes32 profileKey, G1Facts calldata facts, G1Extra calldata extra, Entry calldata entry)
        external returns (uint256 id, uint8 ineligible);

    function factCount() external view returns (uint256);
    function factId(address source, uint256 tokenId, uint256 submissionId) external view returns (bytes32);
    function factRecorded(bytes32 factId_) external view returns (bool);
    function factOf(bytes32 factId_) external view returns (Fact memory);
    function contentKeyOwner(bytes32 contentKey) external view returns (uint256 receiptId);

    // ------------------------------------------------------------------ views

    function receiptCount() external view returns (uint256);
    function receipt(uint256 id) external view returns (Receipt memory);
    function status(uint256 id) external view returns (Status memory);
    function receiptOfContribution(bytes32 contributionId) external view returns (uint256);

    function seedOf(uint64 epoch) external view returns (bytes32);
    function epochSummary(uint64 epoch) external view returns (EpochSummary memory);
    function auditSubject(uint64 epoch) external view returns (bytes32);
    function measuredOf(uint64 epoch, uint8 pool, address worker) external view returns (uint128);
    function subsidizedOf(uint64 epoch, uint8 pool, address worker) external view returns (uint128);
    function subsidizedOfOperator(uint64 epoch, uint8 pool, uint32 operator) external view returns (uint128);

    /// @notice The operator an address was attributed to in an epoch, fixed by its first receipt
    ///         of the epoch. `recorded` false means that the address has no receipt in the epoch,
    ///         not that it was undeclared then.
    function operatorAt(uint64 epoch, address party) external view returns (bool recorded, uint32 operator);

    /// @notice What the addresses of one operator can be allocated together in a pool of an epoch:
    ///         the operator's proportional share of the pool budget, capped at the operator cap.
    function operatorShare(uint64 epoch, uint8 pool, uint32 operator) external view returns (uint256);

    /// @notice A worker's test points of an ended epoch: a pure function of the epoch's frozen
    ///         ledger and its pinned parameters. Reverts while the epoch is running.
    function allocation(uint64 epoch, address worker) external view returns (uint256);

    /// @notice The same computation on a running epoch: provisional, it changes with every receipt.
    function provisionalAllocation(uint64 epoch, address worker) external view returns (uint256);
}
