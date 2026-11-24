// Copy what the client and a deployment need out of the compiler's artifacts, so that neither
// needs the compiler:
//   client/abi/<name>.json   the interfaces the client reads and calls
//   build/<name>.json        each deployable contract: ABI, creation code, runtime code and the
//                            positions of its immutable values in the runtime code
// Run `npm run export-abi` whenever a contract changes (it compiles first);
// test/boundaries.test.js fails if what is committed is not what the sources compile to.
"use strict";
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const sources = {
  GenesisPolicy: "contracts/GenesisPolicy.sol/GenesisPolicy.json",
  GenesisLedger: "contracts/GenesisLedger.sol/GenesisLedger.json",
  AuditV1: "contracts/functions/AuditV1.sol/AuditV1.json",
  TenderAdapter8414: "contracts/TenderAdapter8414.sol/TenderAdapter8414.json",
  ITaskTender8414: "contracts/interfaces/ITaskTender8414.sol/ITaskTender8414.json",
  // ledger v2 (docs/ledger-v2.md): the interfaces, as they compile. Its builds are added to
  // `deployable` below together with the deployment tooling, when the interfaces are frozen.
  GenesisPolicyV2: "contracts/v2/GenesisPolicyV2.sol/GenesisPolicyV2.json",
  GenesisLedgerV2: "contracts/v2/GenesisLedgerV2.sol/GenesisLedgerV2.json",
  TenderAdapter8414V2: "contracts/v2/TenderAdapter8414V2.sol/TenderAdapter8414V2.json",
  IParticipantGuard: "contracts/v2/interfaces/IParticipantGuard.sol/IParticipantGuard.json",
  FogaCellGuard: "contracts/v2/guards/FogaCellGuard.sol/FogaCellGuard.json",
};
// the contracts of a deployment; nothing under contracts/testing or contracts/vendor is ever one
const deployable = {
  GenesisPolicy: "contracts/GenesisPolicy.sol/GenesisPolicy.json",
  GenesisLedger: "contracts/GenesisLedger.sol/GenesisLedger.json",
  AuditV1: "contracts/functions/AuditV1.sol/AuditV1.json",
  TenderAdapter8414: "contracts/TenderAdapter8414.sol/TenderAdapter8414.json",
  L1BlockSeedSource: "contracts/seed/L1BlockSeedSource.sol/L1BlockSeedSource.json",
  PrevBlockSeedSource: "contracts/seed/PrevBlockSeedSource.sol/PrevBlockSeedSource.json",
};

const artifact = (rel) => JSON.parse(fs.readFileSync(path.join(root, "artifacts", rel), "utf8"));

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
}

module.exports = { sources, deployable, abiOf, buildOf };
