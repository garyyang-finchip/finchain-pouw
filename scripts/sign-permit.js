#!/usr/bin/env node
// Sign one statement of ledger v2 with a key that stays where it is: a permit, a revocation of
// one permit, or a raising of the account's minimum nonce (docs/ledger-v2.md, sections 3 and 12).
//
// What this script does: reads every field from its arguments, prints the statement in words and
// as typed data, prints its digest, and - when a key file is named - the signature.
// What it does not do: it opens no network connection, creates no provider, sends no transaction
// and reads no nonce of any account. It never takes a key from an argument or from the
// environment, and it writes the key nowhere. What it prints - the typed data, the digest, the
// signer's address and the signature - is public material.
//
// Without --key-file it stops after the digest: that is the form in which a statement is put
// into an operation package and reviewed before anything is signed.
"use strict";

const fs = require("fs");
const { ethers } = require("ethers");
const permit = require("../client/lib/permit");

const USAGE = `sign-permit - one statement of ledger v2, signed off line

  node scripts/sign-permit.js permit      --chain-id <n> --ledger <address> --account <address> --delegate <address>
                                          --scope submit-g0,confirm-tender --not-before-epoch <n> --not-after-epoch <n>
                                          --nonce <n> [--guard <address> --guard-binding-version <n>]
  node scripts/sign-permit.js revoke      --chain-id <n> --ledger <address> --account <address> --permit-digest <0x...>
  node scripts/sign-permit.js raise-nonce --chain-id <n> --ledger <address> --account <address> --min-nonce <n>

  --key-file <path>   the file that holds the signing key. It is read where it is and must be its owner's alone
                      (mode 600). Without it the statement and its digest are printed and nothing is signed
  --out <path>        also write the record as JSON
  --json              print the record as JSON instead of text

Every field is an argument; nothing is read from a chain, a manifest or the environment. Check the
ledger's address, the chain id and each field against the reviewed operation package before a key is named.`;

const KINDS = { permit: "Permit", revoke: "Revoke", "raise-nonce": "RaiseNonce" };
const FIELDS = {
  Permit: { account: "account", delegate: "delegate", scope: "scope", "not-before-epoch": "notBeforeEpoch", "not-after-epoch": "notAfterEpoch",
    nonce: "nonce", guard: "guard", "guard-binding-version": "guardBindingVersion" },
  Revoke: { account: "account", "permit-digest": "permitDigest" },
  RaiseNonce: { account: "account", "min-nonce": "minNonce" },
};
const REQUIRED = {
  Permit: ["account", "delegate", "scope", "not-before-epoch", "not-after-epoch", "nonce"],
  Revoke: ["account", "permit-digest"],
  RaiseNonce: ["account", "min-nonce"],
};
const COMMON = ["chain-id", "ledger", "key-file", "out"];

function parse(argv) {
  const opts = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith("--")) { opts._.push(a); continue; }
    const name = a.slice(2);
    if (name === "json" || name === "help") { opts[name] = true; continue; }
    if (i + 1 >= argv.length) throw new Error(`--${name} needs a value`);
    opts[name] = argv[++i];
  }
  return opts;
}

/// A key file holds one private key and is its owner's alone: a file that others can read is refused.
function readKeyFile(file) {
  const mode = fs.statSync(file).mode & 0o777;
  if (process.platform !== "win32" && (mode & 0o077) !== 0) {
    throw new Error(`${file} can be read by others (mode ${mode.toString(8)}): make it the owner's alone (chmod 600) and try again`);
  }
  return fs.readFileSync(file, "utf8").trim();
}

async function main() {
  const opts = parse(process.argv.slice(2));
  const kind = KINDS[opts._[0]];
  if (opts.help || !kind) { console.log(USAGE); return opts.help ? 0 : 1; }
  if (opts._.length > 1) throw new Error(`unexpected argument ${opts._[1]}: every field is a named option`);
  for (const name of Object.keys(opts)) {
    if (name === "_" || name === "json" || name === "help") continue;
    if (!COMMON.includes(name) && !(name in FIELDS[kind])) throw new Error(`--${name} is not a field of a ${opts._[0]} statement`);
  }
  for (const name of ["chain-id", "ledger", ...REQUIRED[kind]]) if (opts[name] === undefined) throw new Error(`--${name} is required`);
  if (kind === "Permit" && (opts.guard === undefined) !== (opts["guard-binding-version"] === undefined)) {
    throw new Error("--guard and --guard-binding-version are given together: a permit is signed for one binding of the account's guard");
  }

  const message = Object.fromEntries(Object.entries(FIELDS[kind]).filter(([flag]) => opts[flag] !== undefined).map(([flag, field]) => [field, opts[flag]]));
  const st = permit.statement(kind, opts["chain-id"], opts.ledger, message);
  const record = {
    schema: "finchain-pouw.signed-statement/1",
    kind,
    typedData: permit.typedData(st),
    digest: permit.digestOf(st),
    signer: null,
    signature: null,
  };
  if (opts["key-file"] !== undefined) {
    // a wallet without a provider: it can sign and can do nothing else
    const wallet = new ethers.Wallet(readKeyFile(opts["key-file"]));
    record.signer = wallet.address;
    record.signature = await permit.sign(wallet, st);
    const recovered = ethers.verifyTypedData(st.domain, st.types, st.message, record.signature);
    if (recovered !== wallet.address) throw new Error("the signature does not recover to the signing key: nothing is printed");
  }

  if (opts.out) fs.writeFileSync(opts.out, JSON.stringify(record, null, 2) + "\n");
  if (opts.json) {
    console.log(JSON.stringify(record, null, 2));
  } else {
    console.log(permit.describe(st));
    console.log("");
    console.log(JSON.stringify(record.typedData, null, 2));
    console.log("");
    console.log(`digest     ${record.digest}`);
    if (record.signature) {
      console.log(`signer     ${record.signer}`);
      console.log(`signature  ${record.signature}`);
      if (record.signer !== st.message.account) {
        console.log(`note       the signer is not the account: the statement is valid only if the account ${st.message.account} is a contract that accepts this key's signature`);
      }
    } else {
      console.log("not signed: no key file was named");
    }
  }
  return 0;
}

main().then((code) => { process.exitCode = code; }, (e) => { console.error(`sign-permit: ${e.message}`); process.exitCode = 1; });
