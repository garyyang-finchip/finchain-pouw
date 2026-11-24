// Shared fixture for the tests of ledger v2: one deployment of the v2 contracts beside the
// ERC-8414 reference contract, on the in-process network. The kernel of 0.1.3 has its own
// fixture in helpers.js and its own tests; nothing here touches them.
"use strict";

const { ethers } = require("hardhat");
const h = require("./helpers");
const g = require("../client/lib/genesis");
const v2 = require("../client/lib/ledger2");
const permit = require("../client/lib/permit");

const { DAY, POINTS } = h;
const ZERO = ethers.ZeroAddress;
const NONE = ethers.ZeroHash;

const DEFAULT_PARAMS = {
  activeFromEpoch: 0,
  budgetBase: 1000n * POINTS,
  halvingInterval: 8,
  splitG0Bps: 7000,
  workerCapBps: 2500,
  operatorCapBps: 2500,
  minBountyWei: ethers.parseEther("0.001"),
  maxSubsidizedPerDemander: 3,
  maxSubsidizedPerPair: 1,
  subsidizeDeclaredRelated: false,
};

// The profiles of the fixture. g0.ref and g1.tender are the two of 0.1.3; the others exist for the
// tests: a G0 function with two jobs, and three G1 profiles served by a module that states what a
// test tells it - one that does not count task units and two that do.
const PROFILE = { G0: "g0.ref", ECHO: "g0.echo", TENDER: "g1.tender", FREE: "g1.free", UNIT: "g1.unit", UNIT_B: "g1.unit-b" };
const ECHO_FUNCTION_ID = ethers.id("finchain-pouw.testing.echo");
const key = (name) => g.profileKey(name);

const ERRORS = new ethers.Interface([
  ...new Map([...v2.abi.ledger, ...v2.abi.policy, ...v2.abi.adapter].filter((f) => f.type === "error").map((f) => [f.name, f])).values(),
  "error CallFailed(bytes data)", "error NotOwner()", "error NotOwnerOrOperator()", "error Suspended()", "error UndefinedJob(uint32 jobIndex)",
]);

/// The contract error behind a failed call, by name, also when a contract account wrapped it.
function errorOf(e) {
  const data = typeof e === "string" ? e
    : [e?.data, e?.info?.error?.data, e?.error?.data, e?.info?.error?.data?.data].find((x) => typeof x === "string" && x.length >= 10);
  if (!data) return null;
  let parsed = null;
  try { parsed = ERRORS.parseError(data); } catch { parsed = null; }
  if (!parsed) return null;
  if (parsed.name === "CallFailed") return errorOf(parsed.args[0]) ?? { name: "CallFailed", args: [] };
  return { name: parsed.name, args: [...parsed.args] };
}

/// Expects the call to be refused with the contract error `name`. Returns the error's arguments.
async function refuses(promise, name) {
  let error = null;
  try { const tx = await promise; if (tx && typeof tx.wait === "function") await tx.wait(); } catch (e) { error = e; }
  if (!error) throw new Error(`expected a refusal with ${name}, but the call went through`);
  const found = errorOf(error);
  if (found?.name !== name && !String(error.message).includes(name)) {
    throw new Error(`expected a refusal with ${name}, got ${found ? found.name : error.message}`);
  }
  return found?.args ?? [];
}

/// The gas a transaction used although it was refused: sent with a generous limit, mined, reverted.
async function gasOfRefused(send) {
  let refused = false;
  try { await (await send()).wait(); } catch { refused = true; }
  if (!refused) throw new Error("expected the transaction to be refused");
  const block = await ethers.provider.getBlock("latest");
  const receipt = await ethers.provider.getTransactionReceipt(block.transactions[0]);
  if (receipt.status !== 0) throw new Error("the latest transaction was not the refused one");
  return receipt.gasUsed;
}

async function deploy({ params = {}, duration = DAY, admit = [], operators = {}, start = true, seed = "prev", g1Cap = 200n, unitCap = 200n, echoCap = 20n } = {}) {
  const [steward] = await ethers.getSigners();
  const genesisTime = (await h.now()) + 1000n;
  const at = async (name, ...args) => (await ethers.getContractFactory(name)).deploy(...args);
  const policy = await at("GenesisPolicyV2", steward.address, genesisTime, duration, { ...DEFAULT_PARAMS, ...params });
  const seedSource = await at(seed === "fixed" ? "FixedSeedSource" : "PrevBlockSeedSource");
  if (seed === "fixed") await seedSource.set(ethers.id("seed material 0"));
  const ledger = await at("GenesisLedgerV2", await policy.getAddress(), await seedSource.getAddress());
  const ledgerAddress = await ledger.getAddress();
  // the audit function of 0.1.3, as it is: it reads `configHash` and `auditSubject`, which v2 keeps
  const audit = await at("AuditV1", ledgerAddress);
  const echo = await at("EchoFunction");
  const taskToken = await at("TaskToken", "Task Tenders", "TASK");
  const adapter = await at("TenderAdapter8414V2", ledgerAddress, await taskToken.getAddress(), PROFILE.TENDER);
  const module = await at("TestModule", ledgerAddress);

  const spec = (name, pool, moduleAddress, baseGmu, cap, jobs, extra = {}) => ({
    name, pool, module: moduleAddress, baseGmu, maxGmuPerWorkerPerEpoch: cap, jobsPerEpoch: jobs, activeFromEpoch: 0,
    role: 0, countsUnits: false, unitSetRoot: NONE, issuerSetRoot: NONE, ...extra,
  });
  const moduleAddress = await module.getAddress();
  await policy.registerProfile(spec(PROFILE.G0, 0, await audit.getAddress(), 10, 10, 1));
  await policy.registerProfile(spec(PROFILE.ECHO, 0, await echo.getAddress(), 10, echoCap, 2));
  await policy.registerProfile(spec(PROFILE.TENDER, 1, await adapter.getAddress(), 50, g1Cap, 0));
  await policy.registerProfile(spec(PROFILE.FREE, 1, moduleAddress, 50, g1Cap, 0, { role: v2.ROLE.AGENT_FULFILLMENT }));
  await policy.registerProfile(spec(PROFILE.UNIT, 1, moduleAddress, 50, unitCap, 0,
    { role: v2.ROLE.INTELLIGENCE_PRODUCTION, countsUnits: true, unitSetRoot: ethers.id("unit set A"), issuerSetRoot: ethers.id("issuers A") }));
  await policy.registerProfile(spec(PROFILE.UNIT_B, 1, moduleAddress, 50, unitCap, 0,
    { role: v2.ROLE.INTELLIGENCE_PRODUCTION, countsUnits: true, unitSetRoot: ethers.id("unit set B"), issuerSetRoot: ethers.id("issuers B") }));

  // every admitted address gets an operator of its own unless the test names one: v2 subsidizes
  // declared operators only, and most tests are not about that rule
  let next = 100;
  for (const w of admit) {
    const address = w.address ?? w.target ?? w;
    await policy.setAdmission(address, true);
    if (!(address in operators)) await policy.declareOperator(address, ++next);
  }
  for (const [address, operator] of Object.entries(operators)) if (operator !== 0) await policy.declareOperator(address, operator);

  const { chainId } = await ethers.provider.getNetwork();
  const d = {
    steward, policy, ledger, ledgerAddress, audit, echo, seedSource, taskToken, adapter, module, genesisTime, duration, chainId,
    domain: await ledger.domain(), spec,
  };
  if (start) await h.setTime(genesisTime);
  return d;
}

/// The correct output of `participant`'s instance of a G0 job in the current epoch.
async function g0Output(d, participant, { profile = PROFILE.G0, jobIndex = 0 } = {}) {
  const epoch = await d.policy.currentEpoch();
  if ((await d.ledger.seedOf(epoch)) === NONE) await d.ledger.openEpoch();
  const seed = await d.ledger.seedOf(epoch);
  if (profile === PROFILE.G0) {
    const subject = epoch === 0n ? await d.ledger.configHash() : await d.ledger.auditSubject(epoch - 1n);
    const instance = g.g0Instance(seed, g.AUDIT_V1_FUNCTION_ID, 0, participant);
    return { epoch, instance, functionId: g.AUDIT_V1_FUNCTION_ID, output: g.auditOutput(instance, g.auditInputHash(epoch, subject)) };
  }
  const instance = v2.g0Instance(seed, ECHO_FUNCTION_ID, jobIndex, participant);
  const coder = ethers.AbiCoder.defaultAbiCoder();
  const inputHash = ethers.keccak256(coder.encode(["bytes32", "uint64", "uint32"], [ECHO_FUNCTION_ID, epoch, jobIndex]));
  return { epoch, instance, functionId: ECHO_FUNCTION_ID, output: ethers.keccak256(coder.encode(["bytes32", "bytes32"], [instance, inputHash])) };
}

const lastReceipt = async (d) => {
  const id = await d.ledger.receiptCount();
  return { id, receipt: v2.plainReceipt(await d.ledger.receipt(id)), status: v2.plainStatus(await d.ledger.status(id)) };
};

/// Submit the G0 job directly, as `signer`.
async function submitDirect(d, signer, options = {}) {
  const o = await g0Output(d, signer.address, options);
  const rc = await (await d.ledger.connect(signer).submitG0(key(options.profile ?? PROFILE.G0), o.epoch, options.jobIndex ?? 0, options.output ?? o.output)).wait();
  return { ...(await lastReceipt(d)), rc, ...o };
}

/// A permit of `account` (an address), with its digest and its signature by `signer`.
async function signed(d, signer, account, fields = {}, { chainId = d.chainId, ledger = d.ledgerAddress } = {}) {
  const st = permit.statement("Permit", chainId, ledger, {
    account, delegate: fields.delegate, scope: fields.scope ?? 3, notBeforeEpoch: fields.notBeforeEpoch ?? 0,
    notAfterEpoch: fields.notAfterEpoch ?? 100, nonce: fields.nonce ?? 1, guard: fields.guard ?? ZERO,
    guardBindingVersion: fields.guardBindingVersion ?? 0,
  });
  return { st, tuple: permit.permitTuple(st), digest: permit.digestOf(st), signature: await permit.sign(signer, st) };
}

/// A `Revoke` or `RaiseNonce` statement of `account`, signed by `signer`.
async function signedStatement(d, signer, kind, message) {
  const st = permit.statement(kind, d.chainId, d.ledgerAddress, message);
  return { st, digest: permit.digestOf(st), signature: await permit.sign(signer, st) };
}

/// The call of the delegated G0 entry, not yet awaited: for tests that expect it to be refused.
async function delegatedCall(d, delegate, p, account, options = {}) {
  const o = await g0Output(d, account, options);
  return () => d.ledger.connect(delegate).submitG0For(p.tuple, options.signature ?? p.signature, key(options.profile ?? PROFILE.G0), o.epoch,
    options.jobIndex ?? 0, o.output);
}

/// Submit `account`'s G0 job through `delegate` under the permit `p`.
async function submitDelegated(d, delegate, p, account, options = {}) {
  const o = await g0Output(d, account, options);
  const rc = await (await (await delegatedCall(d, delegate, p, account, options))()).wait();
  return { ...(await lastReceipt(d)), rc, ...o };
}

let serial = 0;

/// The facts of a G1 receipt as a module would state them, for the module of the fixture.
function facts(d, { worker, demander, judge, source, tokenId, submissionId = 1n, asset = ZERO, reward = ethers.parseEther("0.002"), deliveredAt } = {}) {
  const n = ++serial;
  const address = (x) => x?.address ?? x?.target ?? x;
  return {
    source: source ?? d.module.target, tokenId: tokenId ?? BigInt(1000 + n), submissionId,
    worker: address(worker), demander: address(demander), judge: address(judge ?? demander),
    inputHash: ethers.id(`input ${n}`), outputHash: ethers.id(`output ${n}`), asset, reward,
    deliveredAt: deliveredAt ?? d.genesisTime + 1n,
  };
}

const extra = ({ parent = NONE, envelopeHash = NONE, contentKey = NONE, unit = 0 } = {}) => ({ parent, envelopeHash, contentKey, unit });

/// Record a G1 receipt through the fixture's module under `profile`; returns the receipt and its status.
async function record(d, profile, f, x = {}, e = {}) {
  const entry = { sender: e.sender ?? f.demander, authorization: e.authorization ?? NONE };
  const rc = await (await d.module.record(key(profile), f, extra(x), entry)).wait();
  const id = await d.ledger.receiptOfContribution(v2.g1ContributionId(d.domain, f.source, f.tokenId, f.submissionId));
  return { id, rc, receipt: v2.plainReceipt(await d.ledger.receipt(id)), status: v2.plainStatus(await d.ledger.status(id)) };
}

/// The addresses' allocations of an epoch as the client's arithmetic gives them, from the ledger's
/// own stored figures: an independent computation of the contract's function.
async function allocationOf(d, epoch, worker) {
  const [, q] = await d.policy.paramsFor(epoch);
  const s = await d.ledger.epochSummary(epoch);
  const [recorded, operator] = await d.ledger.operatorAt(epoch, worker);
  if (!recorded) return 0n;
  let total = 0n;
  for (const [pool, budget, poolTotal] of [[0, s.budgetG0, s.subsidizedG0], [1, s.budgetG1, s.subsidizedG1]]) {
    total += v2.share(budget, await d.ledger.subsidizedOf(epoch, pool, worker), await d.ledger.subsidizedOfOperator(epoch, pool, operator),
      poolTotal, q.operatorCapBps, q.workerCapBps);
  }
  return total;
}

module.exports = {
  ethers, h, g, v2, permit, DAY, POINTS, ZERO, NONE, DEFAULT_PARAMS, PROFILE, ECHO_FUNCTION_ID, key, errorOf, refuses, gasOfRefused, deploy, g0Output,
  lastReceipt, submitDirect, signed, signedStatement, delegatedCall, submitDelegated, facts, extra, record, allocationOf,
};
