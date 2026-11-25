# Ledger v2: bounded delegation, operator aggregation, work facts and receipts

Status: **revision 5. Implemented and tested on a local network; the interfaces are frozen
(section 11.8); the v2 contracts are compiled behind a boundary of their own, and their builds
are committed with a build record (section 1). Not deployed and nothing signed.**

The contracts are in `contracts/v2/`, beside the kernel of release 0.1.3, which is not changed.
The tests are `test/v2.*.test.js`; section 14 gives the result of every row of the test matrix.
The client's part of this document - an audit that reads one block, records with a canonical
form, the authority at a settlement - is built in release 0.1.4 against the kernel of 0.1.3
(section 13); release 0.1.5 corrects three of its tools. What is not built is listed in
section 16.

Where this comes from, in order: revision 1 was this repository's draft for the rulings on Q13,
Q14 and Q16; revision 2 applied the advisor's walk-through of it and the six choices the owner
made; revision 3 is the implementation, with the five corrections the owner adopted on
2026-11-25 (section 15). The rulings are A73 to A79 of `decisions.md`, which also says who
drafted and who adopted each (`decisions.md` 14.1). Revision 4 records the rulings the owner
made on the same day on the advisor's review of the implementation (A80 to A86; `decisions.md`
15): the interfaces are frozen (Q30), the ledger is built through the compiler's IR pipeline
with a compiler of its own for v2 (Q31), and this repository's choices in the implementation,
P61 to P66, are adopted within the boundaries stated there. With it come the corrections of
three tools and of the wording on statements and on facts. Revision 5, with release 0.1.6,
applies A82: the compile boundary of v2, its compiler, its builds and the record of how they
were made (`decisions.md` 16).

What v2 is: the minimum coherent next version of the Genesis ledger. It adds four things and
changes nothing else of the kernel: (1) a participant can authorize a separate key, within
stated bounds, to submit its G0 work and confirm its settled tenders; (2) the allocation caps the
aggregate of a declared operator; (3) work facts are recorded apart from receipts; (4) a receipt
carries the fields the production line needs. Test points stay what they are: the value of a
view, with no balance, claim, transfer or right to any future asset.

## 1. What stays, and how v2 is deployed

- Epochs are intervals of a clock fixed at deployment; a receipt is final when recorded and
  counts in the epoch it is recorded in; an epoch is frozen by time; the allocation is a pure
  function of stored figures; `seal` writes a close record and changes no figure.
- A receipt, its verdict, its eligibility and its relation class are set once, in the transaction
  that records the receipt. No rule of v2 changes a recorded status or a frozen epoch.
- The contracts hold no funds and are not upgradeable. v2 is a new deployment beside the ledger
  of round R2a, with a domain of its own (section 11.5). Its manifest names the deployment it
  supersedes in a new field, `supersedes`. The R2a ledger, its manifest and its evidence are not
  migrated, rewritten or reinterpreted.
- Nothing of FOGA or of a chain is named in the kernel. What is specific to an account type or
  to ERC-8414 lives in a module that a profile or the policy points at.
- The G0 function of 0.1.3, `AuditV1`, is used as it is: it reads `configHash` and
  `auditSubject`, which v2 keeps with the same signatures.

**The build.** With the kernel's compiler settings the v2 ledger comes to 24,542 bytes of code,
34 under the limit a chain puts on a contract (EIP-170: 24,576). Through the compiler's IR
pipeline, with the same optimizer runs, it comes to 21,674 bytes; a test holds it at least
1,024 bytes under the limit. The other contracts are compiled here as the kernel is.

The owner ruled for the IR pipeline (A82, on Q31), on a condition. What was compiled with
solc 0.8.24 up to release 0.1.5 stays evidence of the local tests of those releases; it is not
the build a deployment is made from. solc 0.8.24 lies inside the range of a known bug of the
compiler's Yul optimizer - versions 0.8.19 to 0.8.37, fixed in 0.8.38 - which with the IR
pipeline can concern any code, with or without inline assembly. No miscompilation was observed,
and tests that pass do not rule one out. So the v2 contracts have a compile boundary of their
own and a compiler in which that bug is fixed. The kernel keeps its compiler, its settings and
its six committed builds, and the compiler is not replaced for the whole repository.

**The compile boundary, from release 0.1.6.** The boundary is the directory `contracts/v2`.

- Every file under `contracts/v2` states `pragma solidity 0.8.39;` and imports files under
  `contracts/v2` only. Every file of the kernel states `0.8.24` as before. A file of one side
  that imported a file of the other would not compile, and a test holds both rules and reads
  from the compiler's own records that no compilation held files of both sides.
- The v2 contracts call three interfaces of the kernel: the seed source, the G0 function and
  the tender. v2 has its own copies of them in `contracts/v2/external/`, with the same names
  and the same declarations. What the two sides share is the ABI of those interfaces; a test
  holds each copy to the ABI and to the text of the kernel's declaration. The names are kept
  because a compiled interface records them, and the compiled interfaces are frozen.
- The four test fixtures that import v2 - the ERC-1271 accounts, the switchable guard, the mock
  cell and the test module - moved to `contracts/v2/testing/`. Nothing there is ever deployed.
- The ERC-8414 reference contracts under `contracts/vendor` state `^0.8.24`. They are pinned to
  the kernel's compiler by name, as they were compiled before.

**The compiler.** solc 0.8.39, as the package `solc@0.8.39` that `package-lock.json` pins by its
integrity hash; `npm ci` installs it and no compiler is downloaded at build time. Its own full
version is `0.8.39+commit.ce47f2c8.Emscripten.clang`. The settings are the kernel's: optimizer
enabled with 200 runs, EVM version `cancun`. The ledger alone goes through the IR pipeline; the
policy, the adapter and the cell guard go through the legacy pipeline, as P66 had it. Through
the legacy pipeline of 0.8.39 the ledger comes to 24,705 bytes, 129 over the limit: with this
compiler the IR pipeline is not a matter of room but the only way the ledger can be deployed.
Through the IR pipeline it comes to 21,855 bytes, 2,721 under the limit.

Why 0.8.39 and not 0.8.38: read on 2026-11-25, the compiler's own list of known bugs has none
for 0.8.39, which was released on 2026-11-19, and one for 0.8.38, in two entries - a storage
corruption on a copy between overlapping recursive structs, fixed in 0.8.39. An empty entry
says that no bug was known on the day of the reading, and nothing more: a bug found later is
added to the list for every version it concerns. The reading - its date, where the list was
read, the hashes of the two files, and what they held for 0.8.39, 0.8.38 and 0.8.24 - is
`build/v2/known-bugs-check.json`. A test fails when the v2 compiler changes and that record is
not made again. Hardhat 2.29.2 prints a notice that solc 0.8.39 is "not fully supported yet";
the notice names features of Hardhat itself, such as its stack traces, and not what the
compiler produces.

**The builds.** `build/v2/` holds one file for each contract a v2 deployment is made of - the
policy, the ledger, the adapter and the cell guard - in the form of the kernel's builds, with
two things added: the pipeline, and every source file the contract is made of with the hash the
compiler itself wrote into the contract's metadata. `build/v2/build-record.json` says how they
were made: the compiler's package, the integrity hash of the lock file, the compiler's full
version, the hash of the compiler's own file, the settings of each contract, and the size and
the hashes of what came out. `npm ci && npm run export-abi` on another machine writes the same
bytes, and `test/v2.build.test.js` fails when a committed build or the record is not what the
sources compile to. The five compiled interfaces came out byte for byte as they were frozen.

A build changes whenever a v2 source changes, a comment included, because the compiler puts a
hash of the sources into the code. So these builds are the candidates for a deployment and no
more than that until a deployment's operation package names one of them by commit and by the
hashes of its record. Sizes and gas: section 11.7.

## 2. Participant, sender and origin

To the kernel of 0.1.3 a party is the sender of a call. v2 keeps that entry and adds a second
one, and it records three identities separately.

| Identity | What it is | Where it is recorded |
| --- | --- | --- |
| Participant | the address of record: the worker of a receipt, or the demander that confirms a tender | the receipt (`worker`, `counterparty`) |
| Sender | the caller of the entry function: of the ledger for G0, of the adapter for G1 | the receipt (`sender`) |
| Origin | the top-level sender of the transaction (`tx.origin`) | the receipt's event (`origin`); the audit compares it with the transaction's `from` |

The origin is a record and nothing else. It is not stated to be whoever finally bore the fee,
and it takes no part in any authorization.

| Entry | Who sends | When it applies |
| --- | --- | --- |
| Direct | the participant itself: a key, or a contract account through its own execution function | always; it is the entry of 0.1.3 and remains a legitimate one. For a FOGA cell the call passes the account's own gate, by construction of the account |
| Delegated | a key named in a permit that the participant signed | only with a valid permit and, for a contract account, only when the account's guard allows it (sections 4 and 5) |

What these records show: who was authorized and who sent. What they do not show: which program
decided to do the work, or who executed a model. A receipt recorded through a permit says that
the account accepted the permit's signature when it was used; it is no evidence that the
agent's own software initiated the work. The run that initiated a submission is described off
chain, in the run record of the client, and is labelled for what it was.

## 3. The permit, and the two statements that end one

All three are EIP-712 statements in one domain, `{name: "PoUW Genesis Ledger", version: "2",
chainId, verifyingContract: <the v2 ledger>}`, each with a type of its own: a signature made
for one cannot be used as another, on another chain or against another ledger. The account adds
no binding of its own - the published FOGA account validates a bare digest, and one owner key
can own accounts on several chains - so everything that bounds a statement is inside it. The
exact types and the encoding are in section 11.4.

`Permit`:

| Field | Type | Meaning |
| --- | --- | --- |
| `account` | address | the participant that authorizes |
| `delegate` | address | the only key that may use the permit |
| `scope` | uint32 | bit 0 `SUBMIT_G0`, bit 1 `CONFIRM_TENDER`; any other bit set makes the permit invalid in this version |
| `notBeforeEpoch` | uint64 | first epoch in which it can be used |
| `notAfterEpoch` | uint64 | last epoch in which it can be used |
| `nonce` | uint64 | the authorization version; usable only while it is not below the account's minimum (section 6) |
| `guard` | address | the guard the consumer must consult; zero only for an account without code |
| `guardBindingVersion` | uint64 | the version of the account's guard binding the permit was signed for; zero for an account without code (section 5) |

`Revoke{address account, bytes32 permitDigest}` and `RaiseNonce{address account, uint64
minNonce}` are the two statements by which an account ends permits without sending a
transaction (section 6). Neither carries an expiry or a nonce of its own. Once signed, a
statement can be submitted by anyone who holds it, at any time: whoever signs one treats it as
out of his hands. The ledger changes when a transaction that carries the statement succeeds
and not before - until then the permit is not revoked and the minimum is not raised. Both
statements only take authority away.

What a permit cannot do, whatever its fields say: make the account call anything, move or
approve an asset, spend the account's balance, authorize a further delegate, or act for another
account. The ledger offers a delegate two functions and no other: `submitG0For` and, through the
tender adapter, `confirmFor`. A delegate pays its own gas.

## 4. Verification at each use

A permit is not registered. The delegate presents the permit and its signature with every call,
and all of the following are checked in that call, in this order; the first that fails reverts
with its own error (section 11.3).

1. The caller of the entry function is `permit.delegate`. For G0 the ledger reads its own
   `msg.sender`. For G1 the adapter reads its own `msg.sender` and reports it to the ledger; a
   caller cannot state a sender, and `tx.origin` is never read for this.
2. No unknown bit is set in `permit.scope`, and the operation's bit is set.
3. The current epoch is within `[notBeforeEpoch, notAfterEpoch]`.
4. `permit.nonce >= minNonce[account]`, and `revoked[account][digest]` is not set.
5. The signature. For an account without code: the ECDSA signer of the digest is the account,
   the signature has 65 bytes, and its `s` is in the lower half of the curve order, so that a
   signature has one accepted form. For an account with code: `isValidSignature(digest,
   signature)` returns `0x1626ba7e`, by a static call that is given 200,000 gas and of whose
   answer one word is read; a revert, a short return, any other value and an exhausted call are
   a refusal.
6. The guard, with the binding version (section 5).

For G1 the adapter checks first that `permit.account` is the tender's owner as it stands.

An address is an account with code when it has code at the time of use. That includes an
externally owned account that has set a code delegation: it is then asked through ERC-1271 and
needs a bound guard, like any contract account.

**What checking at each use establishes, and what it does not.** It establishes that the
account accepts the signature now. Whether a change of the account's owner or operator ends a
permit is decided by the account's own signature rule, not by this ledger, and no general
promise is made. On the published FOGA account a transfer of ownership changes the owner and
nothing else: a former owner that stays in the operator slot, with operator signing enabled, is
still accepted while the account's safety binding is satisfied, and its old permit still
verifies; with operator signing off - the configuration read on chain for both cells of round
R2b - it does not. The ledger's own means of ending a permit are revocation and the minimum
nonce, and they end permits, not keys (section 6).

## 5. Guards

A successful signature check is not a successful safety check. On the published FOGA account a
signature by the owner is valid at all times - also while the account's safety binding is
suspended, and also for a one-key cell, whose key is the owner. A delegated entry would
therefore go around the account's own gate unless the consumer asks.

The kernel has one interface and no knowledge of any account type:

```solidity
interface IParticipantGuard {
    /// Whether `account` may, now, have `operation` recorded in its name by a delegate.
    function allows(address account, uint32 operation) external view returns (bool);
}
```

- **Binding.** The steward binds a guard to an account in the policy, from the next epoch. Every
  binding of an account, to any guard, takes the account's next version number: the number
  never falls and is never reused - not when the same guard is bound again, and not when a
  binding is replaced before its epoch has begun, in which case the replaced number is simply
  gone. A binding scheduled for a later epoch does not replace the one in force before that
  epoch begins. A delegated call for an account with code is refused unless a guard is bound,
  `permit.guard` and `permit.guardBindingVersion` equal the binding in force, and `allows`
  returns true. Comparing the address alone would not be enough: after a rebinding from A to B
  and back to A, a permit signed for the first A would work again. With the version it does
  not, so a change of guard always needs a new permit.
- **A guard is consulted** by a static call that is given 500,000 gas and of whose answer one
  word is read; a revert, a malformed return and an exhausted call are a refusal. A guard is a
  contract without a proxy; the policy records its code hash in the event of the binding and
  the manifest records it as well.
- **Accounts without code** need no guard; their permits carry the zero address and version
  zero, and a permit of such an account that names a guard is refused. A key that signs for
  itself has no gate of its own to go around.
- **Default deny.** No guard bound means no delegated entry for a contract account. The direct
  entry stays open to it.
- **What the ledger does not gate.** Revocation, the raising of the minimum nonce and a
  delegate's renouncing never consult a guard, and a pause of the policy does not stop them
  either. That is a statement about the ledger and not about any account. When an account's
  own gate refuses a call to the ledger, the ledger asking no guard does not make the account
  send it: a direct revocation through the account's execution function cannot be relied on
  while the account is suspended. Nor is it certain to fail - the published FOGA account lets
  calls through under a suspension when its owner has marked them as de-risking and the
  suspension is of the kind that allows it. Which calls pass is the account's rule. The paths
  that do not depend on the account sending anything are the signed ones - a `Revoke` or
  `RaiseNonce` statement relayed by anyone - and the delegate's own renouncing. A signed path
  is open only as far as the account accepts the signature in that state: the published FOGA
  account accepts its owner's at all times, and its operator's only with operator signing
  enabled and while its safety binding is satisfied; a generic ERC-1271 account promises
  neither.

The guard for FOGA cells is an optional module, `FogaCellGuard` (`contracts/v2/guards/`),
outside the kernel. It reads the account's own public views and returns true only when all of
the following hold, for both operations: the account is of revision 3; it has presented as
many bindings as its requirement has clauses; its safety verdict is `Satisfied`; and, where the
account names an AID registry, its anchor is `ACTIVE` there. A view or a registry call that
fails makes the guard's call fail, which is a refusal. This is the stricter rule of the
delegated PoUW entry, not a restatement of the account's gate, which asks for the anchor only on
calls its owner marked as commitment-class and lets some calls through under a suspension. The
module is built against a minimal interface of those views and tested against a mock of them;
no FOGA build product enters this repository, and FOGA is not changed.

## 6. Ending permits, and taking a key's signing right away

Two things are kept apart, because they are done by different means and the first does not
bring about the second.

| Purpose | What does it | What it leaves untouched |
| --- | --- | --- |
| To end one permit | revoke its digest: the account's call, a `Revoke` statement relayed by anyone, or the delegate's renouncing | every other permit, and the right of every accepted key to sign new ones |
| To end a generation of permits | raise the account's minimum nonce above them: the account's call, or a `RaiseNonce` statement | permits at or above the new minimum, and the right of every accepted key to sign new ones |
| To stop a key from authorizing for the account | take its signing right away **in the account**, with the account's own management functions | nothing of the ledger: the ledger has no record of keys |

Ending permits is kept per account: `revoked[account][digest]` and `minNonce[account]`. A direct
call writes only the caller's own entries; a signed statement writes the entries of the account
whose signature verified; a renouncing writes the entry of `permit.account` and is accepted only
from `permit.delegate`. Nobody can mark another account's permit. A revoked digest is a
permanent mark and there is no registration to repeat, so a revoked permit cannot be restored by
presenting it again. A minimum nonce only rises: a value at or below it changes nothing.

What a repeat does depends on the entry. The account's own call and the delegate's renouncing,
done again, change nothing and do not fail. A statement is verified against the account each
time it is submitted. Sent again while the account still accepts the signature, it is accepted
and changes nothing. Sent again after the account has stopped accepting that signature - the
key's signing right was taken away - it is refused with `BadSignature`, although the mark it
asks for is there already. That refusal is right: the ledger does not pass over the check of a
signature in order to let a repeated call succeed. A test holds each of these cases.

| Event | Effect on a permit | How |
| --- | --- | --- |
| The last epoch passes | ends | `notAfterEpoch` |
| The account revokes one permit | ended for good | `revokePermit(digest)` sent by the account, or `revokePermitBySig` by anyone with the account's `Revoke` statement |
| The delegate gives the permit up | ended for good | `renounce(permit)` sent by the delegate |
| The account invalidates a generation | every permit with a lower nonce ends | `raiseMinNonce(n)` sent by the account, or `raiseMinNonceBySig` by anyone with the account's `RaiseNonce` statement |
| The guard binding of the account changes | ended for good, also if the same guard is bound again | `guardBindingVersion` |
| The account's owner or operator changes | whatever the account's signature rule says; not promised by the ledger | the check of section 4, step 5 |
| The account's safety binding is suspended, or its anchor leaves `ACTIVE` | refused while that lasts; usable again afterwards unless ended | the guard |
| The steward withdraws the account's admission | from the next epoch its work is measured and not subsidized | the policy, as in 0.1.3 |
| The steward pauses | no receipt and no fact is recorded; permits can still be ended, epochs opened and sealed | the policy |

**Raising the nonce does not retire a key.** If a former owner is still a key the account
accepts - on the published FOGA account: it stays in the operator slot with operator signing
enabled - it can sign a new permit at or above the new minimum, and that permit verifies. The
minimum nonce cleared the old generation; it did not take away the key's ability to authorize.
Test L10 shows both halves: with the signing right left in place, raising the nonce is followed
by a new, accepted permit of the old key; with the signing right taken away in the account, the
permit just used and every permit the old key signs afterwards are refused.

**Rotation of an account's keys**, when the aim is that the old key leaves PoUW authorization:

1. Read the account's own configuration: who is owner, who is in the operator slot, whether
   operator signing is enabled.
2. Take the old key's signing right away in the account, with the account's existing
   management functions - on the published FOGA account, by replacing the operator or by
   turning operator signing off. This needs no release of FOGA and no function of the ledger.
3. End the old permits: revoke them or raise the minimum nonce, by a statement of the new owner.
4. Verify on chain that the old permit is refused and that a permit newly signed by the old key
   is refused as well.
5. If delegation is to continue, sign a new permit with the new owner's key.

Where an operator means to keep the former owner as a signing operator, that is recorded as
what it is - authority kept - and the key is not at the same time said to have left.

## 7. The receipt and the status of v2

| Field | Type | Meaning |
| --- | --- | --- |
| `epoch`, `pool`, `profileId` | as in 0.1.3 | unchanged |
| `worker` | address | the participant whose work it is |
| `counterparty` | address | G1: the demander that confirmed; G0: zero |
| `sender` | address | the caller of the entry function (section 2) |
| `authorization` | bytes32 | zero on the direct entry; the permit's digest on the delegated one |
| `role` | uint8 | the contribution class of the profile version: 1 intelligence production, 2 agent fulfillment, 3 verification, 4 public service; 0 for the two profiles of 0.1.3 |
| `unit` | uint8 | under a profile version that counts task units, what the module found: 1 a whole task unit, 2 not a member of the set, 3 a part, 4 not issued by a named demander; 0 under a version that does not |
| `workId` | bytes32 | G1: `keccak256(abi.encode(chainId, source, tokenId, submissionId))`; G0: the worker's instance |
| `parent` | bytes32 | the `workId` of the work this one is a part of, or zero |
| `envelopeHash` | bytes32 | commitment to the production evidence envelope, or zero |
| `contentKey` | bytes32 | the task that a profile counts once, or zero |
| `inputHash`, `outputHash`, `contributionId`, `recordedAt` | as in 0.1.3 | unchanged in meaning; the contribution id is computed in the v2 domain |

`Receipt.ref` of 0.1.3 is gone: `workId` takes its place. For G0 the two are the same value.
For G1 the work id includes the chain id, as `production-service.md` 4.1 defines it, and the
`ref` of 0.1.3 did not.

The status keeps its six fields and gains one: `duplicateOf` (uint256), the id of the receipt
that took the counting of the content key, and zero in every other case.

`role` is a property of the profile version and is not supplied by a caller. `unit`, `parent`,
`envelopeHash` and `contentKey` are stated by the profile's module, the only caller the ledger
accepts for a G1 receipt, as it states the facts of the receipt. The encoding is fixed-size and
is versioned by the ledger's domain: a later change of these fields is a later ledger.

**How a profile version says that it counts task units.** A profile version carries, beside
what it carries in 0.1.3: `role`; `countsUnits`; and two commitments that are zero unless
`countsUnits` is set, `unitSetRoot` - to the version's task units - and `issuerSetRoot` - to the
demanders the version names. Only a G1 version can count units, and one that does must carry
both commitments. The division of work is this:

| Who | Does |
| --- | --- |
| The profile version (the policy) | commits to what the task units are and to who issues them |
| The profile's module | shows, when a contribution is recorded, that the delivery is a member of the committed set, whole, and issued by a named demander - or that it is not - and states the result as `unit` with the content key |
| The ledger | applies one order of rules to that statement, tests and takes the content key, and records |

The ledger refuses a statement that does not fit the version: a unit or a key under a version
that does not count units, no unit under one that does, a whole unit without a key. The module
of `g1.tender` (`TenderAdapter8414V2`) serves a version that does not count units. The module
that shows membership for the first production profile, `g1.inference`, is part of that
profile's build and is not in this version (section 16); the ledger's rules for units are
tested with a module that states what a test tells it.

Reasons of ineligibility added to the eleven of 0.1.3:

| Code | Reason | Measured GMU | `duplicateOf` | Content key |
| --- | --- | --- | --- | --- |
| 12 | `operator-not-declared`: the worker has no declared operator | kept | zero | taken, where the profile counts once |
| 13 | `demander-operator-not-declared` | kept | zero | taken, where the profile counts once |
| 14 | `duplicate-contribution`: a later rightful delivery of a content key that is taken | zero | the receipt that took it | not taken again |
| 15 | `not-a-task-unit`: not a member of the profile's task units, a part of one, or not issued by a demander the profile version names | zero | zero | not taken |

**Order of the rules.** A status has one reason, the first that applies in a fixed order, and
the audit applies the same order. G0: rejected (1), not admitted (2), operator not declared
(12), worker cap (10). G1: not a task unit (15), duplicate contribution (14), then self-dealing
(3), before genesis (4), worker not admitted (2), demander not admitted (11), worker's operator
not declared (12), demander's operator not declared (13), relation (5), asset (6), bounty (7),
demander cap (8), pair cap (9), worker cap (10). The first two G1 reasons apply only under a
profile that counts task units.

## 8. Operator aggregation

**Attribution is fixed when a receipt is recorded.** With an address's first receipt of an
epoch the ledger reads the address's operator as the policy has it in force and stores it for
that epoch and address, with a flag that it was stored. Declarations apply from the next epoch
only, so every later receipt of the epoch would read the same operator. Subsidized GMU is also
added to the operator's total of the epoch and pool, and the operator is part of what the
epoch's rolling digest commits to. An allocation of an epoch is computed from the stored values
and never from the policy's present declaration, so a later change of declarations cannot move
a past allocation. `operatorAt(epoch, party)` returns the flag with the value: a zero without
the flag means that the address has no receipt in that epoch, not that it was undeclared then.

**Eligibility.** The early subsidy of v2 requires a declared operator: a worker whose operator
is zero has its accepted work recorded and measured, with reason 12 and no subsidized GMU. For a
G1 receipt the demander needs one as well (reason 13). No such condition is put on the judge.
This is a condition of the early subsidy. It is no rule of admission to the network and no
evidence that two operators are independent.

**Allocation.** For epoch `e` and pool `k`, with pool budget `B`, address cap `c` and operator
cap `cOp` in basis points, `g(i)` the subsidized GMU of address `i`, `g(o)` that of its operator
`o` and `G` that of the pool:

```
S(o) = min( floor(B * g(o) / G) , floor(B * cOp / 10000) )
A(i) = min( floor(S(o) * g(i) / g(o)) , floor(B * c / 10000) )
```

`A(i)` is zero when `G`, `g(o)` or `g(i)` is zero; nothing is divided by zero. Every division
rounds down. What a cap withholds and what rounding leaves are allocated to nobody. The sum over
an operator's addresses never exceeds `S(o)`. The function stays a view with a constant number
of reads; `operatorShare(epoch, pool, operator)` returns `S(o)`.

**The two caps.** Both are fields of a parameter version, each above zero and at most 10000.
Their relation matters and is not enforced. With `cOp` above `c`, an operator can be allocated
more by holding more addresses even with the same GMU: at `c` 2500 and `cOp` 5000, one address
takes at most a quarter of a pool and two addresses of one operator up to a half (test L22).
That stays within the operator cap and is not "splitting gains nothing". A controlled
deployment is advised to keep `cOp <= c`; the values, like the budget, the split and the epoch
length, are a deployment's configuration, and the values of round R2a are not defaults of v2.

**What the operator cap bounds, and what it does not.** It bounds what the declared addresses of
one operator are allocated in a pool. It does not identify addresses that are not declared
together. And it does not remove every gain from holding several addresses: the per-worker GMU
cap of a profile and the per-demander and per-pair counters still count per address, so an
operator with more addresses can accrue more subsidized GMU, and that GMU enlarges the pool's
total and lowers the shares of others even when its own allocation is capped. Operator-level GMU
caps and operator-level counters would answer that; they are a separate enhancement and are not
part of what was ruled for the operator cap.

## 9. Work facts and confirmations

| Record | Made by | Holds | Counts |
| --- | --- | --- | --- |
| Work fact | anyone, through the adapter, which reads the settlement from the tender in the same call | what was read: source, tender, submission, fulfiller, owner and judge as they stand, task and result hashes, bounty asset and amount, time of delivery; the recorder | nothing: no GMU, no contribution id, no content key, no cap, no counter |
| Receipt | the tender's owner, directly or through its delegate, by confirming | the contribution | in the epoch in which the confirmation is recorded |

- A fact's id is `keccak256(abi.encode(factDomain, source, tokenId, submissionId))` (section
  11.5). It is not a contribution id and cannot collide with one. Recording the same settlement
  again returns the fact that exists. A fact is of a settled submission only, and recording one
  does not open an epoch.
- A confirmation needs no fact and is not blocked by one. Either can come first.
- A confirmation does all of the following in one transaction, or none of it, in this order:
  the checks that the submission is `Accepted` and that the caller is the tender's owner or its
  permitted delegate; the lookup of the contribution id; under a profile that counts task
  units, the module's showing that the delivery is a task unit (section 7; the demander is the
  one that is represented, so a rightful delegate is not another demander); the test and the
  taking of the content key; the recording of the receipt with its status; the accrual to the
  address, the operator and the epoch.
- **One occupancy per ledger.** The state of a content key is shared across the whole
  deployment: a key that is taken is taken for every profile, specification, epoch, worker and
  model. The first rightful receipt with measured GMU takes it, whether or not that receipt is
  subsidized: taking the counting is measurement.
- **What cannot take a key.** A work fact, a delivery that is not a task unit, a confirmation
  by a party that is not the rightful demander or its delegate, and a part of a task: none of
  them marks a key, so none can stand in the way of the rightful confirmation.
- The same source confirmed again returns the receipt that exists and changes nothing. Another
  source with a content key that is taken is recorded with reason 14, names the receipt that
  took the key in `duplicateOf`, and adds no GMU of either kind.
- Work whose demander never confirms is in no epoch's GMU. It can have a public fact: one
  exists when somebody recorded it, and none is made automatically.

## 10. The authority as it was at settlement

Unchanged in v2, and said so wherever a G1 rule is described: the adapter reads the tender's
owner and judge when the confirmation is recorded. A party can settle while it holds the right
to judge and hand that right on before the confirmation; `worker == judge` does not catch it
(test L31). ERC-8414 keeps no state of a past authority. Rounds R2b and R3 allocate test points
that cannot be redeemed and run within this limit, disclosed.

What the audit says is bounded by what a tender's log holds. It keeps two things apart:

| Record | What it is | When |
| --- | --- | --- |
| `registered` | the address the last `AcceptanceAuthorityChanged` record before the acceptance names: a fact of the log | always, when the log has an acceptance |
| `evidence` | whether that fact can stand for the authority that was consulted | `registered-authority-visible` when the authority of that tender did not change in the acceptance's transaction; `evidence-insufficient` when it did; `no-acceptance-record` when the log has no acceptance before the receipt |

The match is exact: a change counts when it is of the same source and the same token and in
the same transaction as the acceptance. A change of another tender in that transaction, or of
this tender in another transaction, does not. Neither value establishes who carried out a
verification. The reference contract calls a verifier before it emits the acceptance, the call
is not a static call, and the right to judge can be handed on without a reentrancy guard: a
verifier can pass the authority to another address inside its own verification, and the log
then shows the successor as the last authority before the acceptance. Where the evidence is
insufficient the registered address is still reported as what the log holds, and nothing is
concluded about a party from it: the audit does not say that a worker judged its own delivery
on such evidence (test L32). This boundary is derived from the source and reproduced on a local
network with a verifier written for the test; it was not exercised in round R2a and nothing
suggests it occurred there.

Before any subsidy of value the history of authority and its evidence have to be complete. The
direction to study first is that the evidence is verified before a formal receipt exists. If
contributions are to be recorded first and rewards decided later, that needs a reward
settlement layer of its own. v2 does not put a later verification that withdraws a subsidy into
a receipt that cannot change or into an epoch that is frozen. A customer's bounty and a PoUW
subsidy stay separate and neither is a precondition of the other.

## 11. Interfaces (frozen on 2026-11-25)

Frozen by the owner's ruling on Q30 (A81); 11.8 says what the freeze holds and what it leaves
open. The compiled interfaces are in `client/abi/`: `GenesisLedgerV2.json`, `GenesisPolicyV2.json`,
`TenderAdapter8414V2.json`, `IParticipantGuard.json`, `FogaCellGuard.json`. A test fails when
they are not what the sources compile to. The sources: `contracts/v2/TypesV2.sol` (types and
codes), `interfaces/` (the three interfaces), `GenesisLedgerV2.sol`, `GenesisPolicyV2.sol`,
`TenderAdapter8414V2.sol`, `guards/FogaCellGuard.sol`.

### 11.1 Types

Field order is the order of encoding.

```solidity
struct Profile {
    bytes32 key; bytes32 id; uint8 pool; uint32 version; address module; uint64 baseGmu;
    uint64 maxGmuPerWorkerPerEpoch; uint32 jobsPerEpoch; uint64 activeFromEpoch;
    uint64 retiredFromEpoch; uint8 role; bool countsUnits; bytes32 unitSetRoot;
    bytes32 issuerSetRoot; string name;
}
struct ProfileSpec {   // what the steward states; the policy derives key, id and version
    string name; uint8 pool; address module; uint64 baseGmu; uint64 maxGmuPerWorkerPerEpoch;
    uint32 jobsPerEpoch; uint64 activeFromEpoch; uint8 role; bool countsUnits;
    bytes32 unitSetRoot; bytes32 issuerSetRoot;
}
struct Params {
    uint64 activeFromEpoch; uint128 budgetBase; uint32 halvingInterval; uint16 splitG0Bps;
    uint16 workerCapBps; uint16 operatorCapBps; uint128 minBountyWei;
    uint32 maxSubsidizedPerDemander; uint32 maxSubsidizedPerPair; bool subsidizeDeclaredRelated;
}
struct Permit {
    address account; address delegate; uint32 scope; uint64 notBeforeEpoch;
    uint64 notAfterEpoch; uint64 nonce; address guard; uint64 guardBindingVersion;
}
struct Entry { address sender; bytes32 authorization; }   // stated by a profile's module only
struct Receipt {
    uint64 epoch; uint8 pool; bytes32 profileId; address worker; address counterparty;
    address sender; bytes32 authorization; uint8 role; uint8 unit; bytes32 workId;
    bytes32 parent; bytes32 envelopeHash; bytes32 contentKey; bytes32 inputHash;
    bytes32 outputHash; bytes32 contributionId; uint64 recordedAt;
}
struct Status {
    uint8 verdict; uint8 ineligible; uint8 relation; uint64 gmuMeasured; uint64 gmuSubsidized;
    address verifier; uint256 duplicateOf;
}
struct G1Facts {       // as in 0.1.3
    address source; uint256 tokenId; uint256 submissionId; address worker; address demander;
    address judge; bytes32 inputHash; bytes32 outputHash; address asset; uint256 reward;
    uint64 deliveredAt;
}
struct G1Extra { bytes32 parent; bytes32 envelopeHash; bytes32 contentKey; uint8 unit; }
struct FactData {
    address source; uint256 tokenId; uint256 submissionId; address fulfiller; address owner;
    address judge; bytes32 taskHash; bytes32 resultHash; address asset; uint256 reward;
    uint64 deliveredAt; address recorder;
}
struct Fact { FactData data; bytes32 profileId; uint64 recordedAt; }
struct GuardBinding { address guard; uint64 version; uint64 fromEpoch; bytes32 codeHash; }
```

`EpochSummary` is that of 0.1.3. Codes: pools 0 and 1; verdicts 1 and 2; relations 0 to 2;
reasons 0 to 15 (section 7); operations `OP_SUBMIT_G0 = 1`, `OP_CONFIRM_TENDER = 2`; roles 0 to
4; units 0 to 4; the path by which a permit was ended or a nonce raised: 1 the account's call,
2 a signed statement, 3 the delegate.

### 11.2 Functions

```solidity
// ledger: epochs, as in 0.1.3
function openEpoch() external returns (uint64 epoch);
function seal(uint64 epoch) external;

// ledger: G0
function submitG0(bytes32 profileKey, uint64 epoch, uint32 jobIndex, bytes32 outputHash)
    external returns (uint256 id);
function submitG0For(Permit calldata p, bytes calldata signature, bytes32 profileKey,
    uint64 epoch, uint32 jobIndex, bytes32 outputHash) external returns (uint256 id);

// ledger: permits
function domainSeparator() external view returns (bytes32);
function permitDigest(Permit calldata p) external view returns (bytes32);
function revokeDigest(address account, bytes32 permitDigest_) external view returns (bytes32);
function raiseNonceDigest(address account, uint64 minNonce_) external view returns (bytes32);
function checkPermit(Permit calldata p, bytes calldata signature, address sender,
    uint32 operation) external view returns (bytes32 digest);
function revokePermit(bytes32 digest) external;              // writes revoked[msg.sender][digest]
function revokePermitBySig(address account, bytes32 digest, bytes calldata signature) external;
function renounce(Permit calldata p) external;               // msg.sender must be p.delegate
function raiseMinNonce(uint64 minNonce_) external;           // writes minNonce[msg.sender]
function raiseMinNonceBySig(address account, uint64 minNonce_, bytes calldata signature) external;
function minNonce(address account) external view returns (uint64);
function isRevoked(address account, bytes32 digest) external view returns (bool);

// ledger: called by a profile's module only
function recordFact(bytes32 profileKey, FactData calldata data) external returns (bytes32 factId);
function recordG1(bytes32 profileKey, G1Facts calldata f, G1Extra calldata x, Entry calldata e)
    external returns (uint256 id, uint8 ineligible);

// ledger: views added to those of 0.1.3
function factDomain() external view returns (bytes32);
function factCount() external view returns (uint256);
function factId(address source, uint256 tokenId, uint256 submissionId) external view returns (bytes32);
function factRecorded(bytes32 factId_) external view returns (bool);
function factOf(bytes32 factId_) external view returns (Fact memory);
function contentKeyOwner(bytes32 contentKey) external view returns (uint256 receiptId);
function operatorAt(uint64 epoch, address party) external view returns (bool recorded, uint32 operator);
function subsidizedOfOperator(uint64 epoch, uint8 pool, uint32 operator) external view returns (uint128);
function operatorShare(uint64 epoch, uint8 pool, uint32 operator) external view returns (uint256);

// tender adapter
function recordFact(uint256 tokenId, uint256 submissionId) external returns (bytes32 factId);
function confirm(uint256 tokenId, uint256 submissionId)
    external returns (uint256 receiptId, uint8 ineligible);          // the tender's owner
function confirmFor(Permit calldata permit, bytes calldata signature, uint256 tokenId,
    uint256 submissionId) external returns (uint256 receiptId, uint8 ineligible);

// policy: changed or added
function registerProfile(ProfileSpec calldata spec) external returns (bytes32 id);
function bindGuard(address account, address guard) external;         // steward; from the next epoch
function guardOf(address account) external view returns (address guard, uint64 bindingVersion);
function guardBindingOf(address account)
    external view returns (GuardBinding memory inForce, bool hasPending, GuardBinding memory pending);
```

The functions that change state are these and no others (a test holds the lists). Ledger:
`openEpoch`, `seal`, `submitG0`, `submitG0For`, `recordFact`, `recordG1`, `revokePermit`,
`revokePermitBySig`, `renounce`, `raiseMinNonce`, `raiseMinNonceBySig`. Policy: those of 0.1.3
and `bindGuard`. Adapter: `recordFact`, `confirm`, `confirmFor`. None is payable, none takes a
target with call data, and the only free bytes any of them takes is a signature.

A G0 instance and its contribution id keep the dimensions of 0.1.3 - function, epoch, job
index, participant - with the participant in the place of the sender. The same instance is the
same whoever sends it: submitted directly and through a delegate it is one contribution, and
the second submission reverts. A participant still has as many instances in an epoch as the
profile has job indices.

### 11.3 Events and errors

```solidity
// ledger
event EpochOpened(uint64 indexed epoch, bytes32 seed, bytes32 seedMaterial, uint32 paramsVersion);
event ReceiptRecorded(uint256 indexed id, uint64 indexed epoch, address indexed worker,
    address origin, uint32 operator, Receipt receipt);
event ReceiptStatus(uint256 indexed id, Status status);
event EpochSealed(uint64 indexed epoch, bytes32 digest, uint64 receiptCount, uint32 paramsVersion,
    uint128 budget, uint128 measuredG0, uint128 measuredG1, uint128 subsidizedG0,
    uint128 subsidizedG1);
event ContentKeyTaken(bytes32 indexed contentKey, uint256 indexed receiptId);
event FactRecorded(bytes32 indexed factId, address indexed source, uint256 indexed tokenId,
    uint256 submissionId, Fact fact);
event PermitEnded(address indexed account, bytes32 indexed digest, uint8 path, address by);
event MinNonceRaised(address indexed account, uint64 minNonce, uint8 path, address by);

error Paused();  error WrongPool();  error JobIndexOutOfRange();  error WrongEpoch(uint64 current);
error AlreadySubmitted(uint256 receiptId);  error NotModule();  error BadExtra();
error EpochNotEnded(uint64 epoch);  error UnknownReceipt(uint256 id);  error UnknownFact(bytes32 factId);
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

// policy: added to those of 0.1.3
event GuardBound(address indexed account, address indexed guard, uint64 version, uint64 fromEpoch,
    bytes32 codeHash);
error BadGuard(address guard);

// tender adapter
event TenderFact(uint256 indexed tokenId, uint256 indexed submissionId, bytes32 factId,
    address recorder);
event TenderConfirmed(uint256 indexed tokenId, uint256 indexed submissionId, uint256 receiptId,
    uint8 ineligible, address sender, bytes32 authorization);
error NotSettled(uint256 tokenId, uint256 submissionId);
error NotDemander(address caller, address owner);
error NotOwnersPermit(address account, address owner);
```

`ProfileRegistered` and `ParamsRegistered` carry the v2 forms of their structs. The rolling
digest of an epoch is, per receipt, `keccak256(abi.encode(digest, id, contributionId, worker,
pool, verdict, ineligible, relation, gmuMeasured, gmuSubsidized, duplicateOf, operator))`, with
the types bytes32, uint256, bytes32, address, uint8, uint8, uint8, uint8, uint64, uint64,
uint256, uint32. The audit subject is that of 0.1.3 over this digest.

### 11.4 The three statements, exactly

```
EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)
Permit(address account,address delegate,uint32 scope,uint64 notBeforeEpoch,uint64 notAfterEpoch,uint64 nonce,address guard,uint64 guardBindingVersion)
Revoke(address account,bytes32 permitDigest)
RaiseNonce(address account,uint64 minNonce)
```

```
domainSeparator = keccak256(abi.encode(
    keccak256(<the EIP712Domain type string>), keccak256("PoUW Genesis Ledger"), keccak256("2"),
    uint256(chainId), address(ledger)))
structHash      = keccak256(abi.encode(keccak256(<the type string>), <the fields in order>))
digest          = keccak256(0x1901 || domainSeparator || structHash)
```

The domain separator is computed from the chain id at the time of use and is not stored. The
`permitDigest` of a `Revoke` statement is the digest of the permit, domain included. The
contract returns each digest (`permitDigest`, `revokeDigest`, `raiseNonceDigest`) and each type
hash (`PERMIT_TYPEHASH`, `REVOKE_TYPEHASH`, `RAISE_NONCE_TYPEHASH`, `EIP712_DOMAIN_TYPEHASH`).

**Fixed vectors**: `test/vectors/permit-v2.json` - six statements with their type hash, struct
hash, domain separator, digest and signature: a permit of an account without code, a permit of
a contract account with a guard binding, a revocation, a raising of the nonce, and the first
permit on another chain and against another ledger. A test computes each three ways - with the
typed-data encoder of the library, with the encodings written out by hand, and on the contract,
whose code it places at the address the vectors name - and has the signing script produce each
signature. The four agree. The vectors are signed with the private key whose value is the
number one, a public test key that guards nothing.

### 11.5 Domains and ids, exactly

| Value | Encoding |
| --- | --- |
| Ledger domain | `keccak256(abi.encode(string("finchain-pouw.genesis-ledger.v2"), uint256(chainId), address(ledger)))` |
| Fact domain | `keccak256(abi.encode(string("finchain-pouw.work-fact.v2"), uint256(chainId), address(ledger)))` |
| Fact id | `keccak256(abi.encode(bytes32 factDomain, address source, uint256 tokenId, uint256 submissionId))` |
| Epoch seed | `keccak256(abi.encode(bytes32 domain, uint64 epoch, bytes32 material))` |
| G0 instance, which is the receipt's work id | `keccak256(abi.encode(bytes32 seed, bytes32 functionId, uint32 jobIndex, address participant))` |
| G0 contribution id | `keccak256(abi.encode(bytes32 domain, uint8(0), bytes32 functionId, uint64 epoch, uint32 jobIndex, address participant))` |
| G1 contribution id | `keccak256(abi.encode(bytes32 domain, uint8(1), address source, uint256 tokenId, uint256 submissionId))` |
| G1 work id | `keccak256(abi.encode(uint256(chainId), address source, uint256 tokenId, uint256 submissionId))` |
| Configuration hash | `keccak256(abi.encode(bytes32 domain, address policy, address seedSource, uint64 genesisTime, uint64 epochDuration))` |
| Profile id | `keccak256(abi.encode(bytes32 key, uint32 version))`, with `key = keccak256(bytes(name))` |

`abi.encode` of a string with two static values is the dynamic encoding: three head words - the
offset 0x60, the chain id, the address - then the string's length and its bytes padded to a
word. `client/lib/ledger2.js` repeats every encoding of this table off chain, and the tests
compare them with the contract.

### 11.6 The guard binding, and a pause

`guardOf(account)` returns the binding in force for the current epoch: zero and zero when none
was ever bound, and the zero guard with a version above zero after an unbinding.
`guardBindingOf` returns the binding in force and, when one is scheduled for an epoch that has
not begun, that one beside it. `bindGuard` refuses an address without code other than zero.

A pause stops `submitG0`, `submitG0For`, `recordG1` and `recordFact`, and with them the
adapter's `confirm`, `confirmFor` and `recordFact`. It does not stop `revokePermit`,
`revokePermitBySig`, `renounce`, `raiseMinNonce`, `raiseMinNonceBySig`, `openEpoch` or `seal`.

### 11.7 Sizes and gas

Measured on the in-process network; a chain's data fee comes on top. Each gas figure is that of
one more receipt in an epoch that already has some. The rows were not measured on identical
state - which storage a call writes for the first time differs between them - so they compare to
within some tens of thousands of gas and no closer. Nor is a figure the same in every run:
repeated runs of the measurement differed by 12 gas in one or two of the rows, because the data
of a call - a job's output among it - is not the same bytes each time. The table is one run's.

| What | Figure |
| --- | --- |
| Code: ledger, policy, adapter, cell guard | 21,855; 12,360; 5,050; 2,424 bytes |
| `submitG0`, direct (0.1.3: 389,839) | 481,451 gas |
| `submitG0For`, an account without code | 517,414 gas |
| `submitG0For`, a contract account with an owner-only signature rule and a trivial guard | 534,981 gas |
| `confirm`, direct (0.1.3 `bridge`: 540,146) | 632,636 gas |
| `confirmFor`, an account without code | 584,603 gas |
| `recordFact` | 400,921 gas |
| `revokePermit`; `revokePermitBySig`; `raiseMinNonce` | 46,870; 55,794; 46,356 gas |

These are the builds of solc 0.8.39 (section 1). With solc 0.8.24, up to release 0.1.5, the
code was 21,674, 12,313, 5,028 and 2,384 bytes, and each gas figure lay within 2,500 of the one
above.

A v2 receipt costs about 90,000 gas more than one of 0.1.3, for the fields and the attribution
it adds. A fact stores its content, thirteen words of storage. The signature check and the
guard of a real FOGA cell are not in this table: the cell guard was measured against a mock
only. Before round R2b both are measured against the deployed cells by a read-only call, and
compared with the 200,000 and 500,000 gas the ledger gives them. The two bounds are the rule of
this implementation and are not said to suit every account (A83).

### 11.8 The freeze

The owner froze the interfaces on 2026-11-25 (A81, on Q30), as they stand at commit
`b3e07df81301ce351a0b966db0741e0a6ab091da`. The reference is all of the following together:

| What | Where | Held by |
| --- | --- | --- |
| The compiled interfaces | the five files of `client/abi/` named at the head of this section | the SHA-256 of each file |
| The types and the three interfaces, as written | `contracts/v2/TypesV2.sol` and the three files of `contracts/v2/interfaces/` | the SHA-256 of each file at the commit, and of each file without its pragma line |
| The three statements, their domain and their type hashes | 11.4 | the type strings, the domain's name and version, the four hashes |
| The tags of the two domains, and every code: pools, operations, the known scope, the reasons and their order, roles, units, paths | 11.1, 11.5 | their values |
| The fixed vectors | `test/vectors/permit-v2.json` | the SHA-256 of the file |

The record is `contracts/v2/interfaces.frozen.json`. `test/v2.frozen.test.js` fails when the
tree is not what the record holds, and `test/boundaries.test.js` fails when a compiled
interface is not what its source compiles to. A change of any of it is from now on a change of
that record as well: made on purpose, with a ruling to cite, and as a new version wherever a
deployment exists.

Two things are recorded apart, as the ruling asks. The **interfaces** are final. The
**deployable bytecode** has its own record, `build/v2/build-record.json` (section 1), and is
final for a deployment only when that deployment's operation package names it. The compiler
work of section 1 changed the compiler pragma of the v2 sources, and the freeze allows a frozen
source file that one line: the four frozen sources differ from the commit of the freeze in
that line alone, and the five compiled interfaces and the vectors did not change by a byte.

## 12. The one signature, and when it may be made

A contract account's permit has to be signed by a key the account accepts, and for the two cells
of round R2b that is the cell's own key. The script is built; the step is not run.

- The script, `scripts/sign-permit.js`, takes the path of the key file and every field of the
  statement as explicit arguments. The key never appears in an argument, an environment
  variable, a log, an archive, a copy or any configuration of the PoUW client. A key file that
  others can read is refused.
- It opens no network connection, creates no provider, sends no transaction and reads no nonce
  of any account. It prints the statement in words, the typed data, the digest and - when a key
  file is named - the signer's address and the signature; all of that is public material. The
  same script signs `Revoke` and `RaiseNonce` statements. A test holds that neither the script
  nor the encoding library can reach a network or reads the environment.
- With `--out` it writes the record to a new file, and to nothing that exists. A path that is
  taken - by a file, by a symbolic link, by a second name of the key file itself - is refused
  before the key file is opened, and the write creates the file or fails. Up to release 0.1.4
  the script replaced whatever the path named: with the key file's own path, or a link to it,
  the key file was overwritten with the record and the run ended as a success. The advisor's
  review found it; a test now holds every such path and the bytes of the key file.
- Without a key file it stops after the digest. That is the form in which a statement goes into
  an operation package: the readable statement and its digest, reviewed before a key is named.
- It is run on the host where the key already is, from a checkout at a named commit, with the
  script's hash recorded. Everyday PoUW operation uses the delegate key only.
- It is run only when the v2 ledger exists and has been checked against its manifest, and after
  an operation package has been reviewed: the ledger's identity, the readable typed data, the
  digest, the scope, the epochs, the nonce, the guard and its binding version. No permit is
  signed for a ledger that is not yet known.

## 13. The client: one block for everything an audit reads

Built in release 0.1.4, against the kernel of 0.1.3; none of it depends on the v2 interfaces.

- An audit, and a check of a deployment (`pouw verify`), take one block - the block at the tag,
  `finalized` unless another is named - and read everything at it: the logs up to it, and every
  view, every nested read and every piece of code at that block number, the connection's own
  reads included. A tag that is a number repeats a run at the block of an earlier record. The
  record holds the block's number, hash and time (`snapshot`), how the block was asked for
  (`snapshotTag`, `snapshotFinality`) and, apart from the block's time, the time at which the
  client observed it (`observedAt`). When the reads are done the block's hash is asked for
  again; if it is not the hash the run began with, nothing is reported.
- The epoch's close record is verified within that block: the `EpochSealed` event of the ledger,
  at most one, emitted at or after the epoch's end, its eight figures against the recomputed
  ones; and the ledger's `sealed` flag at that block against the presence of the event. An
  epoch without a close record at the block is reported as such, and is a difference only when
  the run asks for it (`--require-sealed`): a close record changes no figure.
- An endpoint that cannot serve state at that block makes the run fail with that reason (exit
  status 4). There is no fallback to a later block: a test stands in for such an endpoint and
  holds that no read is made at another block. This replaces the rule of 0.1.3 that an audit
  never asks for a state other than the latest (P27), and it has a consequence for operation:
  the endpoint must keep the state of the block it calls finalized. A node that keeps recent
  state only may not, when its finalized block lies further back than what it keeps. Exit
  status 4 says that this run could not read state at its block. It does not by itself show
  that an endpoint never serves past state: another run, or another block, is another
  observation.
- **The byte form of a record.** RFC 8785 (JSON Canonicalization Scheme): object members in the
  order of their names' UTF-16 code units, no white space, strings and numbers as ECMAScript
  serializes them, UTF-8. With one restriction, that of `production-service.md` 4.2: a number
  is an integer a double holds exactly, and every integer read from a chain that can be larger
  is a decimal string from the moment it is read. A record that holds anything else is refused,
  not rounded. An array with an empty slot is refused as well - it has no JSON form; up to
  release 0.1.4 such an array was written with fewer elements, or as text that is not JSON.
- **Two hashes** over that form, both SHA-256. `resultHash` is over what was found: the record
  without the members that describe the run (the two hashes, `observedAt`, `recordedAt`,
  `snapshotTag`, `snapshotFinality`, `endpointHost`, `client`). Two runs that read the same
  block and agree have the same result hash. `reportHash` is over the whole record, its own
  member left out: two runs have two report hashes, because each observed its block at its own
  time. `scripts/report-hash.py` computes both again from a record's file, in another language
  and with the standard library only. It refuses a file in which an object names a member
  twice, at any depth: a parser that keeps the last of the two would hash a record that is not
  the one in the file. `tableHash` stays as it is, beside them.
- For G1 receipts the audit reports the authority at settlement as section 10 says.
- `pouw work` and `pouw bridge` look for the receipt by its contribution id before they send: a
  submission whose answer was lost, or a process that stopped after sending, is found after a
  restart and nothing is sent again (test L33). The lookup of a confirmation is for the
  tender's owner; anybody else is refused by the adapter as before.
- Records of this client carry schema `finchain-pouw.audit/2` and
  `finchain-pouw.deployment-check/2`. The records of round R2a are of schema 1 and stay as made.

## 14. The test matrix, as run

Run on 2026-11-25 on the in-process network (Node 22.23.5, Hardhat 2.29.2; the kernel compiled
by solc 0.8.24, ledger v2 by solc 0.8.39). With release 0.1.6, 143 tests pass and none fails:
the 83 of the kernel of 0.1.3, of which three were adapted to the client's new behaviour; the
48 that release 0.1.4 added; six that release 0.1.5 added; and six that release 0.1.6 adds, on
the compile boundary and the builds. The twelve of the last two releases have no row below.
Every row below has at least one test that carries its id in its title; the last column names
the file. A row is "passed" when every test that carries its id passed. The limits of what a
pass covers follow the table. From release 0.1.6 on, every row is run on the builds of the v2
compiler - the builds a deployment would be made from - and no longer on those of solc 0.8.24.

The advisor ran the 131 tests of release 0.1.4 and the rehearsal again on its own, under
another version of Node, and found all 35 ids in its output (`decisions.md` 15.2). That run is
the advisor's evidence; it is not repeated here as this repository's.

The ids L1 to L35 are this document's. `acceptance-matrix.md` has a row L1 of its own, the
linked chain of business evidence; where both could be meant, the document is named.

| Id | Case | Expected | Result |
| --- | --- | --- | --- |
| L1 | Permit used on another chain id, or against another ledger | refused: the digest differs, the signature does not verify | passed (`v2.permit`) |
| L2 | Permit of account X presented for account Y of the same owner | refused: the account is inside the signed message | passed (`v2.permit`) |
| L3 | The caller is not the permit's delegate; a caller tries to state another sender to the adapter | refused; no parameter exists for it | passed (`v2.permit`) |
| L4 | Operation outside the scope; a permit with an unknown scope bit | refused | passed (`v2.permit`) |
| L5 | Before `notBeforeEpoch`; after `notAfterEpoch` | refused | passed (`v2.permit`) |
| L6 | Nonce below the account's minimum after it was raised, directly and by statement | refused; the minimum cannot be lowered | passed (`v2.permit`) |
| L7 | Revoked by the account, by a `Revoke` statement, renounced by the delegate; then presented again | refused each time; a replayed statement changes nothing | passed (`v2.permit`) |
| L8 | Account X tries to revoke a permit of account Y; a key that is not the delegate renounces; a `Permit` signature offered as a `Revoke` | no effect on Y; refused; refused | passed (`v2.permit`) |
| L9 | Rotation, owner only: an account whose rule accepts its owner and nobody else | the former owner's permit is refused at the next use; the new owner's works | passed (`v2.guard`) |
| L10 | Rotation with the former owner left as a signing operator | the old permit still verifies; raising the nonce ends it and the old key can sign a new one that is accepted; with the signing right taken away in the account, that permit and every later one of the old key are refused; in the configuration with operator signing off the old permit ends at once | passed (`v2.guard`, two tests) |
| L11 | Signature by a key the account does not accept; a personal-message signature over the digest; the other form of a valid signature | refused | passed (`v2.permit`) |
| L12 | `isValidSignature` reverts, returns short data, never returns, returns a stray bit or a hundred thousand bytes | refused; the check is given 200,000 gas whatever the transaction brought | passed (`v2.permit`) |
| L13 | Guard says no; guard fails; no guard bound; `permit.guard` or its version differs from the binding | refused in each case; the guard is given 500,000 gas | passed (`v2.guard`, two tests) |
| L14 | Guard rebound from A to B and back to A; a binding replaced before its epoch; a pending binding | a permit signed for the first binding is refused under the later one; replaced numbers are never used; the binding in force stays until the epoch | passed (`v2.guard`) |
| L15 | Account suspended: `Revoke` and `RaiseNonce` statements relayed by a third party; the delegate renounces; a direct revocation through the account | the signed paths and the renouncing succeed; the direct call is refused by the account's gate and passes once the account's owner has allowed that call under a suspension; an operator's statement is refused while suspended | passed (`v2.guard`) |
| L16 | Account without code delegates with the zero guard and version zero; with anything else | accepted; refused | passed (`v2.permit`) |
| L17 | A delegate tries anything but the two functions; tries to sign a permit for the account | no function exists; the signature does not verify | passed (`v2.permit`) |
| L18 | G0 through a delegate | the receipt names the account as worker, the delegate as sender, the digest as authorization; the instance is the account's | passed (`v2.ledger`) |
| L19 | G0 twice for one instance, once direct and once delegated; two job indices of one participant | the second reverts `AlreadySubmitted`; two receipts | passed (`v2.ledger`) |
| L20 | Confirmation through a delegate of the tender's owner; `permit.account` is not the tender's owner | the receipt names the owner as demander; refused | passed (`v2.ledger`) |
| L21 | One operator, several addresses, in one pool, with `cOp <= c` | the allocations sum to no more than the operator cap | passed (`v2.allocation`) |
| L22 | `cOp` above `c`: one address against two of one operator with the same GMU | the two take more, within the operator cap | passed (`v2.allocation`) |
| L23 | Totals that do not divide; a pool, an operator or an address with zero GMU | every term rounds down, the remainder is allocated to nobody; zero, without a division by zero | passed (`v2.allocation`) |
| L24 | Operator declaration changed for a later epoch; `operatorAt` for an address without a receipt | the past allocation is unchanged; not recorded, which is not "undeclared" | passed (`v2.allocation`) |
| L25 | Worker without a declared operator; demander without one; several reasons at once | measured, reason 12 or 13, no subsidized GMU; the reason is the first in the order of section 7 | passed (`v2.ledger`, two tests) |
| L26 | A third party records a fact first; the owner then confirms; a fact recorded twice; a confirmation repeated | the receipt is recorded as if no fact existed; each repeat returns what exists | passed (`v2.ledger`) |
| L27 | Two sources with one content key, also under two profiles and in two epochs | the first measured receipt takes the key; each later one has reason 14 and `duplicateOf` | passed (`v2.ledger`) |
| L28 | The first rightful receipt of a key is measured and not subsidized | it takes the key all the same | passed (`v2.ledger`) |
| L29 | A delivery that is no task unit, a part of one, a wrong demander, a fact: then the rightful confirmation | none of them took the key; reason 15 has `duplicateOf` zero; the rightful one counts | passed (`v2.ledger`) |
| L30 | Confirmation in a later epoch than the delivery | counts in the epoch of confirmation; earlier epochs do not move | passed (`v2.ledger`) |
| L31 | Settle, hand on the right to judge, then confirm | recorded as the ledger reads it; the audit reports the difference | passed (`v2.ledger` for the ledger; `audit` for the audit) |
| L32 | A verifier hands the authority on inside its own verification | the audit records `evidence-insufficient` for that receipt and concludes nothing about a party | passed (`snapshot`) |
| L33 | Client: a response lost after sending; the process restarted | the client finds the receipt by its contribution id and does not send again | passed (`snapshot`) |
| L34 | Audit at a finalized block without any participant key; an endpoint without state at that block | recomputes and agrees, every read at that block; fails with a stated reason and does not read another block | passed (`snapshot`, two tests) |
| L35 | The hashes of one record computed twice, by a second implementation and by a second program from the stated serialization | equal; the field itself is not part of what is hashed | passed (`snapshot`, two tests) |

What a pass covers, and what it does not:

- **The accounts are generic fixtures.** L9 to L15 run against two contract accounts written
  for the tests - one that accepts its owner only, one with an operator slot whose signing can
  be enabled and a suspension - and against guards a test can set. They are no product's
  account. The published FOGA account was checked apart, with its released bytecode on a local
  network (30 records: 29 checks and one gas figure); those are review records kept outside
  this repository, they are not these tests, and neither stands in for the other. No transfer
  of ownership was made on a deployed cell.
- **The cell guard runs against a mock** of the account's views (two tests, without a row of
  their own). Its behaviour and its gas against a deployed cell are not measured.
- **L27 to L29 test the ledger's rules for task units**, given what a module states. The module
  that shows membership and the issuer is part of the first production profile and is not
  built.
- **L31, the audit's part, and L32 to L35 run against the kernel of 0.1.3**, with the client of
  0.1.4. The client for a v2 deployment - the audit that re-decides v2 receipts, work and
  confirmation through a delegate - is not built; the v2 allocation tests replay a v2 epoch
  from its log and agree with the ledger on every figure, which is the arithmetic of that audit
  and not the audit.
- **L35's second program** is run by the test when the machine has `python3`; where it has not,
  that part is skipped and the second implementation inside the test stands. It ran here.
- **Six tests of release 0.1.6 carry no row.** They hold the compile boundary and the builds
  (section 1): the pragmas and the imports of both sides; the compilations as the compiler
  recorded them; the three copied interfaces against the kernel's; the four builds and the
  build record against a fresh compilation; the reading of the list of known bugs against the
  compiler in use.
- **Six tests of release 0.1.5 carry no row.** Three are regressions: every taken output path
  of the signing script is refused and the key file's bytes stay (section 12); a statement is
  verified at each submission, and a repeat is refused once the account no longer accepts the
  signature (section 6); an array with an empty slot is refused (section 13). Three hold the
  frozen interfaces (11.8). The refusal of a member named twice is part of L35's second test.
- **The tests were checked against changes that should break them.** Each of 38 changes that
  break one rule of the contracts, of the client or of a tool - a missing revocation check, a
  guard compared by address only, an allocation that reads the present declaration, a read at
  the latest block, an output written over a file that exists, a statement not verified when
  it is sent again, and so on - made at least one test fail. The first run of that check, with
  release 0.1.4, found one test that did not notice a rule being broken: the bound on the gas
  given to a signature check. The test now measures the gas a refused transaction used. The
  list and its results are review records outside this repository. The advisor read them and
  did not run them: they are this repository's evidence only.

## 15. What changed

Revision 2 against revision 1 is recorded in `decisions.md` 14.2. Revision 5 against revision 4
applies A82 and changes no rule of the ledger (`decisions.md` 16):

| Point | Revision 4 | Revision 5 |
| --- | --- | --- |
| Compiler of v2 | solc 0.8.24, the kernel's, in one compilation with the kernel | solc 0.8.39 behind a boundary of its own; the kernel's compiler, settings and six builds untouched |
| What v2 imports | three interfaces of the kernel, by file | nothing outside `contracts/v2`; its own copies of those three interfaces, held to the kernel's ABI |
| Fixtures that import v2 | `contracts/testing/` | `contracts/v2/testing/` |
| Builds of v2 | none | `build/v2/`, with a build record and a reading of the compiler's known bugs |
| Size of the ledger | 21,674 bytes (0.8.24, IR pipeline) | 21,855 bytes (0.8.39, IR pipeline); through the legacy pipeline of 0.8.39 it is over the limit |
| Compiled interfaces, types, codes, vectors | frozen | unchanged, byte for byte; the frozen sources differ in their pragma line only |
| The tests | on the builds of solc 0.8.24 | on the builds of solc 0.8.39 |

Revision 4 against revision 3, on the owner's rulings of 2026-11-25 on the review of the
implementation (`decisions.md` 15):

| Point | Revision 3 | Revision 4 |
| --- | --- | --- |
| Interfaces | proposed for freezing | frozen, with a record and a test that holds it; the deployable bytecode recorded apart, and not final (11.8) |
| Build | the IR pipeline, proposed | the IR pipeline, ruled; the build with solc 0.8.24 is evidence of the local tests and no deployment build; a compile boundary of its own for v2, with a compiler in which the known optimizer bug is fixed (section 1) |
| When a statement counts | "to be treated as in force from the moment it is signed" | it can be submitted once it is signed; the ledger changes when the transaction succeeds (section 3) |
| A repeat | "doing any of them a second time changes nothing" | a statement is verified each time it is submitted; a repeat changes nothing after that check has passed, and is refused when the account no longer accepts the signature (section 6) |
| Work without a confirmation | "has a public fact" | can have one: a fact exists when somebody recorded it (section 9) |
| The signing script's `--out` | replaced what the path named, the key file included | creates a new file or fails; a taken path is refused before the key file is opened (section 12) |
| The canonical form | an array with an empty slot lost elements, or gave text that is not JSON | refused (section 13) |
| The second program for the hashes | kept the last of two members of one name | refuses the file (section 13) |
| Exit status 4 | "the endpoint cannot serve state at that block" | this run could not read state at its block; it shows nothing lasting about an endpoint (section 13) |
| The two gas bounds | stated | the rule of this implementation; measured against the deployed cells before round R2b, and not said to suit every account (11.7) |

Revision 3 against revision 2:

| Point | Revision 2 | Revision 3 |
| --- | --- | --- |
| Status | design draft | implemented and tested locally; section 14 has results |
| Rotation of keys | "raise the minimum nonce, confirm, sign a new permit" | ending permits is told from taking a key's signing right away; raising the nonce does not retire a key; the procedure takes the signing right away first (section 6; L10, both controls) |
| Suspended accounts | "a suspended FOGA cell cannot send a direct call through `execute` at all" | a direct call depends on the account's own gate, which can refuse it and can let it through; the signed paths depend on the account accepting the signature in that state (section 5; L15) |
| Interfaces | an outline | every struct, function, event and error; the domains and ids as encodings; the three statements with fixed vectors; the guard's pending binding (section 11) |
| Task units | "the checks that the delivery is a task unit" | who does what: the profile version commits, the module shows, the ledger applies; `unit` in the receipt; `countsUnits` and two commitments in the profile (section 7) |
| `Receipt.ref` | not said | replaced by `workId` (section 7) |
| Guard binding | a version that only rises | also: a number is used once when a binding is replaced before its epoch; a pending binding does not replace the one in force; the code hash is recorded (sections 5, 11.6) |
| A pause | "nothing is recorded" | which entries it stops and which it leaves open (section 11.6) |
| Report hash | "keys in code-point order" | RFC 8785: UTF-16 code units; the integer restriction; two hashes, of the result and of the report (section 13; L35) |
| Authority at settlement | `evidence-insufficient` and no party | two records kept apart - the registered address and the state of the evidence; the match is by source, token and acceptance transaction (section 10; L32) |
| Signature checks | "a fixed gas limit" | 200,000 and 500,000 gas; one word of the answer is read; one accepted form of an ECDSA signature; an account with a code delegation is a contract account (section 4) |
| Build | not said | the ledger is compiled through the IR pipeline for its size (section 1) |

## 16. What is built, what is not, and what this design does not do

Built and tested locally: the three contracts of v2 and their types; the guard interface and
the optional guard for FOGA cells; the signing script; the fixed vectors; the encodings and the
allocation off chain (`client/lib/ledger2.js`, `client/lib/permit.js`); the record of the
frozen interfaces with its test; the compile boundary of v2, its builds and their record
(section 1); and, in the client from 0.1.4 on against the kernel of 0.1.3,
the audit at one block, the canonical records with their two hashes, the authority evidence
and the lookup before sending.

Not built, and needed before round R2b:

| What | Why it is not in this version |
| --- | --- |
| The deployment of v2 from the builds of `build/v2`, with a manifest that has `supersedes` and the guards' code hashes | the next item. One thing is open in it: a v2 deployment also needs a G0 function and a seed source, which are contracts of the kernel and compiled by its compiler (`decisions.md` Q33) |
| The client for a v2 deployment: `status`, `verify`, `work` and `bridge` through a delegate, and the audit that re-decides v2 receipts | the interfaces are frozen; it is part of the next delivery |
| The run record of the client, with the label `delegated-by-owner-permit` | with the v2 client |
| The module of the first production profile, which shows membership of the committed set and the named demander | part of the first production increment |
| The configuration of round R2b, its runbook and the operation package of the one signature | a round's own package, reviewed as such |
| A measurement of the signature check and of the cell guard against the deployed cells | a read-only step of that package |

It does not show that an agent's software did the work, that a model ran, or that demand is
independent. It does not bind the authority at settlement, and its audit does not establish who
carried out a verification. It does not identify undeclared related addresses or remove every
advantage of several addresses. It does not issue, hold or move anything of value. It names no
parameter of round R2b, deploys nothing and signs nothing. It requires no change and no release
of FOGA, and it changes nothing of the chain.
