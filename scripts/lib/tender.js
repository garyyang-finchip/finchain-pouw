// A test tender on an ERC-8414 contract: minted and funded by one key, delivered by another,
// accepted by the first. These are the standard's own calls; the kernel never makes them. A test
// tender carries no task - it settles a fixed result - so what it exercises is settlement and
// bridging, and it is evidence of nothing else.
"use strict";

const { ethers } = require("ethers");

const TENDER_ABI = [
  "function mintTask(address to, address updateAuthority, address acceptanceAuthority, bytes32 tdHash, bytes32 taskHash, string taskURI, (address asset, uint256 rewardPerCompletion, uint64 maxCompletions, uint64 submitBy, uint64 settleBy, uint64 epochLength, uint64 maxCompletionsPerEpoch, uint64 judgmentWindow) terms) returns (uint256)",
  "function fundTask(uint256 tokenId, uint256 amount) payable",
  "function submitFulfillment(uint256 tokenId, bytes32 resultHash, string resultURI) returns (uint256)",
  "function acceptFulfillment(uint256 tokenId, uint256 submissionId)",
  "function ownerOf(uint256 tokenId) view returns (address)",
  "function acceptanceAuthorityOf(uint256 tokenId) view returns (address)",
  "function escrowBalanceOf(uint256 tokenId) view returns (uint256)",
  "function submissionCountOf(uint256 tokenId) view returns (uint256)",
  "function submissionOf(uint256 tokenId, uint256 submissionId) view returns ((address fulfiller, bytes32 resultHash, uint64 taskVersion, uint64 submittedAt, bool machineSettled, uint8 status))",
  "event Transfer(address indexed from, address indexed to, uint256 indexed tokenId)",
  "event FulfillmentSubmitted(uint256 indexed tokenId, uint256 indexed submissionId, address indexed fulfiller, bytes32 resultHash, string resultURI, uint64 taskVersion)",
];
const STATUS_PENDING = 0;
const STATUS_ACCEPTED = 1;

function eventIn(rc, contract, name, where = () => true) {
  for (const l of rc.logs) {
    if (l.address !== contract.target) continue;
    let p = null;
    try { p = contract.interface.parseLog(l); } catch { p = null; }
    if (p && p.name === name && where(p.args)) return p;
  }
  throw new Error(`the transaction ${rc.hash} carries no ${name} event of ${contract.target}`);
}

/// Stage one test tender from `demander` to `worker` (two signers), or carry on with the one that
/// `state` names: every step first looks at where the tender stands on chain, so a run that was
/// interrupted is continued and nothing is done twice. `state` gets the ids as soon as they exist;
/// `log(step)` is called when a step is done and written down. A run that dies between a mint and
/// the note of its id leaves that tender behind, unfunded, and mints another: nothing else is lost.
async function stageTender({ tenderAddress, demander, worker, reward, judgmentWindow = 3600, label, state = {}, save = () => {}, log = () => {} }) {
  const asDemander = new ethers.Contract(tenderAddress, TENDER_ABI, demander);
  const asWorker = asDemander.connect(worker);
  const steps = [];
  const sent = async (step, txPromise) => {
    const rc = await (await txPromise).wait();
    steps.push({ step, txHash: rc.hash, block: rc.blockNumber, gasUsed: rc.gasUsed });
    return rc;
  };
  const taskHash = ethers.id(`${label}:task`);

  // mint: the token's id is written down as soon as it exists - it is what a later run carries on from
  if (state.tokenId === undefined) {
    const terms = { asset: ethers.ZeroAddress, rewardPerCompletion: reward, maxCompletions: 1, submitBy: 0, settleBy: 0, epochLength: 0,
      maxCompletionsPerEpoch: 0, judgmentWindow };
    const rc = await sent("mint", asDemander.mintTask(demander.address, demander.address, demander.address, ethers.id(`${label}:description`), taskHash,
      `urn:finchain-pouw:test-tender:${label}`, terms));
    state.tokenId = eventIn(rc, asDemander, "Transfer", (a) => a.from === ethers.ZeroAddress && a.to === demander.address).args.tokenId.toString();
    save();
    log("mint");
  }
  const tokenId = BigInt(state.tokenId);
  const owner = await asDemander.ownerOf(tokenId);
  if (owner !== demander.address) throw new Error(`tender ${tokenId} is owned by ${owner}, not by ${demander.address}`);

  // fund and deliver, unless the worker's delivery is there already. Only the worker's own
  // submission is ever looked for, and later accepted: never "the latest one"
  let submissionId = state.submissionId === undefined ? null : BigInt(state.submissionId);
  if (submissionId === null) {
    const count = await asDemander.submissionCountOf(tokenId);
    for (let i = 1n; i <= count; i++) if ((await asDemander.submissionOf(tokenId, i)).fulfiller === worker.address) submissionId = i;
  }
  if (submissionId === null) {
    if ((await asDemander.escrowBalanceOf(tokenId)) < reward) {
      await sent("fund", asDemander.fundTask(tokenId, reward, { value: reward }));
      log("fund");
    }
    const resultHash = ethers.keccak256(ethers.AbiCoder.defaultAbiCoder().encode(["bytes32", "address"], [taskHash, worker.address]));
    const rc = await sent("deliver", asWorker.submitFulfillment(tokenId, resultHash, `urn:finchain-pouw:test-result:${label}`));
    submissionId = eventIn(rc, asDemander, "FulfillmentSubmitted", (a) => a.fulfiller === worker.address).args.submissionId;
    state.submissionId = submissionId.toString();
    save();
    log("deliver");
  } else if (state.submissionId === undefined) {
    state.submissionId = submissionId.toString();
    save();
  }

  const status = Number((await asDemander.submissionOf(tokenId, submissionId)).status);
  if (status === STATUS_PENDING) {
    await sent("accept", asDemander.acceptFulfillment(tokenId, submissionId));
    log("accept");
  } else if (status !== STATUS_ACCEPTED) {
    throw new Error(`submission ${submissionId} of tender ${tokenId} was rejected`);
  }
  return { tokenId, submissionId, steps };
}

module.exports = { TENDER_ABI, STATUS_PENDING, STATUS_ACCEPTED, eventIn, stageTender };
