// Shared fixture for the tests: one deployment of the kernel beside the ERC-8414 reference
// contract, on the in-process network.
"use strict";

const { ethers, network } = require("hardhat");
const g = require("../client/lib/genesis");

const DAY = 86400n;
const POINTS = 10n ** 18n;

const DEFAULT_PARAMS = {
  activeFromEpoch: 0,
  budgetBase: 1000n * POINTS,
  halvingInterval: 8,
  splitG0Bps: 7000,
  workerCapBps: 2500,
  minBountyWei: ethers.parseEther("0.001"),
  maxSubsidizedPerDemander: 3,
  maxSubsidizedPerPair: 1,
  subsidizeDeclaredRelated: false,
};

async function now() {
  return BigInt((await ethers.provider.getBlock("latest")).timestamp);
}

async function mine() {
  await network.provider.send("evm_mine");
}

async function setTime(t) {
  await network.provider.send("evm_setNextBlockTimestamp", [Number(t)]);
  await mine();
}

async function revertsWith(promise, name) {
  try {
    await promise;
  } catch (e) {
    if (!String(e.message).includes(name)) throw new Error(`expected revert with ${name}, got: ${e.message}`);
    return;
  }
  throw new Error(`expected revert with ${name}, but the call succeeded`);
}

/// Deploy policy, ledger, audit function, the ERC-8414 contract and the adapter; register the two
/// profiles from epoch 0; admit `admit`. Time is left before genesis unless `start` is true.
async function deploy({ params = {}, duration = DAY, admit = [], operators = {}, start = true, seed = "prev", g1Cap = 200n } = {}) {
  const [steward] = await ethers.getSigners();
  const genesisTime = (await now()) + 1000n;
  const Policy = await ethers.getContractFactory("GenesisPolicy");
  const policy = await Policy.deploy(steward.address, genesisTime, duration, { ...DEFAULT_PARAMS, ...params });
  const Seed = await ethers.getContractFactory(seed === "fixed" ? "FixedSeedSource" : "PrevBlockSeedSource");
  const seedSource = await Seed.deploy();
  if (seed === "fixed") await seedSource.set(ethers.id("seed material 0"));
  const Ledger = await ethers.getContractFactory("GenesisLedger");
  const ledger = await Ledger.deploy(await policy.getAddress(), await seedSource.getAddress());
  const Audit = await ethers.getContractFactory("AuditV1");
  const audit = await Audit.deploy(await ledger.getAddress());
  const TaskToken = await ethers.getContractFactory("TaskToken");
  const taskToken = await TaskToken.deploy("Task Tenders", "TASK");
  const Adapter = await ethers.getContractFactory("TenderAdapter8414");
  const adapter = await Adapter.deploy(await ledger.getAddress(), await taskToken.getAddress(), g.PROFILE_G1_TENDER);

  await policy.registerProfile(g.PROFILE_G0_REF, g.POOL_G0, await audit.getAddress(), 10, 10, 1, 0);
  await policy.registerProfile(g.PROFILE_G1_TENDER, g.POOL_G1, await adapter.getAddress(), 50, g1Cap, 0, 0);
  for (const w of admit) await policy.setAdmission(w.address ?? w, true);
  for (const [addr, op] of Object.entries(operators)) await policy.declareOperator(addr, op);

  const deployBlock = 0;
  const manifest = { contracts: { GenesisLedger: await ledger.getAddress() }, deployBlock };
  const ctx = await g.connect(manifest, ethers.provider);
  const d = { steward, policy, ledger, audit, seedSource, taskToken, adapter, genesisTime, duration, ctx, manifest };
  if (start) await setTime(genesisTime);
  return d;
}

/// Move to `offset` seconds after the start of `epoch`.
async function toEpoch(d, epoch, offset = 10n) {
  await setTime(d.genesisTime + BigInt(epoch) * d.duration + offset);
}

/// The correct output of `worker`'s audit job in the current epoch.
async function auditOutputFor(d, worker) {
  const epoch = await d.policy.currentEpoch();
  if ((await d.ledger.seedOf(epoch)) === ethers.ZeroHash) await d.ledger.openEpoch();
  const seed = await d.ledger.seedOf(epoch);
  const subject = epoch === 0n ? await d.ledger.configHash() : await d.ledger.auditSubject(epoch - 1n);
  const instance = g.g0Instance(seed, g.AUDIT_V1_FUNCTION_ID, 0, worker.address);
  return g.auditOutput(instance, g.auditInputHash(epoch, subject));
}

/// The correct output of `worker`'s audit job when its submission is itself the transaction that
/// opens the epoch. With the previous-block source the seed material is the hash of the block before
/// the transaction's own, which the sender can read before sending: the first submitter of an epoch
/// knows the epoch's seed before anyone else does.
async function auditOutputForUnopened(d, worker) {
  const epoch = await d.policy.currentEpoch();
  const material = (await ethers.provider.getBlock("latest")).hash;
  const seed = g.epochSeed(d.ctx.domain, epoch, material);
  const subject = epoch === 0n ? await d.ledger.configHash() : await d.ledger.auditSubject(epoch - 1n);
  const instance = g.g0Instance(seed, g.AUDIT_V1_FUNCTION_ID, 0, worker.address);
  return g.auditOutput(instance, g.auditInputHash(epoch, subject));
}

async function submitAudit(d, worker) {
  const output = await auditOutputFor(d, worker);
  const tx = await d.ledger.connect(worker).submitG0(g.profileKey(g.PROFILE_G0_REF), await d.policy.currentEpoch(), 0, output);
  await tx.wait();
  return await d.ledger.receiptCount();
}

let taskNonce = 0;

/// One ERC-8414 tender: minted and funded by `owner`, judged by `judge` (default: the owner),
/// fulfilled by `worker`, and settled unless `settle` is false. Returns the ids.
async function tender(d, { owner, judge, worker, reward = ethers.parseEther("0.002"), asset = ethers.ZeroAddress, settle = true, judgmentWindow = 3600 }) {
  const t = d.taskToken;
  const n = ++taskNonce;
  const terms = {
    asset, rewardPerCompletion: reward, maxCompletions: 0, submitBy: 0, settleBy: 0, epochLength: 0,
    maxCompletionsPerEpoch: 0, judgmentWindow,
  };
  const judgeAddr = (judge ?? owner).address;
  const tokenId = await t.nextId();
  await (await t.connect(owner).mintTask(owner.address, owner.address, judgeAddr, ethers.id(`td ${n}`), ethers.id(`task ${n}`), `ipfs://task-${n}`, terms)).wait();
  if (asset === ethers.ZeroAddress) {
    await (await t.connect(owner).fundTask(tokenId, reward, { value: reward })).wait();
  } else {
    const token = await ethers.getContractAt("TestToken", asset);
    await (await token.mint(owner.address, reward)).wait();
    await (await token.connect(owner).approve(await t.getAddress(), reward)).wait();
    await (await t.connect(owner).fundTask(tokenId, reward)).wait();
  }
  await (await t.connect(worker).submitFulfillment(tokenId, ethers.id(`result ${n}`), `ipfs://result-${n}`)).wait();
  const submissionId = await t.submissionCountOf(tokenId);
  if (settle) await (await t.connect(judge ?? owner).acceptFulfillment(tokenId, submissionId)).wait();
  return { tokenId, submissionId, owner };
}

/// Bridge a settled submission as the tender's owner (or `caller`); returns the receipt id and its status.
async function bridge(d, { tokenId, submissionId, owner }, caller, adapter = d.adapter) {
  await (await adapter.connect(caller ?? owner).bridge(tokenId, submissionId)).wait();
  const id = await d.ledger.receiptOfContribution(g.g1ContributionId(d.ctx.domain, await d.taskToken.getAddress(), tokenId, submissionId));
  return { id, status: g.plainStatus(await d.ledger.status(id)), receipt: g.plainReceipt(await d.ledger.receipt(id)) };
}

/// The events named `name` that `contract` emitted in a transaction.
function eventsOf(rc, contract, name) {
  const out = [];
  for (const l of rc.logs) {
    let p = null;
    try { p = contract.interface.parseLog(l); } catch { p = null; }
    if (p && p.name === name) out.push(p);
  }
  return out;
}

module.exports = {
  ethers, network, g, DAY, POINTS, DEFAULT_PARAMS, now, mine, setTime, revertsWith, deploy, toEpoch, auditOutputFor,
  auditOutputForUnopened, submitAudit, tender, bridge, eventsOf,
};
