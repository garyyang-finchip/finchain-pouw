// Hardhat configuration. Two compilers, each a solc-js build pinned in package.json, so that
// `npm ci && npm test` needs no compiler download:
//
//   the kernel   solc 0.8.24   everything outside contracts/v2. Its settings, and with them the six
//                              committed builds under build/, are what they were in release 0.1.3.
//   ledger v2    solc 0.8.39   everything under contracts/v2 (docs/ledger-v2.md 1; decisions A82).
//
// The boundary is the directory and is held by the sources themselves: every file states its
// compiler exactly (the reference contracts under contracts/vendor aside, which are pinned below),
// so a file of one side that imported a file of the other would not compile. test/v2.build.test.js
// holds it as well.
require("@nomicfoundation/hardhat-ethers");
const path = require("path");
const { subtask } = require("hardhat/config");
const { TASK_COMPILE_SOLIDITY_GET_SOLC_BUILD } = require("hardhat/builtin-tasks/task-names");

const KERNEL = "0.8.24";
const V2 = "0.8.39";
// the package each compiler comes from; the lock file holds the integrity of both
const PACKAGE = { [KERNEL]: "solc", [V2]: "solc-0.8.39" };

subtask(TASK_COMPILE_SOLIDITY_GET_SOLC_BUILD, async (args, hre, runSuper) => {
  const pkg = PACKAGE[args.solcVersion];
  if (pkg === undefined) return runSuper();
  const pinned = require(`${pkg}/package.json`).version;
  if (pinned !== args.solcVersion) throw new Error(`the package ${pkg} is solc ${pinned}, not ${args.solcVersion}`);
  const solc = require(pkg);
  return {
    compilerPath: path.join(path.dirname(require.resolve(`${pkg}/package.json`)), "soljson.js"),
    isSolcJs: true,
    version: args.solcVersion,
    longVersion: solc.version().replace(/\.Emscripten.*$/, ""),
  };
});

const settings = { optimizer: { enabled: true, runs: 200 }, evmVersion: "cancun" };
const kernel = (runs = 200) => ({ version: KERNEL, settings: { ...settings, optimizer: { enabled: true, runs } } });

module.exports = {
  solidity: {
    // Hardhat reads `overrides` only beside a list of compilers: with a single `version` it drops
    // them without a word, as this file did up to release 0.1.3.
    //
    // A file is given the newest of these compilers that its own pragma and the pragmas of all it
    // imports allow. Every file of the kernel says 0.8.24 and every file of v2 says 0.8.39, so each
    // gets its own. The settings of the v2 compiler are those of the kernel.
    compilers: [kernel(), { version: V2, settings }],
    overrides: {
      // The ERC-8414 reference contracts say ^0.8.24 and would be given the newer compiler. They are
      // tested here as before: by the kernel's compiler, the token the way its own repository
      // compiles it. Nothing under contracts/vendor is ever deployed from this repository.
      "contracts/vendor/erc8414/TaskToken.sol": kernel(1),
      "contracts/vendor/erc8414/TaskVault.sol": kernel(),
      "contracts/vendor/erc8414/interfaces/IOnchainTaskDocument.sol": kernel(),
      "contracts/vendor/erc8414/interfaces/ITaskTender.sol": kernel(),
      "contracts/vendor/erc8414/interfaces/ITaskToken.sol": kernel(),
      "contracts/vendor/erc8414/interfaces/ITaskVerifier.sol": kernel(),
      // The ledger of v2 is compiled through the IR pipeline (decisions A82). Through the legacy
      // pipeline of this compiler it comes to 24,705 bytes, 129 over the limit a chain puts on a
      // contract's code (EIP-170: 24,576), and could not be deployed; through the IR pipeline, with
      // the same 200 runs, to 21,855. test/v2.build.test.js holds the margin on the committed build.
      "contracts/v2/GenesisLedgerV2.sol": { version: V2, settings: { ...settings, viaIR: true } },
    },
  },
  networks: {
    hardhat: { chainId: 31337 },
    localhost: { url: "http://127.0.0.1:8545" },
  },
  mocha: { timeout: 120000 },
};
