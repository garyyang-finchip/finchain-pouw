// The three signed statements of ledger v2, as typed data (EIP-712): the permit by which an
// account lets one separate key record its work, and the two statements that end permits without
// a transaction of the account. Encodings only: this file reads no chain and holds no key.
//
// All three are in one domain - name "PoUW Genesis Ledger", version "2", the chain id and the
// ledger's address - and each has a type of its own: a signature made for one cannot be used as
// another, on another chain or against another ledger (docs/ledger-v2.md, section 3).

"use strict";

const { ethers } = require("ethers");

const NAME = "PoUW Genesis Ledger";
const VERSION = "2";
const OP = { SUBMIT_G0: 1, CONFIRM_TENDER: 2 };
const KNOWN_SCOPE = 3;
const SCOPE_NAMES = { "submit-g0": OP.SUBMIT_G0, "confirm-tender": OP.CONFIRM_TENDER };

const TYPES = {
  Permit: [
    { name: "account", type: "address" },
    { name: "delegate", type: "address" },
    { name: "scope", type: "uint32" },
    { name: "notBeforeEpoch", type: "uint64" },
    { name: "notAfterEpoch", type: "uint64" },
    { name: "nonce", type: "uint64" },
    { name: "guard", type: "address" },
    { name: "guardBindingVersion", type: "uint64" },
  ],
  Revoke: [
    { name: "account", type: "address" },
    { name: "permitDigest", type: "bytes32" },
  ],
  RaiseNonce: [
    { name: "account", type: "address" },
    { name: "minNonce", type: "uint64" },
  ],
};
const DOMAIN_TYPE = [
  { name: "name", type: "string" },
  { name: "version", type: "string" },
  { name: "chainId", type: "uint256" },
  { name: "verifyingContract", type: "address" },
];

const fail = (m) => { throw new Error(`statement refused: ${m}`); };

function uint(value, bits, what) {
  let v;
  try { v = BigInt(value); } catch { fail(`${what} is not a whole number: ${value}`); }
  if (v < 0n || v >= 1n << BigInt(bits)) fail(`${what} does not fit ${bits} bits: ${value}`);
  return v;
}

function address(value, what) {
  if (typeof value !== "string" || !ethers.isAddress(value)) fail(`${what} is not an address: ${value}`);
  return ethers.getAddress(value);
}

/// The scope of a permit from its names ("submit-g0", "confirm-tender"), or from a number.
function scopeOf(value) {
  if (typeof value === "number" || typeof value === "bigint" || /^\d+$/.test(String(value))) {
    const n = Number(uint(value, 32, "scope"));
    if (n === 0 || (n & ~KNOWN_SCOPE) !== 0) fail(`scope ${n} names no operation of this version, or one it does not know`);
    return n;
  }
  let scope = 0;
  for (const name of String(value).split(",").map((s) => s.trim()).filter(Boolean)) {
    if (!SCOPE_NAMES[name]) fail(`unknown operation ${name}; the operations are ${Object.keys(SCOPE_NAMES).join(" and ")}`);
    scope |= SCOPE_NAMES[name];
  }
  if (scope === 0) fail("a permit names at least one operation");
  return scope;
}

const scopeNames = (scope) => Object.entries(SCOPE_NAMES).filter(([, bit]) => (Number(scope) & bit) !== 0).map(([name]) => name);

const domainOf = (chainId, ledger) => ({
  name: NAME, version: VERSION, chainId: uint(chainId, 256, "chain id"), verifyingContract: address(ledger, "ledger"),
});

/// The fields of each statement, checked and in the form they are signed in.
const NORMALIZE = {
  Permit: (m) => {
    const out = {
      account: address(m.account, "account"),
      delegate: address(m.delegate, "delegate"),
      scope: BigInt(scopeOf(m.scope)),
      notBeforeEpoch: uint(m.notBeforeEpoch, 64, "notBeforeEpoch"),
      notAfterEpoch: uint(m.notAfterEpoch, 64, "notAfterEpoch"),
      nonce: uint(m.nonce, 64, "nonce"),
      guard: address(m.guard ?? ethers.ZeroAddress, "guard"),
      guardBindingVersion: uint(m.guardBindingVersion ?? 0, 64, "guardBindingVersion"),
    };
    if (out.notAfterEpoch < out.notBeforeEpoch) fail("notAfterEpoch is before notBeforeEpoch: the permit could never be used");
    if (out.delegate === ethers.ZeroAddress) fail("the delegate is the zero address");
    return out;
  },
  Revoke: (m) => {
    if (typeof m.permitDigest !== "string" || !ethers.isHexString(m.permitDigest, 32)) fail(`permitDigest is not a 32-byte value: ${m.permitDigest}`);
    return { account: address(m.account, "account"), permitDigest: m.permitDigest.toLowerCase() };
  },
  RaiseNonce: (m) => ({ account: address(m.account, "account"), minNonce: uint(m.minNonce, 64, "minNonce") }),
};

/// One statement, ready to be hashed or signed. `kind` is Permit, Revoke or RaiseNonce.
function statement(kind, chainId, ledger, message) {
  if (!TYPES[kind]) fail(`unknown statement ${kind}`);
  return { kind, domain: domainOf(chainId, ledger), types: { [kind]: TYPES[kind] }, message: NORMALIZE[kind](message) };
}

/// The digest an account signs and the ledger checks.
const digestOf = (st) => ethers.TypedDataEncoder.hash(st.domain, st.types, st.message);

/// The statement as the JSON of `eth_signTypedData_v4`: what a person reads before signing.
function typedData(st) {
  const plain = (v) => (typeof v === "bigint" ? v.toString() : v);
  return {
    types: { EIP712Domain: DOMAIN_TYPE, ...st.types },
    primaryType: st.kind,
    domain: Object.fromEntries(Object.entries(st.domain).map(([k, v]) => [k, plain(v)])),
    message: Object.fromEntries(Object.entries(st.message).map(([k, v]) => [k, plain(v)])),
  };
}

/// The statement in words, one line a field.
function describe(st) {
  const m = st.message;
  const lines = [`${st.kind} for the ledger ${st.domain.verifyingContract} on chain ${st.domain.chainId}`];
  if (st.kind === "Permit") {
    lines.push(`  account   ${m.account}   (the participant that authorizes)`);
    lines.push(`  delegate  ${m.delegate}   (the only key that may use the permit)`);
    lines.push(`  scope     ${m.scope}: ${scopeNames(m.scope).join(", ")}`);
    lines.push(`  epochs    ${m.notBeforeEpoch} to ${m.notAfterEpoch}, both included`);
    lines.push(`  nonce     ${m.nonce}`);
    lines.push(`  guard     ${m.guard}, binding version ${m.guardBindingVersion}${m.guard === ethers.ZeroAddress ? "   (none: valid for an account without code only)" : ""}`);
    lines.push("  it lets the delegate have the ledger record this account's G0 submissions and tender confirmations, as scoped;");
    lines.push("  it cannot make the account call anything, move or approve an asset, or authorize another key");
  } else if (st.kind === "Revoke") {
    lines.push(`  account   ${m.account}`);
    lines.push(`  ends the permit with digest ${m.permitDigest}, for good`);
  } else {
    lines.push(`  account   ${m.account}`);
    lines.push(`  ends every permit of the account whose nonce is below ${m.minNonce}; the minimum only rises`);
  }
  return lines.join("\n");
}

/// Sign a statement with a key that is not connected to anything. Returns the 65-byte signature.
const sign = (wallet, st) => wallet.signTypedData(st.domain, st.types, st.message);

/// The permit as the contracts take it: a tuple in the order of the struct.
const permitTuple = (st) => {
  const m = st.message;
  return [m.account, m.delegate, m.scope, m.notBeforeEpoch, m.notAfterEpoch, m.nonce, m.guard, m.guardBindingVersion];
};

module.exports = { NAME, VERSION, OP, KNOWN_SCOPE, TYPES, DOMAIN_TYPE, scopeOf, scopeNames, domainOf, statement, digestOf, typedData, describe, sign, permitTuple };
