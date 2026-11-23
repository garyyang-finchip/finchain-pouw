// What the scripts share: arguments, the endpoint, key files, records. Needs ethers and nothing else,
// so every script here runs on a host that installed the client only (npm ci --omit=dev).
"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");
const crypto = require("crypto");
const { ethers } = require("ethers");

const root = path.join(__dirname, "..", "..");

function parse(argv, flags = []) {
  const opts = { _: [] };
  const set = new Set([...flags, "json", "help"]);
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith("--")) { opts._.push(a); continue; }
    const name = a.slice(2);
    if (set.has(name)) { opts[name] = true; continue; }
    if (i + 1 >= argv.length) throw new Error(`--${name} needs a value`);
    opts[name] = argv[++i];
  }
  return opts;
}

function need(value, what) {
  if (value === undefined || value === "") throw new Error(`${what} is required`);
  return value;
}

/// A path as typed on a command line: `~/` is the home directory.
const expand = (p) => path.resolve(p === "~" || p.startsWith("~/") ? path.join(os.homedir(), p.slice(1)) : p);
const inRepository = (p) => { const rel = path.relative(root, p); return rel === "" || (!rel.startsWith("..") && !path.isAbsolute(rel)); };
const readJson = (file) => JSON.parse(fs.readFileSync(file, "utf8"));
const writeJson = (file, value) => { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`); };
/// Make sure records can be written to `dir` - before the transactions they record are sent, not after.
function writableDir(dir) {
  const probe = path.join(dir, `.write-test-${process.pid}`);
  try {
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(probe, "");
    fs.rmSync(probe);
  } catch (e) { throw new Error(`cannot write records to ${dir}: ${e.message}`); }
  return dir;
}
const stamp = (at = new Date()) => at.toISOString().replace(/[-:]/g, "").replace(/\.\d+Z$/, "Z");
/// A path for a new record, `<directory>/<prefix>-<time>.json`, that does not exist yet.
function freshPath(dir, prefix) {
  const base = path.join(dir, `${prefix}-${stamp()}`);
  for (let n = 1; ; n++) {
    const file = n === 1 ? `${base}.json` : `${base}-${n}.json`;
    if (!fs.existsSync(file)) return file;
  }
}
const iso = (seconds) => new Date(Number(seconds) * 1000).toISOString().replace(".000Z", "Z");
const sha256File = (rel) => crypto.createHash("sha256").update(fs.readFileSync(path.join(root, rel))).digest("hex");
const version = () => readJson(path.join(root, "package.json")).version;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
/// The host of an endpoint and nothing else: the rest of an RPC URL can carry an access key.
const endpointHost = (rpc) => { try { return new URL(rpc).host; } catch { return "unknown"; } };
const hostInfo = () => ({ node: process.version, platform: `${process.platform}/${process.arch}` });

/// No response cache: a read that follows a transaction must see it.
function connectRpc(rpc) {
  const provider = new ethers.JsonRpcProvider(rpc, undefined, { cacheTimeout: -1 });
  provider.pollingInterval = Number(process.env.POUW_POLL_MS ?? 1000);
  return provider;
}

/// A key file holds one private key and is its owner's alone: a file that others can read is refused.
function readKeyFile(file) {
  const mode = fs.statSync(file).mode & 0o777;
  if (process.platform !== "win32" && (mode & 0o077) !== 0) {
    throw new Error(`${file} can be read by others (mode ${mode.toString(8)}): make it the owner's alone (chmod 600) and try again`);
  }
  return fs.readFileSync(file, "utf8").trim();
}

const keyFileOf = (dir, name) => path.join(dir, `${name}.key`);
const walletOf = (dir, name, provider) => new ethers.Wallet(readKeyFile(keyFileOf(dir, name)), provider);
/// The address of a named key, from the address file written beside it: a key file is opened by the
/// party that signs with it and by nobody else.
function addressOf(dir, name) {
  const file = path.join(dir, `${name}.address`);
  if (!fs.existsSync(file)) throw new Error(`no ${name}.address in ${dir}: make the key with scripts/keys.js`);
  return ethers.getAddress(fs.readFileSync(file, "utf8").trim());
}

/// A moment given on a command line: seconds since 1970, an ISO-8601 time with its zone, or
/// `+<n>m` / `+<n>s` after `base` (seconds).
function parseTime(text, base) {
  const rel = /^\+(\d+)(s|m|h)$/.exec(text);
  if (rel) return BigInt(base) + BigInt(rel[1]) * { s: 1n, m: 60n, h: 3600n }[rel[2]];
  if (/^\d+$/.test(text)) return BigInt(text);
  if (!/(Z|[+-]\d\d:\d\d)$/.test(text)) throw new Error(`the time ${text} names no zone: write it as 2026-01-31T10:00:00Z or with an offset such as +08:00`);
  const ms = Date.parse(text);
  if (Number.isNaN(ms)) throw new Error(`cannot read the time ${text}`);
  return BigInt(Math.floor(ms / 1000));
}

/// Run a script's main function: its return value is the exit status. `refusal(e)` names the
/// contract error behind a failed transaction, when the script knows how to read one.
function run(main, name, refusal = () => null) {
  main().then((code) => { process.exitCode = code ?? 0; }, (e) => {
    const refused = refusal(e);
    console.error(refused ? `${name}: refused by the contract: ${refused.name}(${refused.args.join(", ")})` : `${name}: ${e.shortMessage ?? e.message}`);
    process.exitCode = 1;
  });
}

module.exports = {
  root, parse, need, expand, inRepository, readJson, writeJson, writableDir, stamp, freshPath, iso, sha256File, version, sleep, endpointHost, hostInfo,
  connectRpc, readKeyFile, keyFileOf, walletOf, addressOf, parseTime, run,
};
