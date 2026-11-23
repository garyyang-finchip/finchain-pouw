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

module.exports = {
  solidity: {
    version: "0.8.24",
    settings,
    overrides: {
      // the ERC-8414 reference contract is compiled the way its own repository compiles it
      "contracts/vendor/erc8414/TaskToken.sol": { version: "0.8.24", settings: { optimizer: { enabled: true, runs: 1 }, evmVersion: "cancun" } },
    },
  },
  networks: {
    hardhat: { chainId: 31337 },
    localhost: { url: "http://127.0.0.1:8545" },
  },
  mocha: { timeout: 120000 },
};
