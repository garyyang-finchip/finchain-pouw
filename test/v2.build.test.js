"use strict";

// The compile boundary of ledger v2 and its builds (docs/ledger-v2.md 1; docs/decisions.md A82).
// The v2 contracts are compiled apart from the kernel, by a compiler of their own, and what a
// deployment of v2 is made from is committed under build/v2 with a record of how it was made.

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { execFileSync } = require("child_process");
const { expect } = require("chai");
const hre = require("hardhat");
const { deployableV2, buildOfV2, buildRecordV2, V2_COMPILER_PACKAGE, CODE_SIZE_LIMIT } = require("../scripts/export-abi");

const root = path.join(__dirname, "..");
const KERNEL = require("solc/package.json").version;
const V2 = require(`${V2_COMPILER_PACKAGE}/package.json`).version;
const sha256 = (bytes) => crypto.createHash("sha256").update(bytes).digest("hex");
const slash = (p) => p.split(path.sep).join("/");

function solidity(dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...solidity(full));
    else if (entry.name.endsWith(".sol")) out.push(slash(path.relative(root, full)));
  }
  return out.sort();
}
const pragmas = (text) => [...text.matchAll(/^pragma solidity ([^;]+);$/gm)].map((m) => m[1]);
/// every file a source imports, as a path from the root of the repository
const importsOf = (file) => [...fs.readFileSync(path.join(root, file), "utf8").matchAll(/^import\s+(?:[^"']*\sfrom\s+)?["']([^"']+)["'];/gm)]
  .map((m) => slash(path.normalize(path.join(path.dirname(file), m[1]))));
const inV2 = (file) => file.startsWith("contracts/v2/");
const inVendor = (file) => file.startsWith("contracts/vendor/");
const buildInfos = () => fs.readdirSync(path.join(root, "artifacts", "build-info")).map((f) => JSON.parse(fs.readFileSync(path.join(root, "artifacts", "build-info", f), "utf8")));

describe("Ledger v2: its compile boundary and its builds", () => {
  it("is compiled apart from the kernel: each side states its own compiler exactly, and neither imports the other", () => {
    expect([KERNEL, V2]).to.deep.equal(["0.8.24", "0.8.39"]);
    const all = solidity(path.join(root, "contracts"));
    expect(all.filter(inV2).length > 0 && all.some((f) => !inV2(f))).to.equal(true);
    for (const file of all) {
      const said = pragmas(fs.readFileSync(path.join(root, file), "utf8"));
      expect(said.length, `${file}: one compiler pragma`).to.equal(1);
      // the reference contracts of the standard are kept as their own repository has them
      expect(said[0], `${file} states its compiler`).to.equal(inV2(file) ? V2 : inVendor(file) ? `^${KERNEL}` : KERNEL);
      for (const imported of importsOf(file)) {
        expect(fs.existsSync(path.join(root, imported)), `${file} imports ${imported}`).to.equal(true);
        expect(inV2(imported), `${file} imports ${imported} across the boundary`).to.equal(inV2(file));
      }
    }
    // the reference contracts say ^0.8.24 and would be given the newer compiler: each is pinned to the kernel's
    const overrides = hre.config.solidity.overrides;
    for (const file of all.filter(inVendor)) expect(overrides[file]?.version, `${file} is pinned`).to.equal(KERNEL);
    // the two compilers, and the one contract that goes through the IR pipeline
    expect(hre.config.solidity.compilers.map((c) => [c.version, c.settings.viaIR === true, c.settings.optimizer.runs, c.settings.evmVersion]))
      .to.deep.equal([[KERNEL, false, 200, "cancun"], [V2, false, 200, "cancun"]]);
    expect(Object.entries(overrides).filter(([, c]) => c.settings.viaIR === true).map(([file, c]) => [file, c.version, c.settings.optimizer.runs, c.settings.evmVersion]))
      .to.deep.equal([["contracts/v2/GenesisLedgerV2.sol", V2, 200, "cancun"]]);
  });

  it("was compiled that way: no compilation holds files of both sides, and each side's compiler is the pinned one", () => {
    const jobs = buildInfos();
    const seen = { v2: new Set(), kernel: new Set() };
    for (const job of jobs) {
      const files = Object.keys(job.input.sources);
      const sides = new Set(files.map(inV2));
      expect(sides.size, `one compilation holds ${files.join(", ")}`).to.equal(1);
      const side = sides.has(true) ? "v2" : "kernel";
      expect(job.solcVersion, files[0]).to.equal(side === "v2" ? V2 : KERNEL);
      for (const file of files) seen[side].add(file);
    }
    const all = solidity(path.join(root, "contracts"));
    expect([...seen.v2].sort()).to.deep.equal(all.filter(inV2));
    expect([...seen.kernel].sort()).to.deep.equal(all.filter((f) => !inV2(f)));
  });

  it("shares three interfaces with the kernel as ABIs: v2's own copies declare what the kernel's declare", () => {
    const abi = (rel) => JSON.parse(fs.readFileSync(path.join(root, "artifacts", rel), "utf8")).abi;
    for (const name of ["ISeedSource", "IG0Function", "ITaskTender8414"]) {
      const kernel = abi(`contracts/interfaces/${name}.sol/${name}.json`);
      const v2 = abi(`contracts/v2/external/${name}.sol/${name}.json`);
      expect(kernel.length > 0, name).to.equal(true);
      expect(v2, `contracts/v2/external/${name}.sol is not the kernel's ${name}`).to.deep.equal(kernel);
      // and the text of the two files differs in the compiler pragma and in the note, placed right
      // before the declaration, that says the file is a copy
      const text = (file) => fs.readFileSync(path.join(root, file), "utf8").split("\n").filter((l) => !/^pragma solidity /.test(l)).join("\n");
      const own = text(`contracts/v2/external/${name}.sol`);
      const note = /^\/\/\/ @dev    v2's own copy of the kernel's interface of the same name[\s\S]*?(?=^interface )/m;
      expect(note.test(own), `${name}: says that it is a copy`).to.equal(true);
      expect(own.replace(note, "")).to.equal(text(`contracts/interfaces/${name}.sol`));
    }
  });

  it("ships v2 builds that are what the v2 sources compile to, by the v2 compiler and from v2 sources alone", () => {
    expect(Object.keys(deployableV2)).to.deep.equal(["GenesisPolicyV2", "GenesisLedgerV2", "TenderAdapter8414V2", "FogaCellGuard"]);
    for (const [name, rel] of Object.entries(deployableV2)) {
      const shipped = fs.readFileSync(path.join(root, "build", "v2", `${name}.json`), "utf8");
      expect(shipped, `build/v2/${name}.json is stale: run npm run export-abi`).to.equal(`${JSON.stringify(buildOfV2(name), null, 2)}\n`);
      const build = JSON.parse(shipped);
      expect(build.compiler.version.startsWith(`${V2}+commit.`), `${name}: compiler ${build.compiler.version}`).to.equal(true);
      expect(build.compiler.viaIR, `${name}: pipeline`).to.equal(name === "GenesisLedgerV2");
      expect([build.compiler.optimizer, build.compiler.evmVersion]).to.deep.equal([{ enabled: true, runs: 200 }, "cancun"]);
      // the contract is made of v2 sources only, and the hashes are those of the files as they are
      expect(Object.keys(build.sources).length > 0 && Object.keys(build.sources).every(inV2), `${name}: ${Object.keys(build.sources).join(", ")}`).to.equal(true);
      expect(Object.keys(build.sources).some((f) => f.includes("/testing/")), `${name} is made of a test fixture`).to.equal(false);
      for (const [file, hash] of Object.entries(build.sources)) {
        expect(hre.ethers.keccak256(fs.readFileSync(path.join(root, file))), `${name}: ${file}`).to.equal(hash);
      }
      for (const [start, length] of build.immutableReferences) {
        expect(build.deployedBytecode.slice(2 + 2 * start, 2 + 2 * (start + length)), `${name}: an immutable position that is not blank in the build`).to.match(/^0+$/);
      }
      // the compiled interface a client holds is the interface of this build
      expect(build.abi).to.deep.equal(JSON.parse(fs.readFileSync(path.join(root, "client", "abi", `${name}.json`), "utf8")));
      expect(rel.includes("/testing/")).to.equal(false);
    }
    // the builds of the kernel stay where they were, and none of v2 is among them
    expect(fs.readdirSync(path.join(root, "build")).filter((f) => f.endsWith(".json")).sort())
      .to.deep.equal(["AuditV1.json", "GenesisLedger.json", "GenesisPolicy.json", "L1BlockSeedSource.json", "PrevBlockSeedSource.json", "TenderAdapter8414.json"]);
  });

  it("records how the v2 builds were made: the compiler as installed, the settings, and what came out", () => {
    const shipped = fs.readFileSync(path.join(root, "build", "v2", "build-record.json"), "utf8");
    expect(shipped, "build/v2/build-record.json is stale: run npm run export-abi").to.equal(`${JSON.stringify(buildRecordV2(), null, 2)}\n`);
    const record = JSON.parse(shipped);
    // the compiler is the package the lock file pins, and it says of itself what the record says
    const dir = path.dirname(require.resolve(`${V2_COMPILER_PACKAGE}/package.json`));
    const lock = JSON.parse(fs.readFileSync(path.join(root, "package-lock.json"), "utf8")).packages[`node_modules/${V2_COMPILER_PACKAGE}`];
    expect([record.compiler.package, record.compiler.version, record.compiler.integrity]).to.deep.equal([`solc@${V2}`, V2, lock.integrity]);
    expect(/^sha512-[A-Za-z0-9+/]{86}==$/.test(record.compiler.integrity)).to.equal(true);
    expect(record.compiler.soljsonSha256).to.equal(sha256(fs.readFileSync(path.join(dir, "soljson.js"))));
    const said = execFileSync(process.execPath, ["-e", `process.stdout.write(require(${JSON.stringify(V2_COMPILER_PACKAGE)}).version())`], { cwd: root, encoding: "utf8" });
    expect(record.compiler.fullVersion).to.equal(said);
    expect(said.startsWith(`${V2}+commit.`)).to.equal(true);
    for (const [name, c] of Object.entries(record.contracts)) {
      const build = JSON.parse(fs.readFileSync(path.join(root, c.buildFile), "utf8"));
      expect(c.compiler.version, name).to.equal(said.replace(/\.Emscripten.*$/, ""));
      expect(c.buildFileSha256, name).to.equal(sha256(fs.readFileSync(path.join(root, c.buildFile))));
      expect(c.runtimeCodeBytes, name).to.equal((build.deployedBytecode.length - 2) / 2);
      expect(c.runtimeCodeSha256, name).to.equal(sha256(Buffer.from(build.deployedBytecode.slice(2), "hex")));
      expect(c.creationCodeSha256, name).to.equal(sha256(Buffer.from(build.bytecode.slice(2), "hex")));
      expect(c.underTheCodeSizeLimitBy, name).to.equal(CODE_SIZE_LIMIT - c.runtimeCodeBytes);
    }
    // the size gate, on the build a deployment is made from: the ledger keeps 1,024 bytes of room
    expect(CODE_SIZE_LIMIT).to.equal(24576);
    expect(record.contracts.GenesisLedgerV2.underTheCodeSizeLimitBy >= 1024, `the ledger's build is ${record.contracts.GenesisLedgerV2.runtimeCodeBytes} bytes`).to.equal(true);
    for (const c of Object.values(record.contracts)) expect(c.underTheCodeSizeLimitBy > 0).to.equal(true);
  });

  it("has a reading of the compiler's list of known bugs for the very compiler of these builds", () => {
    const check = JSON.parse(fs.readFileSync(path.join(root, "build", "v2", "known-bugs-check.json"), "utf8"));
    const record = JSON.parse(fs.readFileSync(path.join(root, "build", "v2", "build-record.json"), "utf8"));
    // a change of the v2 compiler leaves this reading behind, and the test fails until there is a new one
    expect(check.v2Compiler.version).to.equal(record.compiler.version);
    expect(check.v2Compiler.knownBugs, "bugs the list had for the v2 compiler when it was read").to.deep.equal([]);
    expect(check.kernelCompiler.version).to.equal(KERNEL);
    expect(/^\d{4}-\d{2}-\d{2}$/.test(check.readOn) && /^[0-9a-f]{40}$/.test(check.source.headOfBranchWhenRead)).to.equal(true);
    for (const file of Object.values(check.source.files)) expect(/^[0-9a-f]{64}$/.test(file.sha256)).to.equal(true);
    // the reading is not older than the compiler it is about
    expect(check.readOn >= check.v2Compiler.released).to.equal(true);
  });
});
