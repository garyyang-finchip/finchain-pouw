// Copy the ABIs the client uses from the build artifacts into client/abi/. Run after `npm run compile`
// whenever a contract interface changes; test/abi.test.js fails if the two drift apart.
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
};

function abiOf(name) {
  return JSON.parse(fs.readFileSync(path.join(root, "artifacts", sources[name]), "utf8")).abi;
}

if (require.main === module) {
  fs.mkdirSync(path.join(root, "client", "abi"), { recursive: true });
  for (const name of Object.keys(sources)) {
    fs.writeFileSync(path.join(root, "client", "abi", `${name}.json`), JSON.stringify(abiOf(name), null, 2) + "\n");
    console.log(`client/abi/${name}.json`);
  }
}

module.exports = { sources, abiOf };
