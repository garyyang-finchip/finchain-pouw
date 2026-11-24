# The First Production Service: Plan

Design revision v0.1.7, after the reviews of v0.1.4, v0.1.5 and v0.1.6 (`decisions.md` A55-A69).
This is the executor's plan for the first production profile: deliverable B of the alignment of
2026-11-24 (A54), carrying out `genesis-mining-mvp.md` 14.2 to 14.5 and `architecture.md` 5.3, 6.2
and 6.3. Those sections state what a production profile has to decide; this document proposes the
decisions for the first one.

Nothing here is built, and nothing here changes round R2. The review of v0.1.4 required
corrections before this plan can serve as an implementation specification: to the measurement
(section 5), to deduplication (section 7), to the scope of the first increment (sections 10 and
11), to what is said of an agent that buys (section 8), and to the way ERC-8506 is cited (section
4.2). The review of v0.1.5 asked that two things be written exactly: what a content key is made
of, and which confirmation takes the one counting of a task unit (sections 4.1 and 7). They are
applied here. On the questions this plan raises (Q17 to Q21, Q25, Q27, Q29) the advisor's
recommendations are recorded with the questions and the owner's adoption of them is pending
(`decisions.md` 12, and A66): where the text says that the review recommends something, it says
no more than that. What this repository adds on its own judgment is marked as a proposal
(P54, P55, P58, P59). Where this plan and `genesis-mining-mvp.md` 14 differ, that section governs.
Where the text says "is", read "is proposed to be".

The milestone it is written for (A54): a buyer makes a real request for intelligence service; a
supply node completes a standardized delivery; a FOGA cell uses or organizes the service; an
independent verifier can re-check the volume of service and the acceptance; the payment completes
correctly; a GMU record that can be recomputed is formed; and the actual cost of production is
reported.

## 1. What the first increment produces

The first production commodity is the generation of model tokens, sold as an inference service
under a stated specification (A40). Three records are kept apart and then linked:

| Record | In the first profile | Where it is kept |
| --- | --- | --- |
| Token usage | counts per category under the profile's tokenizer and measurement version (section 5) | the evidence envelope of the delivery |
| Qualified intelligent delivery | a delivery that passed the profile's published checks and was accepted by the route the profile names (section 2) | the tender's settlement; the evaluator's findings in the envelope |
| Economic value | the bounty the customer paid for the delivery; the cost the worker bore for the model service | the tender's vault and its withdrawal; the worker's operating report (`supply-and-payment.md`) |

A fourth record is derived from these and is none of them: the contribution, in GMU, on the PoUW
ledger (section 7).

Four observations are never merged (`genesis-mining-mvp.md` 14.4): quota that was purchased, usage
that was measured, a delivery that was accepted, and money that was settled. Purchased quota is
capacity to use a service. It is not output and it is not a delivery. More tokens are not more
useful work and not a larger reward.

## 2. The first profile: one bounded task class

Working name `g1.inference` (not a name the kernel has registered). The task class, which the
review recommends as the first controlled profile (Q17): **structured extraction**. A request is a
text document together with the profile's published instruction and output schema; a delivery is
one JSON object that follows the schema and holds the fields extracted from the document.

Why this class first:

- its acceptance can be explained and repeated: the checks below are deterministic programs;
- the output is bounded by the schema, so a longer answer is not a larger delivery;
- it has plain use - documents into records - and plain fixtures can be made for it;
- it needs no tool use, no multi-step agent and no judgment of style.

The published checks. Each keeps its own boundary of what it verifies:

| Check | What it decides | Who can repeat it | What it leaves as a trust assumption |
| --- | --- | --- | --- |
| C1 Format | the delivery is one JSON document in canonical form, valid against the published schema, within the output limit | anyone who has the output | nothing |
| C2 Grounding | every value of a field typed as a span occurs in the input document after the published normalization; numbers, dates and enumerations parse to their published types | anyone who has the input and the output | that a grounded value is the right one of those present |
| C3 Reference (controlled fixtures only) | the delivery equals the fixture's reference answer, which was committed with the fixture set before the task was issued, field by field after normalization | anyone, once the reference is revealed | that the reference is right: it is the demander's |

A syntactically valid answer is not thereby a correct extraction: C1 alone accepts nothing. For a
controlled fixture, acceptance is C1, C2 and C3.

Version 1 has no partial acceptance: a delivery passes every check or it is rejected, with one of
the published reasons: `invalid-json`, `schema-violation`, `over-limit`, `ungrounded-value`,
`reference-mismatch`, `late`, `refused`. A model's refusal is a rejection with its own reason. A
rejected or refused request can still have cost the worker something; that cost stays in the
worker's records and earns no contribution.

**Task units.** The work of version 1 is enumerated beforehand. A task unit is one fixture of a
published fixture set: one task description - a whole document, with the instruction and the whole
schema it is to be read under (section 4.1) - and a committed reference answer. The set is
committed by one root in the profile version before the first task is issued (P55): the root
commits, for every fixture, to its task description and to its reference. The profile version
also names the demanders that issue its fixtures; in the first increment that is the designated
test demander. A request whose task is not a member of the set, or that no such demander issued,
is not a task of the profile. A controlled fixture demonstrates the procedure; it is not evidence
of external demand, and every record of the first increment says so.

A customer's own task - a document nobody made for a test, with no reference - is not part of
version 1 and not part of the first increment. It needs a later version of the profile, with an
acceptance of its own (C1 and C2 by the evaluator, then the customer's judgment, reported as
exactly that), its own rule for evidence that is not public, and its own scope of deduplication
(section 7).

## 3. The pinned choices

The table of `genesis-mining-mvp.md` 14.2, with what is proposed for the first profile.

| Specification | Proposed for the first profile |
| --- | --- |
| Service | the task class of section 2. Input: UTF-8 text up to the context limit. Output: canonical JSON under the published schema, up to the output limit. Completion: a fulfillment submitted inside the tender's submission window |
| Model and tokenizer | one model at a named revision whose weights are published and whose tokenizer is public (Q19). The model, the tokenizer, the chat template and the serving configuration are each pinned by version, and the serving configuration actually used is recorded with each delivery. A hosted revision that cannot be inspected is labelled opaque |
| Execution | the decoding settings the profile fixes and a cap on generated tokens; the timeout is the tender's submission window; a worker's own retries belong to one request. Exact replay is not expected: the evaluation procedure of section 2 decides |
| Quality | section 2 |
| Service level | per request: delivery inside the submission window. Version 1 makes no commitment of availability: a tender is one request, not a standing service |
| Measurement | section 5 |
| Verification | evidence: the envelope, with the input, the output and the evaluator's findings. Authority: the tender's acceptance authority - for a fixture, a verifier contract that settles only a delivery matching the committed reference, or a designated evaluator. Independence: none is claimed in a controlled procurement. Dispute and finality: ERC-8414's own (A23) |
| Finance | the model service is funded by the worker's Holder and, in the first increment, bought by hand. The delivery is bought by the tender's demander with a bounty in the chain's native asset, held in the tender's vault. Fees: gas. Refunds: by the vault's rules. Settlement evidence: the acceptance, the credit and its withdrawal |
| Evidence | section 4 |

Why a model with published weights and a public tokenizer, for the first specification: a hosted
supplier and a supplier that runs the model itself can both implement the same specification,
which the mixed-source check needs; and whoever is given the content can count the input and the
canonical result again. The model is chosen at the build round from what can be bought then. What
the choice has to satisfy: weights and tokenizer published under a licence that allows serving
others; offered by more than one external service that an ordinary account can buy from; small
enough to be run on one modest machine later; an identity that names a revision. A specification
for the provider a FOGA node calls today can be registered beside the first, labelled opaque, with
its usage as attested by the provider.

Two things about the acceptance of a fixture are left to the build round and are not assumed
here. The reference World has a verifier of the hashlock kind, which settled the business loop of
2026-11-13; whether its interface fits a committed reference answer of this profile is to be
confirmed. And a delivery that reveals the answer inside a transaction can be copied by whoever
sees that transaction first: the route has to bind an answer to the worker that produced it, for
example through a commitment that names the worker.

## 4. The evidence envelope

One envelope per delivery (`genesis-mining-mvp.md` 14.3): a JSON document in canonical form,
identified by its hash, kept off chain, with its hash committed on chain. What the first profile
puts in each group:

| Field group | In the first profile |
| --- | --- |
| Domain and versions | the envelope's schema version; chain id; the PoUW deployment; the profile and its version; the evaluator's version; the measurement-rule version |
| Work identity | the request id, the work id and the content key (below); the tender and the submission; the parent work, if any; the role (`intelligence-producer`); worker, demander and their declared operators |
| Service specification | the identifiers of the specification's records; model, tokenizer and template revisions; the serving configuration as the worker states it; the task description, whose hash is the content key; the requested limits |
| Supply provenance | external service or operated model; the provider or the endpoint class - never a credential; whether each fact is declared or verified |
| Usage | the records of section 5, each with its counter and where the count came from |
| Delivery | the delivered text as returned, and its hash; the canonical result, and its hash; the worker's outcome - completed, refused, timed out, or failed at the provider; the times of request and delivery |
| Verification | the evaluator and its version; each check with its result; the verdict - accepted, or rejected with its published reason; the evidence class of each claim (section 6) and its limits; the settlement path; no dispute reference in version 1 |
| Funding and procurement | who funded the model service and by which route; the purchase the usage was drawn from, by reference |
| Payment and costs | the bounty: asset, raw amount, payer, recipient, state; the cost of the model service for this delivery, in the provider's currency, with its basis; gas |
| Availability and integrity | the encoding and the hash; where the content is kept and until when; who may fetch it; the worker's signature; a status for evidence that is missing |

Payment credentials, private keys and API secrets never enter an envelope or a manifest.

### 4.1 The three identities of a piece of work, and the task description

The review of v0.1.4 required that the identity of a request be kept apart from the identity of
its order on chain (A57). The review of v0.1.5 asked that the content key be defined on stated
content: "the commitment to the input" could be read as the document alone, as the document with
its instruction and schema, or as the input in the form one model's template gives it (Q25).
Proposed (P54):

| Identity | What it names | Fixed | Derived from |
| --- | --- | --- | --- |
| Request id | one request instance of one demander | before the first attempt | the demander, the specification, the content key, and a salt the demander chose |
| Work id | one order on chain: one submission to one tender | at the submission | `keccak256(chainId, tender contract, tokenId, submissionId)` |
| Content key | the task that the profile counts as one contribution | by the task | `keccak256` of the canonical task description |

The task description is a record of this profile, in canonical form. It says what is asked, and
nothing about who answers or with what:

| Member | Content |
| --- | --- |
| `taskClass` | the task class and its version: structured extraction, version 1 |
| `instruction` | the hash of the published instruction, as text addressed to any model |
| `schema` | the hash of the output schema, in canonical form |
| `document` | the hash of the document after the published text normalization |

Two tasks are the same task exactly when their task descriptions are equal. The same document
under another instruction or another schema is another task, with another key. Nothing else
enters the key. The model, its chat template, its tokenizer and the limits belong to the
specification and to the records of execution and of measurement; the worker, the demander, the
tender, the request and the epoch belong to the order. The same task done by another worker, with
another model or under another tender therefore keeps its key.

A request keeps its request id through a retry, a second submission and a second tender: the
tender's task document carries it and so does the envelope of every attempt. Recovery and the
reconciliation of payments go by the request id; several work ids can share one. The work id is
what the receipt and every payment record of one delivery carry. The content key is what
deduplication reads.

How envelope, tender and receipt correspond:

- the tender's task binding cites the specification, the task description and the request id; the
  submission's result hash commits to the delivered output;
- the worker states the envelope's hash for its submission; the demander's confirmation of the
  settled submission names the same hash; the receipt stores it. A count therefore enters the
  ledger's record only as both sides stated it, and the recount of section 6 computes it again
  from the content;
- a parent work is named in the envelope and in the receipt. Version 1 has no partial delivery.

### 4.2 Record formats: a pinned revision of ERC-8506

The owner's ERC-8506 (AI Inference Token Onchain) defines records for these things, and the
review agreed to their reuse on one condition: the source, the version and the mapping are
stated (A61). The first increment has no ERC-8506 contract and no runtime dependency on it. It has
a dependency on the specification, which is this pin (P59):

| Item | Pinned |
| --- | --- |
| Repository, commit | `garyyang-finchip/ai-inference-token`, `2b62b6171a504dc504cbb89a1b2b5d13520e1595` (2026-11-23; repository version 0.3.0) |
| Specification | `ERCS/erc-8506.md`, status Draft; SHA-256 `6a57632516e8c156c2ee767b09bbf4c3e99c17a528f019d105a25d09e7b2cc91` |
| Sections used | 3.1 (canonical form and identifiers), 3.2 (Unit), 3.3 (Grade), 3.4 (Source, for two vocabularies), 3.6 (Receipt, for two members) |
| `assets/erc-8506/schemas/unit.schema.json` | SHA-256 `0f789b3537f9d82d6177e0dcc27809095d47f669c10b894be900767fa850ebf5` |
| `assets/erc-8506/schemas/grade.schema.json` | SHA-256 `3a4f6938adb13711d89a381fcde472509e25513e0bf6003d7f209c7ea73491a7` |
| `assets/erc-8506/schemas/source.schema.json` | SHA-256 `7125ca8c9aea85e635cfe7c043d5707f9884688f4062f06e9cf0aff0240cd3d7` |
| `assets/erc-8506/schemas/receipt.schema.json` | SHA-256 `687786ea7fc15413336da9164152c2a8313de75e30a688f0701a42cbbe50c79b` |

The files are cited by the paths they have at that commit. The specification's own links to its
schemas name another directory, `assets/eip-8506/`, which the commit does not have; that is for
the standard's repository to correct and does not touch the pin.

The standard is a draft and may change. A later revision is adopted by a new pin, in a new
version of the specification of this profile, and never silently. When the increment is built the
four schema files are copied here byte for byte with a notice, as the ERC-8414 contracts are
(P31). Nothing in ERC-8506 and nothing in FOGA has to change.

The dependency is a light one and is kept so (A67). The pin names the owner's repository and a
commit; it does not name the EIP repository, and nothing here depends on the standard's status or
on its being merged there. No build, test or run of this repository fetches the standard: the
schema files it uses are the copies. If the standard changes, is renumbered or stays a draft, the
pinned copies serve as they are; and the envelope, the task description and every rule of this
plan are this protocol's own.

The mapping. Two records are conformant records of the standard; from two others only a
vocabulary or the format of a member is taken, and the plan does not call the result one of the
standard's records:

| In this plan | ERC-8506, at the pin | Members | What is claimed |
| --- | --- | --- | --- |
| The categories of generation usage and their counter (section 5) | a Unit record | `quantityKind` `inference-usage`; `modality` `text`; `basis`; `denomination`; `components`: `input` for `input_tokens`, `cache_read` for `cached_input_tokens`, `output` for `generated_tokens`; `relations`: `input` `includes` `cache_read`, and `output` is `additive` to both; `boundary`; `precision`; `rounding`; `counterRef` with the name, the version and the digest of the tokenizer | to be a conformant Unit: validated against the pinned schema when the record is written |
| The length of a canonical result (`canonical_delivery_tokens`) | a second Unit record | `quantityKind`: a declared kind of its own, because the quantity is a length of what was delivered and not usage; one component; `basis` and `boundary` say that the canonical form of the accepted result is counted; `counterRef` | to be a conformant Unit, validated likewise. No relation to the first is declared: the standard states a relation between two Units only through a Method, and none is claimed |
| The model at its revision, its configuration, the requirements, and which evidence each claim has | a Grade record | `unit` (the first Unit), `ordering` `none`, `executionObject` (`kind`, `identity`, `config`), `requirements` (each with `scope` and `compensable`), `obligations`, `verificationPolicy` (`origin`, `metering`, `execution`, `quality`, `deliverySettlement`) | to be a conformant Grade, validated likewise |
| Supply provenance in the envelope | the Source record's vocabulary | the values of an issuance basis's `origin` (`own-capacity`, `transferable-upstream-quota` and the others) and of its `authorization`; `fulfillers` | the vocabulary only. Not a Source record: a Source states grounds on which units are issued, and the first increment issues none |
| Usage, outcome and verification in the envelope | two members of the Receipt record | `claim` (`by`, `usage` in the order of the Unit's components, `outcome`, `executionObject`) and the entries of `evidence` (`proposition`, `mechanism`, `reliesOn`, `doesNotShow`, `ref`) | the format of these two members. Not a Receipt record: a Receipt's `request`, `acceptance` and `effect` describe a request on a home ledger, which the first increment does not have |
| Canonical form and identifiers of the Units and the Grade | section 3.1 | RFC 8785 with the integer restriction; `keccak256` of the canonical bytes; the members `aito` and `kind`; CAIP-10 accounts | followed exactly. The envelope is a record of this protocol with a schema of its own, in the same canonical form |

What is established now, and what is not (Q29). The source of the pin has been verified twice, by
this repository and by the review of v0.1.5, each fetching the files itself: the specification
and the four schema files at the commit carry the hashes above. The mapping is a design that the
specification permits. No Unit or Grade record of this profile exists yet. They are written when
the model is chosen, they are validated against the pinned schemas then, and nothing is called
valid before that.

The entitlement ledger of ERC-8506 comes into the plan later, for supply that is metered and
prepaid (`supply-and-payment.md` 9). A conformant Source and a conformant Receipt come with it.

### 4.3 Availability

A hash proves a commitment. It does not make the evidence available or true. Three cases are told
apart, and each report says which applies:

| Availability | Who can obtain the content | What a party with no role can re-check |
| --- | --- | --- |
| Public | anyone, at a stated place, for a stated period | everything the checks and the counts need |
| Controlled access | an auditor the parties admit, under their conditions | the same, by that auditor only; a public auditor cannot check it and the report says so |
| Commitment only | the two parties | that the delivery settled and what was stated about it. Not that a count or a check is right |

In the first increment the fixtures are documents made for the test, and they are public (Q21).
What is published together: the task description and the content of every fixture; the versions
of the specification, the evaluator, the counter, the template and the canonicalization rule; the
commitments - the root of the fixture set and the commitment to each reference; the procedure by
which a third party repeats the checks and the counts; and a statement of where the content is
kept and until when. When required evidence cannot be retrieved, the delivery is marked
unauditable under the profile and its verified qualification is withheld
(`genesis-mining-mvp.md` 14.8).

## 5. Measurement

What is recorded for a delivery, as the review corrected it (A56). The count of a canonical
result is a standardized length of what was delivered. It is not declared a part of the tokens
that were generated: making a result canonical can change white space, the order of keys and the
escaping, and with them the boundaries between tokens.

| Record | What it is | Counter and origin |
| --- | --- | --- |
| `input_tokens` | the count of the request as the model receives it: instruction, schema and document, template applied | the specification's public counter, from the committed task under the specification's template: can be counted again |
| `cached_input_tokens` | the part of the input a provider served from a cache. Included in `input_tokens`; never added to it | the provider's report |
| `generated_tokens` | the raw usage of generation for the request, reasoning included | the provider's report, or the count of the party that runs the model |
| The delivered text | what the worker returned, as returned, and its hash | - |
| The canonical result | the canonical form of the accepted result, and its hash | the canonicalization rule, by name and version |
| `canonical_delivery_tokens` | the count of the canonical result | the specification's public counter, by name and revision: can be counted again |
| Provider-billed categories | whatever the provider's bill names, as the provider defines them | the provider's bill; used for cost only |

A relation between `canonical_delivery_tokens` and `generated_tokens` is stated for a delivery
only where the original stream of tokens and the mapping onto the result were kept.

Qualified service units, measurement rule version 1, in integers with fixed-point weights:

```
weightScale = 1,000,000

units = 0     unless the delivery was accepted under section 2 and counts under section 7

units = floor( ( min(input_tokens, inputLimit) * inputWeight
               + min(canonical_delivery_tokens, outputLimit) * outputWeight ) / weightScale )
```

Every quantity is a non-negative integer. There is one division, at the end, rounded down. The
measurement version fixes `weightScale`, `inputWeight`, `outputWeight`, `inputLimit`,
`outputLimit`, the counter and its revision, the chat template, the canonicalization rule and the
rounding; a change of any of them is another measurement version, and a delivery keeps the version
it was measured under.

What the rule is built to prevent (`genesis-mining-mvp.md` 14.4; `architecture.md` 6.3): extra
output cannot raise the count, because what is counted is the canonical accepted result and the
schema bounds it; a repeated request cannot (section 7); a padded input is bounded by
`inputLimit` and, in version 1, cannot occur at all, because the inputs are the fixtures. A
request that failed may have cost the worker something and counts nothing.

**The reward rule of the first increment** (Q20). A fixed GMU for each task unit that is
delivered, accepted and counted - the kernel's own formula, with a `baseGmu` of the profile -
while the qualified units are recorded in the envelope, stated by both sides and recomputed by
the recount. The units are for observation and recomputation. They are not a completed SIG
calibration and are not presented as one: counts under two models have no exchange rate, and the
units of this specification are not the units of another. A GMU rule that is proportional to
units is a later version of the profile, with its own specification.

An example with *illustrative* figures (`decisions.md`, last section): `inputWeight` 250,000 and
`outputWeight` 1,000,000 - a quarter and one - with limits of 8,000 and 1,000. A fixture with an
input of 6,000 tokens is delivered, 1,150 tokens having been generated, and its canonical result
counts 310:

| Figure | Value |
| --- | --- |
| Usage | `input_tokens` 6,000; `generated_tokens` 1,150; `canonical_delivery_tokens` 310 |
| Qualified service units | floor((6,000 x 250,000 + 310 x 1,000,000) / 1,000,000) = 1,810 |
| The same fixture answered with 4,000 generated tokens and the same accepted result | 1,810 |
| The same fixture delivered again, under another tender | 0, and no GMU (section 7) |
| GMU measured for the first delivery, with a `baseGmu` of 50 for the profile | 50 |

## 6. Verification classes in the first profile

The four classes of `genesis-mining-mvp.md` 14.5 say which claim a piece of evidence supports.
They are not a ranking and not a schedule of rewards. For the first profile:

| Claim | Class in the first increment | Evidence | What it does not establish |
| --- | --- | --- | --- |
| The usage the provider billed | provider-attested where the provider gives an authenticated record, otherwise declared | the provider's usage record, by reference | that the named model ran; that the worker operates hardware; that anyone needed the result |
| `input_tokens` and `canonical_delivery_tokens` | independently evaluated | the public content, counted again with the public counter | anything about the tokens that were generated |
| The delivery passed the published checks | independently evaluated | the evaluator's findings, repeated by another party from the content | correctness beyond the checks; for a fixture, that the reference is right |
| The named model produced the output | declared, or provider-attested as to what was served | the worker's statement; the provider's record | execution: the first increment has no execution evidence |
| Demand | none claimed | the procurement is controlled and labelled | - |

In the format of section 4.2 these are evidence entries under the propositions of metering,
quality, execution and origin, each with its mechanism and with what it does not show.

Three checks stay apart, and the first is not the others:

| Check | Re-decides | From |
| --- | --- | --- |
| The audit (`pouw audit`) | the ledger: every receipt, total and allocation | the chain alone |
| The recount | a delivery: the hashes up to the commitment, the counts that can be counted again, the published checks, the membership of the fixture and whether it was counted before | the chain and the content, where the content can be obtained |
| Execution evidence | that a stated computation took place | a reviewed proof or attestation system; none in the first increment |

Verification that is paid for is a later work role with its own assignment, identity, timing and
budget (`genesis-mining-mvp.md` 14.5, 13.1). In the first increment the recount is run by a
machine that is not the operator's, for no reward, as the audit of round R2 is.

## 7. The contribution record, task units and duplicates

Proposed for the next version of the ledger (P50), which a ruling requires before round R3 (A35):

- a receipt carries, besides what it carries today, the role of the contribution, the work id,
  the parent work, the commitment to the evidence envelope and the content key;
- `g1.inference` is a profile of its own. A receipt under it needs everything a `g1.tender`
  receipt needs today (`genesis-mining-mvp.md` 7.5), unchanged - the native-asset rule included -
  and more: the tender's task is bound to the profile's specification; the envelope's hash was
  stated by the worker and confirmed by the demander; the submission settled by the route the
  profile names; and the rules below.

**The fixed GMU belongs to a complete task unit, and a task unit is counted once** (A57). A
fixed GMU per delivery would otherwise pay for the same work as often as it was wrapped again:
a second tender for the same request has another work id. The rules (P54, P55):

1. A delivery counts only for a task unit of the profile. In version 1 that is a member of the
   committed fixture set, issued by a demander the profile version names; membership is shown
   when the contribution is recorded. A part of a fixture is not a fixture: a document cut into
   ten is ten inputs that are not task units, and earns nothing under the profile (reason
   `not-a-task-unit`).
2. A task unit counts once, and the order that decides is the order of confirmation on the PoUW
   ledger. The counting of a content key is taken by the first confirmation the ledger records
   that is rightful - made by the owner of the tender or by its delegate, for a submission that
   settled by the route the profile names - and that meets every condition of a receipt under
   the profile. The ledger tests that the key is free and marks it counted in the transaction
   that records the receipt, so that two confirmations cannot both take it.
3. Any other accepted delivery of that content key - under another submission, another tender or
   another request id, by another worker or with another model, and whenever it was accepted -
   is recorded as what it is and names the receipt that took the counting. Its transaction and
   its payment are facts and stay. It adds no qualified units, no GMU, measured or subsidized,
   and no eligibility (reason `duplicate-contribution`).
4. A retry is not a new request: it keeps the request id (section 4.1) and, like any other
   delivery of the same task, falls under rule 3.

The order of rule 2 is that of confirmation, not that of acceptance on the tender: a receipt
exists only when the demander confirms, and the two orders can differ. Where one delivery is
accepted first and confirmed second, the other takes the counting. The rule is chosen because one
contract can carry it out with certainty in one transaction. It is not a ranking by merit or by
time of completion, and it does not protect whoever settled first; if that is ever to be
protected, it is another rule, to be designed and ruled. It is also a different matter from
binding an answer to its worker before the answer is public (section 3): both have to be built.

The demander that rule 1 asks for is the demander that is represented. A confirmation made by a
named demander and one made for it by its rightful delegate have the same outcome: a delegate is
not another demander, and an agent whose account confirms through a delegate is not refused for
that. The implementation is tested both ways.

Taking the counting is measurement. Whether the receipt is subsidized as well is decided by the
kernel's rules, as for any receipt (`genesis-mining-mvp.md` 7.5), and a counting that was taken
is not given back because the receipt was not subsidized.

The scope of rule 2 in version 1: one deployment of the ledger, every specification registered on
it. The content key names the task and no model (section 4.1), so the same fixture under another
specification has the same key. The reason is particular to fixtures: the first accepted delivery
makes the reference answer public, and a later delivery of the same fixture, under any model,
shows nothing. A new specification therefore needs fixtures of its own. For the same reason a
fixture whose reference has been revealed is not committed again, in a later set or on a later
deployment; the published sets let an audit check that.

Counting once is the reward policy of a finite set of fixtures. It does not say that a second
service of the same content has no economic value, and no later profile inherits it. A customer's
repeat purchase, the evaluation of another model on the same task and a recomputation for
verification can each have a rule of their own in a later version - for instance the same content
from the same demander or its declared operator within a stated period - so that two customers
who each need the same document read, or one customer who needs it again later, are not refused
for ever by a rule made for fixtures.

GMU is the profile's `baseGmu` for the delivery that counts, within the caps, as today; for every
other delivery it is zero, and the receipt says why.

What these rules do and do not do. They stop a contribution that can be recognized as the same
from being counted twice: under another tender, another submission, a retry or a split. They do
not identify two parties who agree to pretend, addresses that are not declared, or content
altered to look new in a profile whose inputs are not enumerated (A25, A38). The caps bound those
and the admission guards them; the recount raises their cost - public content has to exist and
has to pass the checks - and in the first increment its results are observations, not verdicts.

## 8. Roles and attribution

In the first increment one worker has one role: intelligence producer. The designated test
demander is the customer; the evaluator is the tender's acceptance authority; the worker's Holder
funds the model service. The records preserve which party performed which role and what relation
was declared (A44); separate addresses do not establish independence.

Later, and not in the first increment (A48):

- an agent that fulfills a task and buys inference for it has two attributable activities: the
  task's receipt goes to the fulfiller, the inference's to its producer, and the child names its
  parent;
- an agent can be a buyer like anyone else (A60). When an agent buys inference from a supplier,
  the supplier's qualified service to that agent is a delivery, with the agent as its customer.
  What is not a further delivery to anyone is the agent's own thinking: the use it makes, inside
  itself, of what it bought. A mature network is cells buying from one another, routing and
  paying, and none of that is outside the economy because the buyer is an agent;
- where an upstream inference and a downstream task were each really delivered, each has its own
  record. Whether either is subsidized is decided by its role and by the rules of section 7; the
  same contribution is never packaged twice for a subsidy;
- a router's selection and a verifier's check are roles with profiles of their own;
- a replica is a separately configured instance with its own identity, authority and budget. It
  creates no independent demand and does not escape the rules that bind its operator.

## 9. One profile, three forms of supply

The columns are forms of supply, not stages. A form first appears in the segment named under it
and stays: in Pre-expansion most supply still comes from external services, and the earlier forms
remain in every later stage (A41).

| | A person buys an external service | The agent buys an external service | The supplier operates the model |
| --- | --- | --- | --- |
| First appears in | Startup | Development | Pre-expansion, for a small group of operators |
| Who buys | a person, with fiat, by hand | the agent, within the authority its Holder gave it | the operator pays for compute, by either route |
| Where the model runs | an external service | an external service | on GPUs the supplier operates |
| Supply provenance in the envelope | external; the provider named | external; the provider named | operated; the deployment evidence that exists |
| Evidence of usage | attested by the provider, or declared | the same | the operator's own counters: declared |
| Unchanged | the task class, the checks, the specification, the measurement rule, the envelope, the receipt | | |

A hosted supplier and an operating supplier can therefore be assessed against one specification
(A45). That they implement the same specification does not establish equal compute, equal
hardware or equal model internals, and no report says it does.

A caution that belongs to the first two forms. Passing an external provider's service on to third
parties is governed by that provider's terms. The provenance record says whether an authorization
to do so was obtained; the protocol records the statement and does not vouch for it.

## 10. What the first increment needs built, and what it leaves out

| Piece | Where it belongs |
| --- | --- |
| The first specification: its records, the instruction, the schema and the template; the evaluator, the counter and the canonicalization rule; a fixture set with its task descriptions and its root | this repository |
| The next version of the ledger, with the role, the work id, the parent, the envelope commitment and the content key in a receipt; the `g1.inference` profile and its adapter | this repository; the content of that version is `decisions.md` Q13, Q16 and Q26 |
| A reference worker (takes a task, calls the model service, checks its own delivery, writes the envelope, submits), a reference demander (issues fixtures, confirms) and the recount | this repository's client. FOGA is not modified |
| The operating report of the worker | this repository's client; `supply-and-payment.md` 8 |
| The rehearsal of the increment, with a deterministic stand-in for the model service | this repository |

The first increment is the controlled fixtures, and its acceptance is the mechanism (A59). Three
further things are evidenced after it, each on its own, and none is part of it or stands in for
another (P58; `roadmap.md` 8): a FOGA cell taking part; a supplier that is not the operator's; a
customer's own request.

Left out of the first increment: customers' own tasks; partial acceptance; commitments of
availability; execution evidence; paid verification and calibration; procurement by the agent
(`supply-and-payment.md`, the second increment); settlement in assets other than the native one;
metered and prepaid supply; routing; SIG.

## 11. What the first increment will show, and what it will not

It will show: one specification, published; fixtures delivered under it that passed published
checks and were accepted by a stated route; their usage recorded with the origin of every
counter; the counts and the checks repeated by a machine that is not the operator's; a task unit
counted once however often it was wrapped; a contribution record recomputed from the chain alone;
and a report that tells the cost of the model service from the bounty received and from the
Holder's funding.

It will not show, and will not claim:

- that the named model ran: the first increment has no execution evidence;
- any demand: the procurement is controlled and every task is a fixture. What a later customer
  shows is said where that acceptance is described: one customer that is not the operator's,
  paying for a task of its own, shows that one request - and, paid with funds of value, that one
  independent paid demand. It shows neither the size of a market nor a repeat purchase nor
  sustainability;
- external supply: the worker is the operator's;
- that an accepted extraction is right beyond the published checks and the demander's reference;
- that the milestone of A54 is met: as proposed (P58), that takes a cell taking part and a
  customer's own request as well, each evidenced on its own;
- self-sufficiency, a price that means anything, capacity, or an economy.
