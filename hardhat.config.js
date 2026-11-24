// Hardhat configuration. The compiler is the solc-js build pinned in package.json (solc 0.8.24), so that
// `npm ci && npm test` needs no compiler download.
require("@nomicfoundation/hardhat-ethers");
const path = require("path");
const { subtask } = require("hardhat/config");
const { TASK_COMPILE_SOLIDITY_GET_SOLC_BUILD } = require("hardhat/builtin-tasks/task-names");

subtask(TASK_COMPILE_SOLIDITY_GET_SOLC_BUILD, async (args, hre, runSuper) => {
  const pinned = require("solc/package.json").version;
  if (args.solcVersion !== pinned) return runSuper();
  const solc = require("solc");
  return {
    compilerPath: path.join(path.dirname(require.resolve("solc/package.json")), "soljson.js"),
    isSolcJs: true,
    version: args.solcVersion,
    longVersion: solc.version().replace(/\.Emscripten.*$/, ""),
  };
});

const settings = { optimizer: { enabled: true, runs: 200 }, evmVersion: "cancun" };

// Hardhat reads `overrides` only beside a list of compilers: with a single `version` it drops them
// without a word. Up to release 0.1.3 this file had the single form, so the override below was not
// in effect and the reference contract was compiled for the tests with the kernel's settings.
// Nothing deployed was affected: nothing under contracts/vendor is ever deployed from here.
const compiler = (runs) => ({ version: "0.8.24", settings: { ...settings, optimizer: { enabled: true, runs } } });

module.exports = {
  solidity: {
    compilers: [{ version: "0.8.24", settings }],
    overrides: {
      // the ERC-8414 reference contract is compiled the way its own repository compiles it
      "contracts/vendor/erc8414/TaskToken.sol": compiler(1),
      // The ledger of v2 is compiled through the IR pipeline. With the kernel's settings it comes to
      // 24,542 bytes, 34 under the limit a chain puts on a contract's code (EIP-170: 24,576); through
      // the IR pipeline, with the same 200 runs, to 21,674.
      "contracts/v2/GenesisLedgerV2.sol": { version: "0.8.24", settings: { ...settings, viaIR: true } },
    },
  },
  networks: {
    hardhat: { chainId: 31337 },
    localhost: { url: "http://127.0.0.1:8545" },
  },
  mocha: { timeout: 120000 },
};
