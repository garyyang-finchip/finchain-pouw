#!/usr/bin/env node
// One operator's round on a deployment: whatever is due now, for two wallets the operator holds.
"use strict";

const fs = require("fs");
const path = require("path");
const { ethers } = require("ethers");
const g = require("../client/lib/genesis");
const c = require("./lib/common");
const { stageTender } = require("./lib/tender");

const USAGE = `usage: node scripts/round.js --config <file> --keys <directory> [--wait]

Does what is due now on a deployment, for the two wallets the configuration's round names:
  - in each of the round's epochs: one test tender in each direction on the ERC-8414 contract
    (minted, funded, delivered, accepted), each confirmed to the ledger by its owner (g1.tender),
    and the epoch's audit job by each wallet (g0.ref);
  - the close record of every epoch of the round that has ended.
Whatever is done already is found on chain and left alone: run it as often as you like. Run it once
in every epoch of the round, and once more after the last one has ended.

  --config <file>     the deployment's configuration (its "round" section names the wallets)
  --keys <directory>  where scripts/keys.js made the wallets' keys
  --manifest <file>   the deployment manifest (default: out/<name>/manifest.json)
  --wait              from epoch 1 on, the audit job needs the previous epoch settled: wait for it
                      instead of stopping with exit status 3
  --epochs <n>        work in epochs 0 .. n-1 (default: the configuration's round.epochs, else 2)
  --rpc <url>         JSON-RPC endpoint (or POUW_RPC, else the manifest's rpc)
  --tag <tag>         block treated as settled: finalized (default), safe, latest, or a number
  --out <directory>   where the records go (default: out/<name>)

Exit status: 0 everything due is done; 3 something waits for the settled block (run again later);
1 failure. Both wallets belong to whoever runs this: what a round shows is that the mechanism works
on this chain, not that anybody else took part.`;

const MIN_LEFT = 300n; // seconds an epoch must still have for new work to be started in it
const GAS_MARGIN = ethers.parseEther("0.0005"); // what a wallet should hold for gas before a tender is begun

/// The receipt, if any, that `demander` already confirmed for `worker` in `epoch`.
async function bridgedReceipt(ctx, epoch, demander, worker) {
  const head = (await ctx.provider.getBlock("latest")).number;
  const found = (await g.readEpochReceipts(ctx, epoch, head))
    .filter((it) => it.receipt.pool === g.POOL_G1 && it.receipt.counterparty === demander && it.receipt.worker === worker);
  return found[0] ?? null;
}

const statusLine = (st) => `${g.VERDICT_NAME[st.verdict]}, ${g.INELIGIBLE_NAME[st.ineligible]}, GMU ${st.gmuSubsidized}/${st.gmuMeasured}`;

async function main() {
  const opts = c.parse(process.argv.slice(2), ["wait"]);
  if (opts.help) { console.log(USAGE); return 0; }
  const config = c.readJson(c.need(opts.config, "--config"));
  const keys = c.expand(c.need(opts.keys, "--keys"));
  const out = opts.out ? c.expand(opts.out) : path.join(c.root, "out", config.name);
  const manifestPath = opts.manifest ? c.expand(opts.manifest) : path.join(out, "manifest.json");
  if (!fs.existsSync(manifestPath)) throw new Error(`no manifest at ${manifestPath}: deploy first, or name it with --manifest`);
  const manifest = c.readJson(manifestPath);
  const rpc = c.need(opts.rpc ?? process.env.POUW_RPC ?? manifest.rpc ?? config.rpc, "--rpc (or POUW_RPC, or the manifest's rpc)");
  const provider = c.connectRpc(rpc);
  const tag = opts.tag === undefined ? "finalized" : (/^\d+$/.test(opts.tag) ? Number(opts.tag) : opts.tag);
  const ctx = await g.connect(manifest, provider, { tag, logChunk: opts["log-chunk"] ?? process.env.POUW_LOG_CHUNK });

  const round = config.round ?? {};
  const names = round.parties ?? [];
  if (names.length !== 2) throw new Error("the configuration's round must name two wallets (round.parties)");
  const parties = names.map((name) => { const wallet = c.walletOf(keys, name, provider); return { name, wallet, address: wallet.address }; });
  const [a, b] = parties;
  const rounds = BigInt(opts.epochs ?? round.epochs ?? 2);
  const reward = ethers.parseEther(String(round.rewardEth ?? "0.001"));
  const tenderAddress = manifest.external?.taskToken8414?.address;
  if (!tenderAddress) throw new Error("the manifest names no ERC-8414 contract");
  c.writableDir(out);
  const statePath = path.join(out, "round-state.json");
  // what was begun and not finished, so that a run that was interrupted is carried on. It belongs to
  // one deployment: a file left by another one is not read
  let state = fs.existsSync(statePath) ? c.readJson(statePath) : null;
  if (!state || state.ledger !== ctx.ledger.target) state = { ledger: ctx.ledger.target, tenders: {} };
  const save = () => c.writeJson(statePath, state);

  const did = []; const found = []; const waiting = []; const next = [];
  const say = (line) => console.log(line);
  const record = {
    schema: "finchain-pouw.round/1", environment: manifest.environment ?? "unspecified", labels: manifest.labels ?? [], deployment: manifest.name,
    chainId: ctx.chainId, ledger: ctx.ledger.target, endpointHost: c.endpointHost(rpc), settledTag: String(tag), recordedAt: new Date().toISOString(),
    client: { name: "finchain-pouw", version: c.version() }, host: c.hostInfo(),
    parties: [], epoch: null, mode: null, did, found, waiting, next,
  };
  const finish = (code) => {
    const file = c.freshPath(out, "round");
    c.writeJson(file, g.jsonable(record));
    say(`record ${file}`);
    return code;
  };

  say(`${manifest.name} (${[manifest.environment, ...(manifest.labels ?? [])].join(", ")}) on chain ${ctx.chainId}, ledger ${ctx.ledger.target}`);
  if (!(await ctx.policy.started())) {
    next.push(`epoch 0 begins ${c.iso(ctx.genesisTime)}: run this command then, before ${c.iso(ctx.genesisTime + ctx.epochDuration)}`);
    say(`not started. ${next[0]}`);
    return finish(3);
  }
  const epoch = await ctx.policy.currentEpoch();
  record.epoch = epoch;
  const end = g.epochEnd(ctx, epoch);

  // the close record of every ended epoch of the round that has none yet
  record.missed = [];
  for (let e = 0n; e < epoch && e < rounds; e++) {
    const s = await ctx.ledger.epochSummary(e);
    if (s.receiptCount === 0n) {
      record.missed.push(e);
      say(`  NOTE: epoch ${e} of the round ended with no receipt: nothing was done in it, and nothing can be added to it now`);
    }
    if (s.isSealed) continue;
    const rc = await (await ctx.ledger.connect(a.wallet).seal(e)).wait();
    did.push({ step: "close", epoch: e, by: a.address, txHash: rc.hash, block: rc.blockNumber, gasUsed: rc.gasUsed });
    say(`  epoch ${e}: close record written (tx ${rc.hash})`);
  }

  if (epoch < rounds) {
    const [paramsVersion, params] = await ctx.policy.paramsFor(epoch);
    record.mode = params.subsidizeDeclaredRelated ? "controlled-self-test" : "standard";
    say(`epoch ${epoch} (${record.mode}, parameters v${paramsVersion}), ends ${c.iso(end)}`);
    const left = end - BigInt((await provider.getBlock("latest")).timestamp);
    const startWork = left >= MIN_LEFT;
    if (!startWork) say(`  only ${left} s of the epoch are left: no new work is started in it`);

    // g1.tender: one test tender in each direction, confirmed by its owner
    for (const [x, y] of [[a, b], [b, a]]) {
      const have = await bridgedReceipt(ctx, epoch, x.address, y.address);
      if (have) {
        found.push({ step: "tender", demander: x.address, worker: y.address, receiptId: have.id, status: have.status });
        say(`  tender ${x.name} -> ${y.name}: receipt ${have.id} is there (${statusLine(have.status)})`);
        continue;
      }
      const key = `${epoch}:${x.address}:${y.address}`;
      if (!startWork && !state.tenders[key]) continue;
      // the demander escrows the bounty and both pay gas: said before the first transaction, not after it fails
      for (const [p, needs] of [[x, reward + GAS_MARGIN], [y, GAS_MARGIN]]) {
        const balance = await provider.getBalance(p.address);
        if (balance < needs) throw new Error(`${p.name} (${p.address}) holds ${ethers.formatEther(balance)}; this tender needs it to hold ${ethers.formatEther(needs)}`);
      }
      state.tenders[key] ??= {};
      const t = await stageTender({ tenderAddress, demander: x.wallet, worker: y.wallet, reward, judgmentWindow: round.judgmentWindow ?? 3600,
        label: `${manifest.name}:${ctx.ledger.target}:${epoch}:${x.address}:${y.address}`, state: state.tenders[key], save });
      const r = await g.bridgeTender(ctx, x.wallet, { tokenId: t.tokenId, submissionId: t.submissionId });
      did.push({ step: "tender", demander: x.address, worker: y.address, tokenId: t.tokenId, submissionId: t.submissionId, reward, tender: t.steps,
        bridge: { receiptId: r.receiptId, epoch: r.epoch, eligibility: g.INELIGIBLE_NAME[r.status.ineligible], relation: g.RELATION_NAME[r.status.relation],
          gmuMeasured: r.status.gmuMeasured, gmuSubsidized: r.status.gmuSubsidized, txHash: r.txHash, gasUsed: r.gasUsed } });
      say(`  tender ${x.name} -> ${y.name}: tender ${t.tokenId}, submission ${t.submissionId}; receipt ${r.receiptId} in epoch ${r.epoch} (${statusLine(r.status)}, ${g.RELATION_NAME[r.status.relation]})`);
      if (r.epoch !== epoch) say(`    NOTE: the confirmation landed in epoch ${r.epoch}, not in epoch ${epoch}`);
    }

    // g0.ref: each wallet's audit job. From epoch 1 on it recomputes the previous epoch, which must be settled
    let settled = true;
    if (epoch > 0n) {
      const pause = Number(process.env.POUW_WAIT_MS ?? 60000);
      for (let failures = 0; ;) {
        try {
          const h = await g.horizon(ctx);
          const short = g.epochEnd(ctx, epoch - 1n) - h.timestamp;
          if (short <= 0n) break;
          if (!opts.wait) { settled = false; break; }
          if ((await ctx.policy.currentEpoch()) !== epoch) throw new Error(`epoch ${epoch} ended while waiting for epoch ${epoch - 1n} to settle: run the command again`);
          say(`  waiting: the ${tag} block is ${short} s short of the end of epoch ${epoch - 1n}`);
          failures = 0;
        } catch (e) {
          // a long wait outlives a dropped connection: the endpoint is asked again, a few times
          if (/ended while waiting/.test(e.message) || ++failures > 10) throw e;
          say(`  waiting: the endpoint did not answer (${e.shortMessage ?? e.message}); asking again`);
        }
        await c.sleep(pause);
      }
    }
    for (const p of parties) {
      const id = await ctx.ledger.receiptOfContribution(g.g0ContributionId(ctx.domain, g.AUDIT_V1_FUNCTION_ID, epoch, 0, p.address));
      if (id !== 0n) {
        const st = g.plainStatus(await ctx.ledger.status(id));
        found.push({ step: "work", worker: p.address, receiptId: id, status: st });
        say(`  audit job of ${p.name}: receipt ${id} is there (${statusLine(st)})`);
        continue;
      }
      if (!settled) {
        const h = await g.horizon(ctx);
        const short = g.epochEnd(ctx, epoch - 1n) - h.timestamp;
        waiting.push({ step: "work", worker: p.address, reason: `the ${tag} block is ${short} s short of the end of epoch ${epoch - 1n}` });
        say(`  audit job of ${p.name}: waits - the ${tag} block is ${short} s short of the end of epoch ${epoch - 1n}`);
        continue;
      }
      if (!startWork) continue;
      const r = await g.workAudit(ctx, p.wallet, { expectEpoch: epoch });
      did.push({ step: "work", worker: p.address, epoch: r.epoch, audited: r.audited, receiptsAudited: r.receiptsAudited, auditedTableHash: r.auditedTableHash,
        receiptId: r.receiptId, verdict: g.VERDICT_NAME[r.status.verdict], eligibility: g.INELIGIBLE_NAME[r.status.ineligible],
        gmuMeasured: r.status.gmuMeasured, gmuSubsidized: r.status.gmuSubsidized, txHash: r.txHash, gasUsed: r.gasUsed });
      say(`  audit job of ${p.name}: audited ${r.audited === null ? "the deployment's configuration" : `epoch ${r.audited} (${r.receiptsAudited} receipts)`}; receipt ${r.receiptId} (${statusLine(r.status)})`);
    }

    const s = await ctx.ledger.epochSummary(epoch);
    for (const p of parties) {
      const provisional = await ctx.ledger.provisionalAllocation(epoch, p.address);
      record.parties.push({ name: p.name, address: p.address, admitted: await ctx.policy.isAdmitted(p.address), operator: await ctx.policy.operatorOf(p.address), provisional });
      say(`  ${p.name} ${p.address}: provisional ${ethers.formatUnits(provisional, 18)} test points`);
    }
    record.summary = { receipts: s.receiptCount, measured: { g0: s.measuredG0, g1: s.measuredG1 }, subsidized: { g0: s.subsidizedG0, g1: s.subsidizedG1 } };
    if (waiting.length > 0) next.push(`run this command again once the ${tag} block has passed ${c.iso(g.epochEnd(ctx, epoch - 1n))} - before ${c.iso(end)}, when epoch ${epoch} ends`);
    else if (epoch + 1n < rounds) next.push(`epoch ${epoch + 1n} runs from ${c.iso(end)} to ${c.iso(end + ctx.epochDuration)}: run this command again in it. Its audit job needs the ${tag} block past ${c.iso(end)}; with --wait the command waits for that`);
    else next.push(`epoch ${epoch} ends ${c.iso(end)}: run this command once more after that, for its close record`);
  } else {
    for (const p of parties) record.parties.push({ name: p.name, address: p.address });
    const last = rounds - 1n;
    next.push(`the round's epochs 0-${last} are closed. Audit each one once the ${tag} block has passed its end (epoch ${last}: ${c.iso(g.epochEnd(ctx, last))}): node client/pouw.js audit <epoch> --manifest ${path.relative(process.cwd(), manifestPath) || manifestPath}`);
    say(`epoch ${epoch}: the round's epochs are over`);
  }

  for (const line of next) say(`next: ${line}`);
  return finish(waiting.length > 0 ? 3 : 0);
}

c.run(main, "round", g.refusal);
