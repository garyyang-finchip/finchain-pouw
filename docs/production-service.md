# The First Production Service: Plan

Design revision v0.1.4, documentation alignment of 2026-11-24. This is the executor's plan for
the first production profile: deliverable B of the alignment (`decisions.md` A54), carrying out
`genesis-mining-mvp.md` 14.2 to 14.5 and `architecture.md` 5.3, 6.2 and 6.3. Those sections state
what a production profile has to decide; this document proposes the decisions for the first one.

Nothing here is built, and nothing here changes round R2. Every choice below is a proposal put up
for a ruling (`decisions.md` P42-P53); where this plan and `genesis-mining-mvp.md` 14 differ, that
section governs. Where the text says "is", read "is proposed to be".

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

Working name `g1.inference` (not a name the kernel has registered). Proposed task class (P42):
**structured extraction**. A request is a text document together with the profile's published
instruction and output schema; a delivery is one JSON object that follows the schema and holds
the fields extracted from the document.

Why this class first:

- its acceptance can be explained and repeated: the checks below are deterministic programs;
- the output is bounded by the schema, so a longer answer is not a larger delivery;
- it has plain use - documents into records - and plain fixtures can be made for it;
- it needs no tool use, no multi-step agent and no judgment of style.

The published checks:

| Check | What it decides | Who can repeat it | What it leaves as a trust assumption |
| --- | --- | --- | --- |
| C1 Format | the delivery is one JSON document in canonical form, valid against the published schema, within the output limit | anyone who has the output | nothing |
| C2 Grounding | every value of a field typed as a span occurs in the input document after the published normalization; numbers, dates and enumerations parse to their published types | anyone who has the input and the output | that a grounded value is the right one of those present |
| C3 Reference (controlled fixtures only) | the delivery equals the reference answer that was committed when the task was issued, field by field after normalization | anyone, once the reference is revealed | that the reference is right: it is the demander's |

A syntactically valid answer is not thereby a correct extraction: C1 alone accepts nothing. For a
controlled fixture, acceptance is C1, C2 and C3. For a customer's own task there is no reference:
the evaluator applies C1 and C2, the customer accepts or rejects, and the report says exactly
that - the correctness beyond C1 and C2 rests on the customer's judgment.

Version 1 has no partial acceptance: a delivery passes every check that applies to it or it is
rejected, with one of the published reasons: `invalid-json`, `schema-violation`, `over-limit`,
`ungrounded-value`, `reference-mismatch`, `late`, `refused`. A model's refusal is a rejection with
its own reason. A rejected or refused request can still have cost the worker something; that cost
stays in the worker's records and earns no contribution.

A controlled fixture demonstrates this procedure. It is not evidence of external demand. In the
first increment every task is a fixture issued by a designated test demander, and every record
says so.

## 3. The pinned choices

The table of `genesis-mining-mvp.md` 14.2, with what is proposed for the first profile.

| Specification | Proposed for the first profile |
| --- | --- |
| Service | the task class of section 2. Input: UTF-8 text up to the context limit. Output: canonical JSON under the published schema, up to the output limit. Completion: a fulfillment submitted inside the tender's submission window |
| Model and tokenizer | one model at a named revision whose weights are published and whose tokenizer is public (P44; `decisions.md` Q19). The serving configuration is recorded with each delivery. A hosted revision that cannot be inspected is labelled opaque |
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
delivered output again. A specification tied to one vendor's service can be supplied in the first
two forms only, and its counts rest on the vendor's report. Such a specification is not excluded:
it can be registered beside the first, by ruling, labelled opaque, with its usage as attested by
the provider. What the choice of the first model has to satisfy: weights and tokenizer published
under a licence that allows serving others; offered today by more than one external service that
an ordinary account can buy from; small enough to be run on one modest machine later; an identity
that names a revision.

For the acceptance authority of a fixture, the reference World already has a verifier of the
hashlock kind, which settled the business loop of 2026-11-13. Whether its interface fits a
committed reference answer of this profile is to be confirmed at the build round and is not
assumed here.

## 4. The evidence envelope

One envelope per delivery (`genesis-mining-mvp.md` 14.3): a JSON document in canonical form,
identified by its hash, kept off chain, with its hash committed on chain. What the first profile
puts in each group:

| Field group | In the first profile |
| --- | --- |
| Domain and versions | the envelope's schema version; chain id; the PoUW deployment; the profile and its version; the evaluator's version; the measurement-rule version |
| Work identity | the work id (below); the tender and the submission; the parent work, if any; the role (`intelligence-producer`); worker, demander and their declared operators |
| Service specification | the identifiers of the specification's records; model and tokenizer revisions; the serving configuration as the worker states it; the commitment to the input; the requested limits |
| Supply provenance | external service or operated model; the provider or the endpoint class - never a credential; whether each fact is declared or verified |
| Usage | the categories of section 5, each with its counter and where the count came from |
| Delivery | the commitment to the output; completed, rejected or refused; the times of request and delivery |
| Verification | the evaluator and its version; each check with its result; the evidence class of each claim (section 6) and its limits; the settlement path; no dispute reference in version 1 |
| Funding and procurement | who funded the model service and by which route; the purchase or invoice the usage was drawn from, by reference |
| Payment and costs | the bounty: asset, raw amount, payer, recipient, state; the cost of the model service for this delivery, in the provider's currency, with its basis; gas |
| Availability and integrity | the encoding and the hash; where the content is kept and until when; who may fetch it; the worker's signature; a status for evidence that is missing |

Payment credentials, private keys and API secrets never enter an envelope or a manifest.

**Record formats** (P43; A6). The owner's ERC-8506 (AI Inference Token Onchain) defines records
for exactly these things, and the envelope uses them: the specification is a Unit (what is
counted and how: the categories, the relations between categories that overlap, the counter) and
a Grade (the model revision and its configuration, the requirements, and which kind of evidence
each of five propositions has); the provenance of supply is a Source (who answers for the supply,
its origin - own capacity or an upstream's quota - and whether an upstream's authorization to
pass the service on was obtained); the usage and verification groups follow the claim and the
evidence entries of its Receipt record, where every entry names the proposition it supports, the
mechanism, what it relies on and what it does not show. This is compatibility at the level of
records. No ERC-8506 contract is needed by the first increment; its ledger of entitlements comes
into the plan later, for supply that is metered and prepaid (`supply-and-payment.md` 9).

**How envelope, tender and receipt correspond** (P46).

- The work id is `keccak256(chainId, tender contract, tokenId, submissionId)`. The envelope, the
  receipt and every payment record of the delivery carry it. A worker's retries share it.
- The tender's task binding cites the specification. The submission's result hash commits to the
  delivered output.
- The worker states the envelope's hash for its submission; the demander's confirmation of the
  settled submission names the same hash; the receipt stores it. A count therefore enters the
  ledger's record only as both sides stated it, and the recount of section 6 computes it again
  from the content.
- A parent work is named in the envelope and in the receipt. Version 1 has no partial delivery.

**Availability** (P47). A hash proves a commitment. It does not make the evidence available or
true. Three cases are told apart, and each report says which applies:

| Availability | Who can obtain the content | What a party with no role can re-check |
| --- | --- | --- |
| Public | anyone, at a stated place, for a stated period | everything the checks and the counts need |
| Controlled access | an auditor the parties admit, under their conditions | the same, by that auditor only; a public auditor cannot check it and the report says so |
| Commitment only | the two parties | that the delivery settled and what was stated about it. Not that a count or a check is right |

In the first increment the fixtures are documents made for the test, their content is public and
is kept with the round's evidence. When required evidence cannot be retrieved, the delivery is
marked unauditable under the profile and its verified qualification is withheld
(`genesis-mining-mvp.md` 14.8).

## 5. Measurement

Usage categories of the first specification, with their overlap stated:

| Category | Counts | Overlap | Counter and origin |
| --- | --- | --- | --- |
| `input` | the request as the model receives it: instruction, schema and document, template applied | - | the specification's public counter, from the committed input: can be counted again |
| `cached_input` | the part of the input a provider served from a cache | included in `input`; never added to it | the provider's report |
| `output_generated` | every token the model generated for the request, reasoning included | - | the provider's report, or the worker's count when it runs the model |
| `output_delivered` | the canonical form of the accepted result | included in `output_generated` | the specification's public counter, from the committed output: can be counted again |
| provider-billed categories | whatever the provider's bill names | as the provider defines them | the provider's bill; used for cost only |

Qualified service units, measurement rule version 1:

```
units = 0                                                    unless the delivery was accepted under section 2
units = ( min(input, L_in) * w_in + min(output_delivered, L_out) * w_out ) / 1,000,000, rounded down
```

with the limits `L_in`, `L_out` and the weights fixed in the measurement version. Not counted:
output that was generated and not delivered; a retry; a request whose input commitment was
already counted for the same demander under the same specification.

What the rule is built to prevent (`genesis-mining-mvp.md` 14.4; `architecture.md` 6.3): extra
output cannot raise the count, because the delivered output is the canonical accepted result and
the schema bounds it; a repeated request cannot; a padded input is bounded by `L_in` and is
visibly the demander's. A request that failed may have cost the worker something and counts
nothing.

**The reward rule of the first increment** (P45; `decisions.md` Q20). Proposed: a fixed GMU for
each accepted qualified delivery - the kernel's own formula, with a `baseGmu` of the profile -
while the qualified units are recorded in the envelope, stated by both sides and recomputed by
the recount. A GMU rule that is proportional to units is a later version of the profile, with its
own specification. The reasons: no count that only two parties stated moves a reward; the
existing formula and its tests carry over; and the first increment then produces what the
transition toward SIG needs first - real usage records with acceptance evidence - before any
rule depends on them (A47).

Nothing here is a calibration. Counts under two models have no exchange rate, and the units of
this specification are not the units of another.

An example with *illustrative* figures (`decisions.md`, last section): weights of 0.25 for input
and 1 for delivered output, limits of 8,000 and 1,000. A fixture with an input of 6,000 tokens is
delivered as a canonical result of 310 tokens, out of 1,150 tokens generated, and accepted:

| Figure | Value |
| --- | --- |
| Usage | input 6,000; output generated 1,150; output delivered 310 |
| Qualified service units | 0.25 x 6,000 + 310 = 1,810 |
| The same request answered with 4,000 generated tokens and the same accepted result | 1,810 |
| The same request delivered a second time for the same demander | 0 |
| GMU measured, with a `baseGmu` of 50 for the profile | 50 |

## 6. Verification classes in the first profile

The four classes of `genesis-mining-mvp.md` 14.5 say which claim a piece of evidence supports.
They are not a ranking and not a schedule of rewards. For the first profile:

| Claim | Class in the first increment | Evidence | What it does not establish |
| --- | --- | --- | --- |
| The usage the provider billed | provider-attested where the provider gives an authenticated record, otherwise declared | the provider's usage record, by reference | that the named model ran; that the worker operates hardware; that anyone needed the result |
| The counts of input and delivered output | independently evaluated | the public content, counted again with the public counter | anything about the tokens that were generated and not delivered |
| The delivery passed the published checks | independently evaluated | the evaluator's findings, repeated by another party from the content | correctness beyond the checks; for a fixture, that the reference is right |
| The named model produced the output | declared, or provider-attested as to what was served | the worker's statement; the provider's record | execution: the first increment has no execution evidence |
| Demand | none claimed | the procurement is controlled and labelled | - |

In the record formats of section 4 these are evidence entries under the propositions of metering,
quality, execution and origin, each with its mechanism and with what it does not show.

Three checks stay apart, and the first is not the others:

| Check | Re-decides | From |
| --- | --- | --- |
| The audit (`pouw audit`) | the ledger: every receipt, total and allocation | the chain alone |
| The recount | a delivery: the hashes up to the commitment, the counts that can be counted again, the published checks | the chain and the content, where the content can be obtained |
| Execution evidence | that a stated computation took place | a reviewed proof or attestation system; none in the first increment |

Verification that is paid for is a later work role with its own assignment, identity, timing and
budget (`genesis-mining-mvp.md` 14.5, 13.1). In the first increment the recount is run by a
machine that is not the operator's, for no reward, as the audit of round R2 is.

## 7. The contribution record

Proposed for the next version of the ledger (P50), which a ruling already requires before round
R3 (A35):

- a receipt carries, besides what it carries today, the role of the contribution, the work id,
  the parent work and the commitment to the evidence envelope;
- `g1.inference` is a profile of its own. A receipt under it needs everything a `g1.tender`
  receipt needs today (`genesis-mining-mvp.md` 7.5), unchanged - the native-asset rule included -
  and three things more: the tender's task is bound to the profile's specification; the
  envelope's hash was stated by the worker and confirmed by the demander; and the submission
  settled by the route the profile names;
- GMU is the profile's `baseGmu` for an accepted delivery, within the caps, as today.

The boundary, stated as the kernel states its own (A25, A38): two admitted parties who agree to
pretend are not detected by these rules. The caps bound them and the admission guards them. The
recount raises the cost of pretending - public content has to exist and has to pass the checks -
and in the first increment its results are observations, not verdicts.

## 8. Roles and attribution

In the first increment one worker has one role: intelligence producer. The designated test
demander is the customer; the evaluator is the tender's acceptance authority; the worker's Holder
funds the model service. The records preserve which party performed which role and what relation
was declared (A44); separate addresses do not establish independence.

Later, and not in the first increment (A48):

- an agent that fulfills a task and buys inference for it has two attributable activities: the
  task's receipt goes to the fulfiller, the inference's to its producer, and the child names its
  parent. The same contribution is never packaged twice for a subsidy;
- an agent's own use of a model, to think and to act, is that agent's cost and not a delivery:
  it has no buyer and no acceptance of its own;
- a router's selection and a verifier's check are roles with profiles of their own;
- a replica is a separately configured instance with its own identity, authority and budget. It
  creates no independent demand and does not escape the rules that bind its operator.

## 9. One profile, three forms of supply

| | Startup | Development | Pre-expansion |
| --- | --- | --- | --- |
| Who buys the model service | a person, with fiat, by hand | the agent, within the authority its Holder gave it | either; the operator of the model also pays for compute |
| Where the model runs | an external service | an external service | on GPUs the supplier operates |
| Supply provenance in the envelope | external; the provider named | external; the provider named | operated; the deployment evidence that exists |
| Evidence of usage | attested by the provider, or declared | the same | the operator's own counters: declared |
| Unchanged | the task class, the checks, the specification, the measurement rule, the envelope, the receipt | | |

A hosted supplier and an operating supplier can therefore be assessed against one specification
(A45). That they implement the same specification does not establish equal compute, equal
hardware or equal model internals, and no report says it does.

A caution that belongs to the first form. Passing an external provider's service on to third
parties is governed by that provider's terms. The provenance record says whether an authorization
to do so was obtained; the protocol records the statement and does not vouch for it.

## 10. What the first increment needs built, and what it leaves out

| Piece | Where it belongs |
| --- | --- |
| The first specification: its records, the instruction and the schema, the evaluator, the counter, a set of fixtures | this repository |
| The next version of the ledger, with the role, the work id, the parent and the envelope commitment in a receipt; the `g1.inference` profile and its adapter | this repository; the content of that version is `decisions.md` Q16 and Q22 |
| A reference worker (takes a task, calls the model service, checks its own delivery, writes the envelope, submits), a reference demander (issues fixtures, confirms) and the recount | this repository's client. FOGA is not modified |
| The operating report of the worker | this repository's client; `supply-and-payment.md` 8 |
| The rehearsal of the increment, with a deterministic stand-in for the model service | this repository |

Left out of the first increment: customers' own tasks; partial acceptance; commitments of
availability; execution evidence; paid verification and calibration; procurement by the agent
(`supply-and-payment.md`, the second increment); settlement in assets other than the native one;
metered and prepaid supply; routing; SIG.

## 11. What the first increment will show, and what it will not

It will show: one specification, published; deliveries under it that passed published checks and
were accepted by a stated route; their usage recorded by category with the origin of every
counter; the counts and the checks repeated by a machine that is not the operator's; a
contribution record recomputed from the chain alone; and a report that tells the cost of the
model service from the bounty received and from the Holder's funding.

It will not show, and will not claim:

- that the named model ran: the first increment has no execution evidence;
- external or commercial demand: the procurement is controlled and every task is a fixture;
- that an accepted extraction is right beyond the published checks and the demander's reference;
- that the milestone of A54 is met before a FOGA cell takes part and a buyer brings a request of
  its own; the first increment shows the mechanism, as round R2a shows the kernel and not an
  agent;
- self-sufficiency, a price that means anything, capacity, or an economy.
