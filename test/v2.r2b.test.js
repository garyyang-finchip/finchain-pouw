"use strict";

// The operation package of round R2b, rehearsed on the in-process network: the configuration of
// deployments/finchain-sepolia-r2b.config.json with its addresses replaced by local stand-ins, the
// permits signed with scripts/sign-permit.js as the hosts will sign them, the valid permits checked
// read-only, two epochs of work through the delegates, and the audits of both epochs, whose figures
// are the expected figures of docs/r2b-operation.md (section 6). With R2B_GAS=1 it prints the gas of
// each step, from which the package's fee list is made.

const fs = require("fs");
const os = require("os");
const path = require("path");
const crypto = require("crypto");
const { execFileSync } = require("child_process");
const { expect } = require("chai");
const t = require("./v2.helpers");
const { ethers, h, g, v2 } = t;
const kernel = require("../scripts/lib/deploy");
const d2 = require("../scripts/lib/deploy2");
const m2 = require("../client/lib/manifest2");
const a2 = require("../client/lib/audit2");
const c2 = require("../client/lib/client2");
const permitLib = require("../client/lib/permit");

const root = path.join(__dirname, "..");
const CONFIG = path.join(root, "deployments", "finchain-sepolia-r2b.config.json");

function keyOf(dir, name) {
  const wallet = ethers.Wallet.createRandom().connect(ethers.provider);
  const file = path.join(dir, `${name}.key`);
  fs.writeFileSync(file, `${wallet.privateKey}\n`, { mode: 0o600 });
  return { wallet, file };
}

/// The permit of a cell, made as the package says: by scripts/sign-permit.js with the owner's key
/// file, every field an argument, after the deployment is verified.
function signPermit(dir, name, fields) {
  const out = path.join(dir, `${name}.json`);
  execFileSync(process.execPath, ["scripts/sign-permit.js", "permit", "--chain-id", String(fields.chainId), "--ledger", fields.ledger, "--account", fields.account,
    "--delegate", fields.delegate, "--scope", fields.scope, "--not-before-epoch", "0", "--not-after-epoch", "2", "--nonce", "0",
    "--guard", fields.guard, "--guard-binding-version", "1", "--key-file", fields.keyFile, "--out", out], { cwd: root, stdio: "pipe" });
  return out;
}

describe("Round R2b: the operation package, rehearsed", () => {
  it("deploys the package's configuration, checks the signed permits read-only, works two epochs through the delegates and audits them (L62)", async () => {
    const config = JSON.parse(fs.readFileSync(CONFIG, "utf8"));
    // the configuration itself: Finchain Sepolia, both cells under one operator behind the cell guard, a delegate of each
    expect([config.schema, config.chainId, config.environment, config.seedSource, config.epochDuration]).to.deep.equal(["finchain-pouw.deploy-config/2", 85422, "public-testnet", "L1BlockSeedSource", 7200]);
    const cells = config.parties.filter((p) => p.guard === "FogaCellGuard");
    expect(cells.map((p) => [p.name, p.operator, p.admitted])).to.deep.equal([["OG", 1, true], ["cell-b", 1, true]]);
    expect(config.parties.filter((p) => p.key).map((p) => [p.key, p.fundEth])).to.deep.equal([["delegate-og", "0.002"], ["delegate-cell-b", "0.002"]]);
    expect(config.params.map((v) => [v.activeFromEpoch, v.subsidizeDeclaredRelated, v.operatorCapBps])).to.deep.equal([[0, true, 5000], [1, false, 5000]]);
    const identities = JSON.parse(fs.readFileSync(path.join(root, "deployments", "finchain-sepolia.identities.json"), "utf8"));
    expect(cells.map((p) => p.address)).to.deep.equal(identities.parties.map((p) => p.account));
    expect(config.taskToken8414.address).to.equal(identities.taskToken8414.address);

    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "pouw-r2b-"));
    try {
      const [steward] = await ethers.getSigners();
      // the owners' keys stand for the cells' signer keys, which stay on their hosts; the delegates are keys of their own
      const owner = { OG: keyOf(dir, "og-owner"), "cell-b": keyOf(dir, "cell-b-owner") };
      const delegate = { OG: keyOf(dir, "delegate-og"), "cell-b": keyOf(dir, "delegate-cell-b") };
      for (const k of Object.values(owner)) await (await steward.sendTransaction({ to: k.wallet.address, value: ethers.parseEther("1") })).wait();
      const account = {};
      for (const name of ["OG", "cell-b"]) account[name] = await (await ethers.getContractFactory("MockFogaCell")).deploy(owner[name].wallet.address);
      const act = async (name, target, data, value = 0n) => (await account[name].connect(owner[name].wallet).execute(target, value, data, { value })).wait();

      // the World's ERC-8414 contract, and a tender the OG's account owns, delivered by cell-b's account and settled before the deployment, as tender 5 is
      const token = await (await ethers.getContractFactory("TaskToken")).deploy("Task Tenders", "TASK");
      const tokenTx = token.deploymentTransaction().hash;
      const tokenBlock = (await ethers.provider.getTransactionReceipt(tokenTx)).blockNumber;
      const reward = ethers.parseEther("0.0005");
      const terms = { asset: ethers.ZeroAddress, rewardPerCompletion: reward, maxCompletions: 1, submitBy: 0, settleBy: 0, epochLength: 0, maxCompletionsPerEpoch: 0, judgmentWindow: 3600 };
      const og = account.OG.target; const cb = account["cell-b"].target;
      const minted = await act("OG", token.target, token.interface.encodeFunctionData("mintTask", [og, og, og, ethers.id("r2b:description"), ethers.id("r2b:task"), "urn:finchain-pouw:r2b", terms]));
      const tokenId = minted.logs.map((l) => { try { return token.interface.parseLog(l); } catch { return null; } }).find((e) => e?.name === "Transfer" && e.args.to === og).args.tokenId;
      await act("OG", token.target, token.interface.encodeFunctionData("fundTask", [tokenId, reward]), reward);
      const delivered = await act("cell-b", token.target, token.interface.encodeFunctionData("submitFulfillment", [tokenId, ethers.id("r2b:result"), "urn:finchain-pouw:r2b:result"]));
      const submissionId = delivered.logs.map((l) => { try { return token.interface.parseLog(l); } catch { return null; } }).find((e) => e?.name === "FulfillmentSubmitted").args.submissionId;
      await act("OG", token.target, token.interface.encodeFunctionData("acceptFulfillment", [tokenId, submissionId]));

      // round R2a's deployment, for this one to supersede
      const old = await kernel.deployKernel({
        config: { schema: kernel.CONFIG_SCHEMA, name: "finchain-sepolia-r2", environment: "local-devnet", chainId: 31337, epochDuration: 7200, seedSource: "PrevBlockSeedSource",
          taskToken8414: { address: token.target, deployBlock: tokenBlock }, params: [{ ...config.params[0], operatorCapBps: undefined }], profiles: config.profiles },
        steward, genesisTime: (await h.now()) + 1000n, parties: [],
      });
      const bytes = Buffer.from(JSON.stringify(old.manifest));
      const supersedes = { manifest: old.manifest, sha256: crypto.createHash("sha256").update(bytes).digest("hex") };

      // the package's configuration, with the local addresses in place of Finchain Sepolia's
      const local = { ...config, chainId: 31337, environment: "local-devnet", rpc: undefined, seedSource: "PrevBlockSeedSource", taskToken8414: { address: token.target, deployBlock: tokenBlock, deployTx: tokenTx } };
      delete local.rpc; delete local.supersedes;
      const parties = config.parties.map((p) => (p.guard ? { ...p, address: { OG: og, "cell-b": cb }[p.name] } : { name: p.key, address: delegate[{ "delegate-og": "OG", "delegate-cell-b": "cell-b" }[p.key]].wallet.address, fundEth: p.fundEth }));
      const genesisTime = (await h.now()) + 1000n;
      const planned = await d2.plan({ config: local, provider: ethers.provider, stewardAddress: steward.address, genesisTime, parties, supersedes });
      expect(planned.transactions).to.equal(17);
      if (process.env.R2B_GAS) console.log(d2.planText(local, planned));
      const { manifest, record, ok } = await d2.deployV2({ config: local, steward, genesisTime, parties, supersedes });
      expect(ok, JSON.stringify([...record.verification.deployment, ...record.verification.policy].filter((x) => !x.ok))).to.equal(true);
      expect(record.gasUsed > 0n).to.equal(true);
      const ctx = await a2.connect(manifest, ethers.provider, { tag: "latest" });
      const verified = await m2.verifyDeployment(ctx);
      expect(verified.ok, JSON.stringify(verified.checks.filter((x) => !x.ok))).to.equal(true);
      ctx.deployment = manifest;
      const guard = manifest.contracts.FogaCellGuard;
      expect([manifest.guards[og].guard, manifest.guards[cb].guard, manifest.guards[og].bindingVersion]).to.deep.equal([guard, guard, 1]);
      for (const k of Object.values(delegate)) expect(await ethers.provider.getBalance(k.wallet.address)).to.equal(ethers.parseEther("0.002"));

      // the permits: generated from the verified deployment, signed once on each cell's host, checked read-only before any work
      const fields = (name, scope) => ({ chainId: manifest.chainId, ledger: manifest.contracts.GenesisLedgerV2, account: account[name].target, delegate: delegate[name].wallet.address,
        scope, guard, keyFile: owner[name].file });
      const permits = { OG: c2.readPermitFile(ctx, signPermit(dir, "permit-og", fields("OG", "submit-g0,confirm-tender"))),
        "cell-b": c2.readPermitFile(ctx, signPermit(dir, "permit-cell-b", fields("cell-b", "submit-g0"))) };
      // before the genesis the ledger takes no permit: the read-only check says so, and is made again once epoch 0 has begun
      const early = await c2.permitCheck(ctx, permits.OG, { operation: permitLib.OP.SUBMIT_G0 });
      expect([early.accepted, early.refused, early.epoch]).to.deep.equal([false, "NotStarted()", null]);
      await h.setTime(genesisTime);
      for (const [name, p] of Object.entries(permits)) {
        expect([p.message.account, p.message.delegate, p.message.notAfterEpoch, p.message.nonce, p.message.guard, p.message.guardBindingVersion, p.signatureKey])
          .to.deep.equal([account[name].target, delegate[name].wallet.address, 2n, 0n, guard, 1n, owner[name].wallet.address]);
        const checked = await c2.permitCheck(ctx, p, { operation: permitLib.OP.SUBMIT_G0 });
        expect([checked.accepted, checked.digestReturned, checked.accountHasCode, checked.guard.allows, checked.block.hashRechecked], name).to.deep.equal([true, p.digest, true, true, true]);
      }
      expect((await c2.permitCheck(ctx, permits.OG, { operation: permitLib.OP.CONFIRM_TENDER })).accepted).to.equal(true);
      // a block replaced after it was taken: the check finds the hash changed at the end and reports nothing
      const snap = await h.network.provider.send("evm_snapshot", []);
      await (await steward.sendTransaction({ to: steward.address, value: 1n })).wait();
      const pin = await g.pinBlock(ethers.provider, "latest");
      await h.network.provider.send("evm_revert", [snap]);
      await (await steward.sendTransaction({ to: steward.address, value: 2n })).wait();
      let moved = null;
      try { await c2.permitCheck(ctx, permits.OG, { operation: permitLib.OP.SUBMIT_G0, pin }); } catch (e) { moved = e; }
      expect(moved).to.be.instanceOf(g.SnapshotMoved);
      const outOfScope = await c2.permitCheck(ctx, permits["cell-b"], { operation: permitLib.OP.CONFIRM_TENDER });
      expect([outOfScope.accepted, outOfScope.refused.startsWith("OutOfScope")]).to.deep.equal([false, true]);
      const otherCaller = await c2.permitCheck(ctx, permits.OG, { operation: permitLib.OP.SUBMIT_G0, delegate: delegate["cell-b"].wallet.address });
      expect(otherCaller.refused.startsWith("NotDelegate")).to.equal(true);

      // epoch 0, the controlled self-test: each cell's audit job through its delegate; the OG's tender confirmed through the OG's delegate
      const run = async (name) => c2.runRecord(ctx, await c2.workG0(ctx, delegate[name].wallet, { permit: permits[name] }));
      const w0 = { OG: await run("OG"), "cell-b": await run("cell-b") };
      const b0 = c2.runRecord(ctx, await c2.confirmTender(ctx, delegate.OG.wallet, { tokenId, submissionId, permit: permits.OG }));
      for (const [name, r] of Object.entries(w0)) {
        expect([r.label, r.participant, r.sender, r.origin, r.receipt.authorization, r.status.verdict], name)
          .to.deep.equal(["delegated-by-owner-permit", account[name].target, delegate[name].wallet.address, delegate[name].wallet.address, permits[name].digest, "accepted"]);
      }
      expect([b0.label, b0.participant, b0.receipt.worker, b0.sender, b0.status.relation, b0.status.eligibility, b0.status.gmuMeasured, b0.status.gmuSubsidized])
        .to.deep.equal(["delegated-by-owner-permit", og, cb, delegate.OG.wallet.address, "declared-related", "delivered-before-genesis", "50", "0"]);

      // epoch 1, standard: the audit jobs again, each after the client's own audit of epoch 0 agreed and was complete
      await h.setTime(genesisTime + 7200n);
      const w1 = { OG: await run("OG"), "cell-b": await run("cell-b") };
      for (const r of Object.values(w1)) expect([r.epoch, r.status.verdict, r.work.audited, r.work.complete]).to.deep.equal(["1", "accepted", "0", true]);

      // after epoch 1: both epochs sealed and audited from the chain alone
      await h.setTime(genesisTime + 2n * 7200n + 5n);
      // the close records, by the steward (any key may write them; the delegates keep their gas for work)
      for (const e of [0, 1]) await (await ctx.ledger.connect(steward).seal(e)).wait();
      // the gas of each step, for the fee list of the package
      const gasOf = (r) => r.transactions.map((x) => `${x.step} ${x.gasUsed}`);
      if (process.env.R2B_GAS) console.log(JSON.stringify({ deployment: String(record.gasUsed), w0: [gasOf(w0.OG), gasOf(w0["cell-b"])], b0: gasOf(b0), w1: [gasOf(w1.OG), gasOf(w1["cell-b"])] }));
      const audits = [await a2.auditEpoch(ctx, 0n, { requireSealed: true }), await a2.auditEpoch(ctx, 1n, { requireSealed: true })];
      const figures = audits.map((a) => ({
        epoch: Number(a.epoch), mode: a.mode, ok: a.ok, receipts: a.receiptCount, budget: a.budget, pools: a.pools, allocated: a.allocated, unallocated: a.unallocated,
        measured: a.totals.measured, subsidized: a.totals.subsidized, delegated: a.entries.delegated, direct: a.entries.direct,
        workers: a.table.map((r) => ({ worker: r.worker === og ? "OG" : r.worker === cb ? "cell-b" : r.worker, operator: r.operator, measured: r.measured, subsidized: r.subsidized, allocation: r.allocation })),
      }));
      // the expected figures of docs/r2b-operation.md, section 6: in each epoch each cell's audit job is 10 GMU in G0, and each
      // cell takes 25 of the 100 points of G0 - the worker cap of 2500 basis points binds, and the two together are at the
      // operator cap of 5000; the tender, delivered before the genesis, is measured and earns nothing, so G1's 900 are unallocated
      const P = (n) => ethers.parseEther(String(n));
      const byAddress = (rows) => rows.sort((a, b) => ({ OG: og, "cell-b": cb }[a.worker].toLowerCase() < ({ OG: og, "cell-b": cb }[b.worker]).toLowerCase() ? -1 : 1));
      const cellRow = (worker, g1) => ({ worker, operator: 1, measured: [10n, g1], subsidized: [10n, 0n], allocation: P(25) });
      expect(g.jsonable(figures)).to.deep.equal(g.jsonable([
        { epoch: 0, mode: "controlled-self-test", ok: true, receipts: 3n, budget: P(1000), pools: [P(100), P(900)], allocated: P(50), unallocated: P(950),
          measured: [20n, 50n], subsidized: [20n, 0n], delegated: 3, direct: 0, workers: byAddress([cellRow("OG", 0n), cellRow("cell-b", 50n)]) },
        { epoch: 1, mode: "standard", ok: true, receipts: 2n, budget: P(1000), pools: [P(100), P(900)], allocated: P(50), unallocated: P(950),
          measured: [20n, 0n], subsidized: [20n, 0n], delegated: 2, direct: 0, workers: byAddress([cellRow("OG", 0n), cellRow("cell-b", 0n)]) },
      ]));
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  });
});
