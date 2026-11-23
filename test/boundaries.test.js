"use strict";

const fs = require("fs");
const path = require("path");
const { expect } = require("chai");
const h = require("./helpers");
const { ethers, g } = h;
const { sources, deployable, abiOf, buildOf } = require("../scripts/export-abi");

const root = path.join(__dirname, "..");
const artifactAbi = (rel) => JSON.parse(fs.readFileSync(path.join(root, "artifacts", "contracts", rel), "utf8")).abi;
const KERNEL = {
  GenesisPolicy: artifactAbi("GenesisPolicy.sol/GenesisPolicy.json"),
  GenesisLedger: artifactAbi("GenesisLedger.sol/GenesisLedger.json"),
  TenderAdapter8414: artifactAbi("TenderAdapter8414.sol/TenderAdapter8414.json"),
  AuditV1: artifactAbi("functions/AuditV1.sol/AuditV1.json"),
  PrevBlockSeedSource: artifactAbi("seed/PrevBlockSeedSource.sol/PrevBlockSeedSource.json"),
  L1BlockSeedSource: artifactAbi("seed/L1BlockSeedSource.sol/L1BlockSeedSource.json"),
};
const writers = (abi) => abi.filter((f) => f.type === "function" && f.stateMutability !== "view" && f.stateMutability !== "pure").map((f) => f.name).sort();

function files(dir, skip) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    const rel = path.relative(root, full);
    if (skip.some((s) => rel === s || rel.startsWith(`${s}${path.sep}`))) continue;
    if (entry.isDirectory()) out.push(...files(full, skip));
    else out.push(full);
  }
  return out;
}

describe("Boundaries: what the kernel is and is not", () => {
  it("ships client ABIs that are the compiled interfaces", () => {
    for (const name of Object.keys(sources)) {
      const shipped = JSON.parse(fs.readFileSync(path.join(root, "client", "abi", `${name}.json`), "utf8"));
      expect(shipped, `client/abi/${name}.json is stale: run npm run export-abi`).to.deep.equal(abiOf(name));
    }
  });

  it("ships builds that are what the sources compile to: a deployment made from build/ is this repository's code", () => {
    for (const name of Object.keys(deployable)) {
      const shipped = fs.readFileSync(path.join(root, "build", `${name}.json`), "utf8");
      expect(shipped, `build/${name}.json is stale: run npm run export-abi`).to.equal(`${JSON.stringify(buildOf(name), null, 2)}\n`);
      const build = JSON.parse(shipped);
      // the pinned compiler, and the positions of the immutable values inside the runtime code
      expect(build.compiler.version.startsWith(`${require("solc/package.json").version}+commit.`), `${name}: compiler ${build.compiler.version}`).to.equal(true);
      for (const [start, length] of build.immutableReferences) {
        expect(build.deployedBytecode.slice(2 + 2 * start, 2 + 2 * (start + length)), `${name}: an immutable position that is not blank in the build`).to.match(/^0+$/);
      }
    }
    // nothing under contracts/testing or contracts/vendor is ever deployed from here
    expect(Object.values(deployable).some((rel) => rel.includes("/testing/") || rel.includes("/vendor/"))).to.equal(false);
  });

  it("changes state through these functions and no others: nothing edits a receipt, a verdict, a total or an allocation (X6)", () => {
    expect(writers(KERNEL.GenesisLedger)).to.deep.equal(["openEpoch", "recordG1", "seal", "submitG0"]);
    expect(writers(KERNEL.GenesisPolicy)).to.deep.equal([
      "acceptStewardship", "declareOperator", "registerParams", "registerProfile", "retireProfile", "setAdmission", "setPaused",
      "transferStewardship",
    ]);
    expect(writers(KERNEL.TenderAdapter8414)).to.deep.equal(["bridge"]);
    for (const name of ["AuditV1", "PrevBlockSeedSource", "L1BlockSeedSource"]) expect(writers(KERNEL[name]), name).to.deep.equal([]);
  });

  it("keeps no balance, issues no token, pays nothing and offers nothing to claim (X11)", async () => {
    const tokenLike = /^(transfer|transferFrom|approve|allowance|balanceOf|totalSupply|(mint|burn|claim|redeem|withdraw|deposit|payout|distribute)\w*)$/i;
    for (const [name, abi] of Object.entries(KERNEL)) {
      for (const f of abi) {
        expect(f.type, `${name} has a ${f.type}`).to.not.be.oneOf(["receive", "fallback"]);
        if (f.type !== "function" && f.type !== "constructor") continue;
        expect(f.stateMutability, `${name}.${f.name ?? "constructor"} takes value`).to.not.equal("payable");
        if (f.type === "function") expect(tokenLike.test(f.name), `${name}.${f.name} looks like a balance or a payment`).to.equal(false);
      }
    }
    // and they cannot be sent value
    const [, w1] = await ethers.getSigners();
    const d = await h.deploy({ admit: [w1] });
    for (const c of [d.ledger, d.policy, d.adapter, d.audit, d.seedSource]) {
      let refused = false;
      try { await (await w1.sendTransaction({ to: await c.getAddress(), value: 1n })).wait(); } catch { refused = true; }
      expect(refused).to.equal(true);
      expect(await ethers.provider.getBalance(await c.getAddress())).to.equal(0n);
    }
    // test points exist only as the value of a view
    await h.submitAudit(d, w1);
    await h.toEpoch(d, 1);
    expect(await d.ledger.allocation(0, w1.address)).to.equal(175n * h.POINTS);
  });

  it("names no chain and no party in its code: addresses arrive by constructor, the chain by its id at deployment (A13)", () => {
    const skip = ["contracts/vendor", "contracts/testing"].map((s) => s.split("/").join(path.sep));
    const seen = [];
    for (const file of files(path.join(root, "contracts"), skip)) {
      const text = fs.readFileSync(file, "utf8");
      const rel = path.relative(root, file).split(path.sep).join("/");
      for (const m of text.matchAll(/0x[0-9a-fA-F]{40}\b/g)) seen.push(`${rel}: ${m[0]}`);
      expect(/\b(85422|8454)\b/.test(text), `${rel} names a Finchain chain id`).to.equal(false);
      expect(/delegatecall|selfdestruct|upgradeTo/.test(text), `${rel} has an upgrade or destruction path`).to.equal(false);
    }
    // the one address in the code is the OP Stack's L1Block predeploy, inside the seed source written for OP Stack chains
    expect(seen).to.deep.equal(["contracts/seed/L1BlockSeedSource.sol: 0x4200000000000000000000000000000000000015"]);
  });

  it("is written in one language: no CJK text in any file of the repository", () => {
    const skip = ["node_modules", "artifacts", "cache", "out", ".git"];
    // CJK ranges by code point, so that this file itself stays plain ASCII
    const ranges = [[0x2e80, 0x9fff], [0xf900, 0xfaff], [0xff00, 0xffef]];
    const cjk = new RegExp(`[${ranges.map(([a, b]) => `${String.fromCodePoint(a)}-${String.fromCodePoint(b)}`).join("")}]`);
    const offenders = [];
    for (const file of files(root, skip)) {
      if (cjk.test(fs.readFileSync(file, "utf8"))) offenders.push(path.relative(root, file));
    }
    expect(offenders).to.deep.equal([]);
  });

  it("tests the adapter against the standard's own reference contract, byte for byte as pinned", () => {
    const dir = path.join(root, "contracts", "vendor", "erc8414");
    const sums = fs.readFileSync(path.join(dir, "SHA256SUMS"), "utf8").trim().split("\n").map((l) => l.trim().split(/\s+/));
    expect(sums.length).to.equal(6);
    for (const [sum, file] of sums) {
      const actual = require("crypto").createHash("sha256").update(fs.readFileSync(path.join(dir, file))).digest("hex");
      expect(actual, `contracts/vendor/erc8414/${file} differs from the pinned source`).to.equal(sum);
    }
    expect(fs.readFileSync(path.join(dir, "NOTICE"), "utf8")).to.contain("b3da62e761b00ef0921860f353d7eed24c6c85ae");
    // nothing of the protocol imports the vendored contract
    const skip = ["contracts/vendor", "contracts/testing"].map((s) => s.split("/").join(path.sep));
    for (const file of files(path.join(root, "contracts"), skip)) {
      expect(fs.readFileSync(file, "utf8").includes("vendor/"), path.relative(root, file)).to.equal(false);
    }
  });

  it("derives the ledger's domain from the chain and the deployment, never from a constant", async () => {
    const d = await h.deploy();
    const { chainId } = await ethers.provider.getNetwork();
    expect(await d.ledger.domain()).to.equal(g.ledgerDomain(chainId, await d.ledger.getAddress()));
  });
});
