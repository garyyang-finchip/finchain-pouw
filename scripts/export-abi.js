// Copy what the client and a deployment need out of the compiler's artifacts, so that neither
// needs the compiler:
//   client/abi/<name>.json   the interfaces the client reads and calls
//   build/<name>.json        each deployable contract of the kernel: ABI, creation code, runtime
//                            code and the positions of its immutable values in the runtime code
//   build/v2/<name>.json     the same for each deployable contract of ledger v2, with the compiler
//                            pipeline and the sources the contract is made of
//   build/v2/build-record.json   which compiler made the v2 builds, with which settings, from
//                            which package, and what came out (docs/ledger-v2.md 1)
// Run `npm run export-abi` whenever a contract changes (it compiles first);
// test/boundaries.test.js and test/v2.build.test.js fail if what is committed is not what the
// sources compile to.
"use strict";
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { execFileSync } = require("child_process");

const root = path.join(__dirname, "..");
const sources = {
  GenesisPolicy: "contracts/GenesisPolicy.sol/GenesisPolicy.json",
  GenesisLedger: "contracts/GenesisLedger.sol/GenesisLedger.json",
  AuditV1: "contracts/functions/AuditV1.sol/AuditV1.json",
  TenderAdapter8414: "contracts/TenderAdapter8414.sol/TenderAdapter8414.json",
  ITaskTender8414: "contracts/interfaces/ITaskTender8414.sol/ITaskTender8414.json",
  // ledger v2 (docs/ledger-v2.md): the interfaces, as they compile. They are frozen
  // (contracts/v2/interfaces.frozen.json); the v2 builds are `deployableV2` below.
  GenesisPolicyV2: "contracts/v2/GenesisPolicyV2.sol/GenesisPolicyV2.json",
  GenesisLedgerV2: "contracts/v2/GenesisLedgerV2.sol/GenesisLedgerV2.json",
  TenderAdapter8414V2: "contracts/v2/TenderAdapter8414V2.sol/TenderAdapter8414V2.json",
  IParticipantGuard: "contracts/v2/interfaces/IParticipantGuard.sol/IParticipantGuard.json",
  FogaCellGuard: "contracts/v2/guards/FogaCellGuard.sol/FogaCellGuard.json",
};
// the contracts of a deployment of the kernel; nothing under contracts/testing or contracts/vendor
// is ever one. These six builds are those of release 0.1.3 and are not made again.
const deployable = {
  GenesisPolicy: "contracts/GenesisPolicy.sol/GenesisPolicy.json",
  GenesisLedger: "contracts/GenesisLedger.sol/GenesisLedger.json",
  AuditV1: "contracts/functions/AuditV1.sol/AuditV1.json",
  TenderAdapter8414: "contracts/TenderAdapter8414.sol/TenderAdapter8414.json",
  L1BlockSeedSource: "contracts/seed/L1BlockSeedSource.sol/L1BlockSeedSource.json",
  PrevBlockSeedSource: "contracts/seed/PrevBlockSeedSource.sol/PrevBlockSeedSource.json",
};

// the contracts of ledger v2 that a deployment is made of, all from contracts/v2 and all compiled
// by the v2 compiler; nothing under contracts/v2/testing is ever one
const deployableV2 = {
  GenesisPolicyV2: "contracts/v2/GenesisPolicyV2.sol/GenesisPolicyV2.json",
  GenesisLedgerV2: "contracts/v2/GenesisLedgerV2.sol/GenesisLedgerV2.json",
  TenderAdapter8414V2: "contracts/v2/TenderAdapter8414V2.sol/TenderAdapter8414V2.json",
  FogaCellGuard: "contracts/v2/guards/FogaCellGuard.sol/FogaCellGuard.json",
};
// the package the v2 compiler comes from, as hardhat.config.js names it
const V2_COMPILER_PACKAGE = "solc-0.8.39";
// the limit a chain puts on the code of a contract (EIP-170)
const CODE_SIZE_LIMIT = 24576;

const artifact = (rel) => JSON.parse(fs.readFileSync(path.join(root, "artifacts", rel), "utf8"));
const sha256 = (bytes) => crypto.createHash("sha256").update(bytes).digest("hex");
const bytesOf = (hex) => (hex.length - 2) / 2;

function abiOf(name) {
  return artifact(sources[name]).abi;
}

/// The build record of a deployable contract, from its artifact and the compiler output behind it.
function buildOf(name) {
  const rel = deployable[name];
  const a = artifact(rel);
  const dbg = artifact(rel.replace(/\.json$/, ".dbg.json"));
  const info = JSON.parse(fs.readFileSync(path.resolve(path.dirname(path.join(root, "artifacts", rel)), dbg.buildInfo), "utf8"));
  const out = info.output.contracts[a.sourceName][a.contractName].evm.deployedBytecode;
  const immutables = Object.values(out.immutableReferences ?? {}).flat().map((r) => [r.start, r.length]).sort((x, y) => x[0] - y[0]);
  const { optimizer, evmVersion } = info.input.settings;
  return {
    contractName: a.contractName,
    sourceName: a.sourceName,
    compiler: { version: info.solcLongVersion, optimizer, evmVersion },
    abi: a.abi,
    bytecode: a.bytecode,
    deployedBytecode: a.deployedBytecode,
    immutableReferences: immutables,
  };
}

/// What the compiler made of one contract, and the input it was given.
function compiled(rel) {
  const a = artifact(rel);
  const dbg = artifact(rel.replace(/\.json$/, ".dbg.json"));
  const info = JSON.parse(fs.readFileSync(path.resolve(path.dirname(path.join(root, "artifacts", rel)), dbg.buildInfo), "utf8"));
  return { a, info, out: info.output.contracts[a.sourceName][a.contractName] };
}

/// The build of a deployable contract of ledger v2. Beside what a kernel build holds it says which
/// pipeline compiled it and names every source file the contract is made of, with the hash the
/// compiler itself put into the contract's metadata.
function buildOfV2(name) {
  const { a, info, out } = compiled(deployableV2[name]);
  const immutables = Object.values(out.evm.deployedBytecode.immutableReferences ?? {}).flat().map((r) => [r.start, r.length]).sort((x, y) => x[0] - y[0]);
  const { optimizer, evmVersion, viaIR } = info.input.settings;
  const metadata = JSON.parse(out.metadata);
  const sourcesOf = Object.fromEntries(Object.keys(metadata.sources).sort().map((file) => [file, metadata.sources[file].keccak256]));
  return {
    contractName: a.contractName,
    sourceName: a.sourceName,
    compiler: { version: info.solcLongVersion, optimizer, evmVersion, viaIR: viaIR === true },
    sources: sourcesOf,
    abi: a.abi,
    bytecode: a.bytecode,
    deployedBytecode: a.deployedBytecode,
    immutableReferences: immutables,
  };
}

/// The compiler of v2 as it is installed: its package, the integrity the lock file holds for that
/// package, the compiler's own full version and the hash of the file that is the compiler. The
/// version is asked of the compiler in a process of its own: a compiler loaded into this one would
/// stay in it.
function v2Compiler() {
  const dir = path.dirname(require.resolve(`${V2_COMPILER_PACKAGE}/package.json`));
  const pkg = JSON.parse(fs.readFileSync(path.join(dir, "package.json"), "utf8"));
  const lock = JSON.parse(fs.readFileSync(path.join(root, "package-lock.json"), "utf8")).packages[`node_modules/${V2_COMPILER_PACKAGE}`];
  const fullVersion = execFileSync(process.execPath, ["-e", `process.stdout.write(require(${JSON.stringify(V2_COMPILER_PACKAGE)}).version())`], { cwd: root, encoding: "utf8" });
  return {
    package: `${pkg.name}@${pkg.version}`,
    installedAs: V2_COMPILER_PACKAGE,
    resolved: lock.resolved,
    integrity: lock.integrity,
    version: pkg.version,
    fullVersion,
    soljsonSha256: sha256(fs.readFileSync(path.join(dir, "soljson.js"))),
  };
}

/// The record of the v2 builds: the compiler, the settings each contract was compiled with, and
/// what came out, by size and by hash. Everything in it follows from the sources, the lock file and
/// the installed compiler; a second machine that runs `npm ci && npm run export-abi` writes the same
/// bytes. The reading of the compiler's list of known bugs is a record of its own beside this one.
function buildRecordV2() {
  const contracts = {};
  for (const name of Object.keys(deployableV2)) {
    const b = buildOfV2(name);
    const runtime = bytesOf(b.deployedBytecode);
    contracts[name] = {
      sourceName: b.sourceName,
      compiler: b.compiler,
      sources: Object.keys(b.sources),
      creationCodeBytes: bytesOf(b.bytecode),
      runtimeCodeBytes: runtime,
      underTheCodeSizeLimitBy: CODE_SIZE_LIMIT - runtime,
      immutableValues: b.immutableReferences.length,
      creationCodeSha256: sha256(Buffer.from(b.bytecode.slice(2), "hex")),
      runtimeCodeSha256: sha256(Buffer.from(b.deployedBytecode.slice(2), "hex")),
      buildFile: `build/v2/${name}.json`,
      buildFileSha256: sha256(`${JSON.stringify(b, null, 2)}\n`),
    };
  }
  return {
    schema: "finchain-pouw.build-record/1",
    what: "The builds of ledger v2 (docs/ledger-v2.md 1; docs/decisions.md A82): made from contracts/v2 alone, by a compiler of their own. The kernel's six builds under build/ are not part of this record and are not made again.",
    boundary: "contracts/v2",
    compiler: v2Compiler(),
    codeSizeLimit: CODE_SIZE_LIMIT,
    contracts,
  };
}

if (require.main === module) {
  fs.mkdirSync(path.join(root, "client", "abi"), { recursive: true });
  for (const name of Object.keys(sources)) {
    fs.writeFileSync(path.join(root, "client", "abi", `${name}.json`), JSON.stringify(abiOf(name), null, 2) + "\n");
    console.log(`client/abi/${name}.json`);
  }
  fs.mkdirSync(path.join(root, "build"), { recursive: true });
  for (const name of Object.keys(deployable)) {
    fs.writeFileSync(path.join(root, "build", `${name}.json`), JSON.stringify(buildOf(name), null, 2) + "\n");
    console.log(`build/${name}.json`);
  }
  fs.mkdirSync(path.join(root, "build", "v2"), { recursive: true });
  for (const name of Object.keys(deployableV2)) {
    fs.writeFileSync(path.join(root, "build", "v2", `${name}.json`), JSON.stringify(buildOfV2(name), null, 2) + "\n");
    console.log(`build/v2/${name}.json`);
  }
  fs.writeFileSync(path.join(root, "build", "v2", "build-record.json"), JSON.stringify(buildRecordV2(), null, 2) + "\n");
  console.log("build/v2/build-record.json");
}

module.exports = { sources, deployable, deployableV2, abiOf, buildOf, buildOfV2, buildRecordV2, V2_COMPILER_PACKAGE, CODE_SIZE_LIMIT };
