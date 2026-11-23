#!/usr/bin/env node
// Make key files for a deployment's parties, on the machine that will use them.
//
//   node scripts/keys.js <directory> <name> [<name> ...]
//
// For each name the directory gets <name>.key (the private key; readable by its owner only) and
// <name>.address (the address; public). A key that exists is kept: nothing is ever overwritten. The
// directory must lie outside this repository's checkout, so that no key can be committed by
// accident. Only addresses are printed.
//
// These are fresh keys for this protocol. Do not point any script here at the key of a running agent
// node instead: two programs sending from one key collide on nonces.
"use strict";

const fs = require("fs");
const { ethers } = require("ethers");
const c = require("./lib/common");

async function main() {
  const opts = c.parse(process.argv.slice(2));
  if (opts.help || opts._.length < 2) {
    console.log("usage: node scripts/keys.js <directory> <name> [<name> ...]   (--json for JSON)");
    return opts.help ? 0 : 1;
  }
  const dir = c.expand(opts._[0]);
  const names = opts._.slice(1);
  if (c.inRepository(dir)) throw new Error(`${dir} is inside this repository's checkout: keep keys outside it, for example under ~/pouw-keys`);
  for (const n of names) if (!/^[a-z0-9][a-z0-9-]{0,39}$/.test(n)) throw new Error(`the name ${n} must be lower-case letters, digits and hyphens`);
  if (new Set(names).size !== names.length) throw new Error("a name is given twice");

  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  if (process.platform !== "win32" && (fs.statSync(dir).mode & 0o077) !== 0) fs.chmodSync(dir, 0o700);

  const out = [];
  for (const name of names) {
    const keyFile = c.keyFileOf(dir, name);
    let made = false;
    if (!fs.existsSync(keyFile)) {
      const wallet = new ethers.Wallet(ethers.hexlify(ethers.randomBytes(32)));
      fs.writeFileSync(keyFile, `${wallet.privateKey}\n`, { mode: 0o600, flag: "wx" }); // fails rather than overwrite
      made = true;
    }
    const address = new ethers.Wallet(c.readKeyFile(keyFile)).address;
    fs.writeFileSync(`${keyFile.slice(0, -4)}.address`, `${address}\n`, { mode: 0o644 });
    out.push({ name, address, key: made ? "made" : "kept" });
  }
  if (opts.json) console.log(JSON.stringify({ directory: dir, keys: out }, null, 2));
  else {
    console.log(`keys in ${dir}`);
    for (const k of out) console.log(`  ${k.name.padEnd(16)} ${k.address}  (${k.key})`);
  }
  return 0;
}

c.run(main, "keys");
