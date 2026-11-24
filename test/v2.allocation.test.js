"use strict";

const { expect } = require("chai");
const t = require("./v2.helpers");
const { ethers, h, v2, PROFILE, POINTS } = t;

const OPEN = { maxSubsidizedPerDemander: 100000, maxSubsidizedPerPair: 100000 };
const sum = (list) => list.reduce((a, b) => a + b, 0n);

/// `units` receipts of 50 GMU for `worker` in the G1 pool, through the fixture's module.
async function work(d, worker, demander, units) {
  for (let i = 0; i < units; i++) await t.record(d, PROFILE.FREE, t.facts(d, { worker, demander }));
}

/// An epoch replayed from the ledger's log alone: the rolling digest, the totals, and each address's
/// and each operator's subsidized GMU, with the attribution the events carry.
async function replay(d, epoch) {
  const recorded = await d.ledger.queryFilter(d.ledger.filters.ReceiptRecorded(null, epoch));
  const statuses = new Map((await d.ledger.queryFilter(d.ledger.filters.ReceiptStatus())).map((ev) => [ev.args.id, v2.plainStatus(ev.args.status)]));
  let digest = ethers.ZeroHash;
  const totals = { measured: [0n, 0n], subsidized: [0n, 0n] };
  const workers = new Map(); const operators = new Map();
  for (const ev of recorded) {
    const r = v2.plainReceipt(ev.args.receipt); const st = statuses.get(ev.args.id); const operator = Number(ev.args.operator);
    digest = v2.digestStep(digest, ev.args.id, r, st, operator);
    totals.measured[r.pool] += st.gmuMeasured; totals.subsidized[r.pool] += st.gmuSubsidized;
    const w = workers.get(r.worker) ?? { operator, subsidized: [0n, 0n] };
    if (w.operator !== operator) throw new Error(`${r.worker} has two operators in epoch ${epoch}`);
    w.subsidized[r.pool] += st.gmuSubsidized; workers.set(r.worker, w);
    const o = operators.get(operator) ?? [0n, 0n];
    o[r.pool] += st.gmuSubsidized; operators.set(operator, o);
  }
  return { digest, totals, workers, operators, count: BigInt(recorded.length) };
}

/// The allocation table of an epoch from the replay and the epoch's parameters, by the client's arithmetic.
async function table(d, epoch) {
  const r = await replay(d, epoch);
  const [, q] = await d.policy.paramsFor(epoch);
  const budget = await d.policy.budgetFor(epoch);
  const g0 = (budget * q.splitG0Bps) / 10000n;
  const pools = [g0, budget - g0];
  const rows = new Map();
  for (const [worker, w] of r.workers) {
    const perPool = [0, 1].map((pool) => v2.share(pools[pool], w.subsidized[pool], r.operators.get(w.operator)[pool], r.totals.subsidized[pool], q.operatorCapBps, q.workerCapBps));
    rows.set(worker, { operator: w.operator, perPool, allocation: perPool[0] + perPool[1] });
  }
  const operatorShares = new Map([...r.operators].map(([operator, o]) => [operator,
    [0, 1].map((pool) => v2.operatorShare(pools[pool], o[pool], r.totals.subsidized[pool], q.operatorCapBps))]));
  return { ...r, q, budget, pools, rows, operatorShares };
}

/// Every figure of the ledger for the epoch against the replay, and the bounds the allocation promises.
async function agrees(d, epoch) {
  const tb = await table(d, epoch);
  const s = await d.ledger.epochSummary(epoch);
  expect(s.digest, "digest").to.equal(tb.digest);
  expect(s.receiptCount).to.equal(tb.count);
  expect([s.measuredG0, s.measuredG1, s.subsidizedG0, s.subsidizedG1]).to.deep.equal([...tb.totals.measured, ...tb.totals.subsidized]);
  expect(await d.ledger.auditSubject(epoch)).to.equal(v2.auditSubject(epoch, tb.digest, tb.count, tb.totals));
  for (const [worker, row] of tb.rows) {
    expect(await d.ledger.allocation(epoch, worker), `allocation of ${worker}`).to.equal(row.allocation);
    expect(await d.ledger.operatorAt(epoch, worker)).to.deep.equal([true, BigInt(row.operator)]);
  }
  for (const pool of [0, 1]) {
    const addressCap = (tb.pools[pool] * tb.q.workerCapBps) / 10000n;
    const operatorCap = (tb.pools[pool] * tb.q.operatorCapBps) / 10000n;
    for (const [operator, shares] of tb.operatorShares) {
      expect(await d.ledger.operatorShare(epoch, pool, operator)).to.equal(shares[pool]);
      expect(await d.ledger.subsidizedOfOperator(epoch, pool, operator)).to.equal(tb.operators.get(operator)[pool]);
      expect(shares[pool] <= operatorCap, "an operator's share is within the operator cap").to.equal(true);
      const ofOperator = sum([...tb.rows.values()].filter((r) => r.operator === operator).map((r) => r.perPool[pool]));
      expect(ofOperator <= shares[pool], "the addresses of an operator are allocated no more than the operator's share").to.equal(true);
    }
    for (const row of tb.rows.values()) expect(row.perPool[pool] <= addressCap, "an address is within the address cap").to.equal(true);
    expect(sum([...tb.rows.values()].map((r) => r.perPool[pool])) <= tb.pools[pool], "a pool is not over-allocated").to.equal(true);
  }
  return tb;
}

describe("Ledger v2: the cap on a declared operator's aggregate", () => {
  it("allocates to the addresses of one operator no more than the operator cap, in proportion to their GMU (L21)", async () => {
    const [, a1, a2, a3, b, demander] = await ethers.getSigners();
    const d = await t.deploy({
      admit: [a1, a2, a3, b, demander], operators: { [a1.address]: 9, [a2.address]: 9, [a3.address]: 9, [b.address]: 8 },
      params: { ...OPEN, workerCapBps: 2500, operatorCapBps: 2500 }, g1Cap: 100000n,
    });
    await work(d, a1, demander, 3);
    await work(d, a2, demander, 2);
    await work(d, a3, demander, 1);
    await work(d, b, demander, 2);
    await h.toEpoch(d, 1);
    const tb = await agrees(d, 0);

    // G1 pool of 300 points; operator 9 has 300 of 400 GMU and is capped at a quarter of the pool
    expect(tb.pools[1]).to.equal(300n * POINTS);
    expect(await d.ledger.operatorShare(0, 1, 9)).to.equal(75n * POINTS);
    const of9 = [a1, a2, a3].map((w) => tb.rows.get(w.address).allocation);
    expect(of9).to.deep.equal([37_500000000000000000n, 25n * POINTS, 12_500000000000000000n]);
    expect(sum(of9)).to.equal(75n * POINTS);
    expect(tb.rows.get(b.address).allocation).to.equal(75n * POINTS);
    // under the address cap alone the three addresses would have been allocated 75, 75 and 37.5: two and a half times as much
    const perAddress = [150n, 100n, 50n].map((gmu) => { const raw = (300n * POINTS * gmu) / 400n; return raw > 75n * POINTS ? 75n * POINTS : raw; });
    expect(sum(perAddress)).to.equal(187_500000000000000000n);
    // what the caps withheld is allocated to nobody
    expect(sum([...tb.rows.values()].map((r) => r.allocation))).to.equal(150n * POINTS);
    expect(await d.ledger.allocation(0, demander.address)).to.equal(0n);
  });

  it("lets an operator with more addresses take more when the operator cap is above the address cap, and no more than the operator cap (L22)", async () => {
    const scenario = async (split) => {
      const [, x1, x2, y, demander] = await ethers.getSigners();
      const d = await t.deploy({
        admit: [x1, x2, y, demander], operators: { [x1.address]: 9, [x2.address]: 9, [y.address]: 8 },
        params: { ...OPEN, workerCapBps: 2500, operatorCapBps: 5000 }, g1Cap: 100000n,
      });
      // operator 9 has 200 GMU either way: on one address, or 100 on each of two
      if (split) { await work(d, x1, demander, 2); await work(d, x2, demander, 2); } else { await work(d, x1, demander, 4); }
      await work(d, y, demander, 4);
      await h.toEpoch(d, 1);
      const tb = await agrees(d, 0);
      return { ofOperator: (await d.ledger.allocation(0, x1.address)) + (await d.ledger.allocation(0, x2.address)), share: tb.operatorShares.get(9)[1] };
    };
    const one = await scenario(false);
    const two = await scenario(true);
    // the same GMU and the same operator share, a half of the pool; one address is held to a quarter, two addresses reach the half
    expect([one.share, two.share]).to.deep.equal([150n * POINTS, 150n * POINTS]);
    expect(one.ofOperator).to.equal(75n * POINTS);
    expect(two.ofOperator).to.equal(150n * POINTS);
    expect(two.ofOperator <= two.share).to.equal(true);
    // so "splitting gains nothing" holds only with the operator cap at or below the address cap: both caps are validated as shares of a pool, their relation is a deployment's choice
    const [steward] = await ethers.getSigners();
    const Policy = await ethers.getContractFactory("GenesisPolicyV2");
    const genesis = (await h.now()) + 1000n;
    for (const bad of [{ operatorCapBps: 0 }, { operatorCapBps: 10001 }, { workerCapBps: 0 }]) {
      await t.refuses(Policy.deploy(steward.address, genesis, 3600, { ...t.DEFAULT_PARAMS, ...bad }), "BadParams");
    }
    await (await Policy.deploy(steward.address, genesis, 3600, { ...t.DEFAULT_PARAMS, operatorCapBps: 10000, workerCapBps: 1 })).waitForDeployment();
  });

  it("rounds every term down, allocates the remainder to nobody, and divides by nothing that is zero (L23)", async () => {
    const [, w1, w2, w3, unadmitted, idle, demander, sameOperatorIdle] = await ethers.getSigners();
    const d = await t.deploy({
      admit: [w1, w2, w3, idle, demander, sameOperatorIdle], operators: { [w1.address]: 1, [w2.address]: 2, [w3.address]: 3, [sameOperatorIdle.address]: 3 },
      // a budget of 1,001 of the smallest unit, split 3,333 to 6,667, and no cap that binds
      params: { ...OPEN, budgetBase: 1001n, splitG0Bps: 3333, workerCapBps: 10000, operatorCapBps: 10000, minBountyWei: 0 }, g1Cap: 100000n,
    });
    await work(d, w1, demander, 1);
    await work(d, w2, demander, 2);
    await work(d, w3, demander, 3);
    await work(d, unadmitted, demander, 2);                 // measured, not subsidized
    await t.record(d, PROFILE.FREE, t.facts(d, { worker: sameOperatorIdle, demander: sameOperatorIdle })); // of operator 3, self-dealing: no subsidized GMU
    await h.toEpoch(d, 2); // epoch 1 passes without a receipt
    const tb = await agrees(d, 0);

    expect(tb.pools).to.deep.equal([333n, 668n]);
    // 668 * 50 / 300, 668 * 100 / 300, 668 * 150 / 300, each rounded down
    expect([w1, w2, w3].map((w) => tb.rows.get(w.address).allocation)).to.deep.equal([111n, 222n, 334n]);
    expect(sum([...tb.rows.values()].map((r) => r.allocation))).to.equal(667n); // one unit of the pool is nobody's
    // zero cases, none of which divides by zero: an address with measured GMU only; an address of an
    // operator that has subsidized GMU while the address has none; an address with no receipt; the
    // G0 pool, which nobody worked in; an operator nobody belongs to; an epoch without receipts
    expect(await d.ledger.measuredOf(0, 1, unadmitted.address)).to.equal(100n);
    expect(await d.ledger.allocation(0, unadmitted.address)).to.equal(0n);
    expect(await d.ledger.operatorAt(0, sameOperatorIdle.address)).to.deep.equal([true, 3n]);
    expect(await d.ledger.allocation(0, sameOperatorIdle.address)).to.equal(0n);
    expect(await d.ledger.allocation(0, idle.address)).to.equal(0n);
    expect((await d.ledger.epochSummary(0)).subsidizedG0).to.equal(0n);
    expect(await d.ledger.operatorShare(0, 0, 1)).to.equal(0n);
    expect(await d.ledger.operatorShare(0, 1, 77)).to.equal(0n);
    expect(await d.ledger.operatorShare(0, 1, 0)).to.equal(0n);
    for (const w of [w1, idle]) expect(await d.ledger.allocation(1, w.address)).to.equal(0n);
    expect(await d.ledger.operatorShare(1, 1, 1)).to.equal(0n);
    await t.refuses(d.ledger.operatorShare(0, 2, 1), "WrongPool");
    // a running epoch has a provisional figure and no allocation
    await t.refuses(d.ledger.allocation(2, w1.address), "EpochNotEnded");
    expect(await d.ledger.provisionalAllocation(2, w1.address)).to.equal(0n);
  });

  it("fixes the attribution when a receipt is recorded: a later declaration moves no past allocation (L24)", async () => {
    const [, a1, a2, b, demander, declaredIdle] = await ethers.getSigners();
    const d = await t.deploy({
      admit: [a1, a2, b, demander, declaredIdle], operators: { [a1.address]: 9, [a2.address]: 9, [b.address]: 8, [declaredIdle.address]: 9 },
      params: { ...OPEN, workerCapBps: 2500, operatorCapBps: 2500 }, g1Cap: 100000n,
    });
    await work(d, a1, demander, 2);
    await work(d, a2, demander, 2);
    await work(d, b, demander, 1);
    await h.toEpoch(d, 1);
    const before = await agrees(d, 0);
    const frozen = [a1, a2, b].map((w) => before.rows.get(w.address).allocation);
    expect(frozen).to.deep.equal([37_500000000000000000n, 37_500000000000000000n, 60n * POINTS]);

    // epoch 1: the steward moves a2 to the other operator. It applies from epoch 2, not within epoch 1
    await (await d.policy.declareOperator(a2.address, 8)).wait();
    expect(await d.policy.operatorOf(a2.address)).to.equal(9n);
    await work(d, a2, demander, 1);
    expect(await d.ledger.operatorAt(1, a2.address)).to.deep.equal([true, 9n]);
    await h.toEpoch(d, 2);
    expect(await d.policy.operatorOf(a2.address)).to.equal(8n);
    await work(d, a2, demander, 1);
    await work(d, b, demander, 1);
    await h.toEpoch(d, 3);

    // every epoch is allocated with the attribution it was recorded with
    expect(await d.ledger.operatorAt(0, a2.address)).to.deep.equal([true, 9n]);
    expect(await d.ledger.operatorAt(2, a2.address)).to.deep.equal([true, 8n]);
    expect(await Promise.all([a1, a2, b].map((w) => d.ledger.allocation(0, w.address)))).to.deep.equal(frozen);
    expect(await d.ledger.auditSubject(0)).to.equal(v2.auditSubject(0n, before.digest, before.count, before.totals));
    await agrees(d, 1);
    const last = await agrees(d, 2);
    // in epoch 2 the two addresses of operator 8 share that operator's capped share
    expect(last.rows.get(a2.address).allocation + last.rows.get(b.address).allocation).to.equal(75n * POINTS);

    // an address without a receipt in an epoch has no attribution there: that is not "undeclared"
    expect(await d.policy.operatorOf(declaredIdle.address)).to.equal(9n);
    expect(await d.ledger.operatorAt(0, declaredIdle.address)).to.deep.equal([false, 0n]);
    expect(await d.ledger.operatorAt(1, b.address)).to.deep.equal([false, 0n]);
    expect(await d.ledger.operatorAt(7, a1.address)).to.deep.equal([false, 0n]);
  });

  it("agrees with a replay of its own log on every figure, for scenarios drawn at random (L21 to L24, as properties)", async function () {
    this.timeout(300000);
    const signers = (await ethers.getSigners()).slice(1);
    for (const seed of [11, 23, 37, 59]) {
      let state = seed;
      const rnd = (n) => { state = (state * 1103515245 + 12345) % 2147483648; return state % n; }; // a fixed sequence: the scenarios repeat
      const workers = signers.slice(0, 8);
      const demander = signers[8];
      const operators = Object.fromEntries(workers.map((w) => [w.address, rnd(4)])); // 0 = undeclared
      const admitted = workers.filter(() => rnd(5) !== 0);
      const d = await t.deploy({
        admit: [...admitted, demander], operators,
        params: {
          ...OPEN, budgetBase: 10n ** 18n * BigInt(1 + rnd(999)) + BigInt(rnd(1000)), splitG0Bps: rnd(10001),
          workerCapBps: 1 + rnd(10000), operatorCapBps: 1 + rnd(10000),
        },
        g1Cap: BigInt(50 * (1 + rnd(6))), echoCap: BigInt(10 * (1 + rnd(2))),
      });
      for (const epoch of [0, 1]) {
        if (epoch === 1) await h.toEpoch(d, 1);
        for (const w of workers) {
          for (let job = 0; job < rnd(3); job++) await t.submitDirect(d, w, { profile: PROFILE.ECHO, jobIndex: job });
          await work(d, w, rnd(7) === 0 ? w : demander, rnd(5));
        }
      }
      await h.toEpoch(d, 2);
      for (const epoch of [0, 1]) {
        const tb = await agrees(d, epoch);
        expect(tb.count > 0n, `seed ${seed}, epoch ${epoch}: the scenario has receipts`).to.equal(true);
      }
    }
  });
});
