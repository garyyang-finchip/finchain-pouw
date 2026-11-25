"use strict";

// The interfaces of ledger v2 are frozen (docs/decisions.md A81; docs/ledger-v2.md 11.8). The
// record of the freeze is contracts/v2/interfaces.frozen.json, written from the commit it names.
// These tests fail when the tree is not what that record holds: a change of an interface is then
// a change of the record as well, made on purpose and with a ruling to cite.

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { expect } = require("chai");
const t = require("./v2.helpers");
const { ethers, v2, permit } = t;

const root = path.join(__dirname, "..");
const frozen = JSON.parse(fs.readFileSync(path.join(root, "contracts", "v2", "interfaces.frozen.json"), "utf8"));
const sha = (bytes) => crypto.createHash("sha256").update(bytes).digest("hex");
const typeString = (name, fields) => `${name}(${fields.map((f) => `${f.type} ${f.name}`).join(",")})`;

describe("Ledger v2: the interfaces are frozen", () => {
  it("keeps the five compiled interfaces and the fixed vectors byte for byte", () => {
    expect(Object.keys(frozen.abi)).to.deep.equal(["FogaCellGuard", "GenesisLedgerV2", "GenesisPolicyV2", "IParticipantGuard", "TenderAdapter8414V2"]
      .map((name) => `client/abi/${name}.json`));
    expect(Object.keys(frozen.vectors)).to.deep.equal(["test/vectors/permit-v2.json"]);
    for (const [file, hash] of Object.entries({ ...frozen.abi, ...frozen.vectors })) {
      expect(sha(fs.readFileSync(path.join(root, file))), `${file} is not the frozen file`).to.equal(hash);
    }
    // that the interfaces are also what the sources compile to is the test of boundaries.test.js
  });

  it("keeps the types and the three interfaces as they were written: the compiler pragma is the one line of a file that may differ", () => {
    expect(Object.keys(frozen.sources)).to.deep.equal(["contracts/v2/TypesV2.sol", "contracts/v2/interfaces/IGenesisLedgerV2.sol",
      "contracts/v2/interfaces/IGenesisPolicyV2.sol", "contracts/v2/interfaces/IParticipantGuard.sol"]);
    for (const [file, hashes] of Object.entries(frozen.sources)) {
      const lines = fs.readFileSync(path.join(root, file), "utf8").split("\n");
      const pragma = lines.filter((l) => /^pragma solidity [^;]+;$/.test(l));
      expect(pragma.length, `${file}: one compiler pragma`).to.equal(1);
      expect(sha(lines.filter((l) => l !== pragma[0]).join("\n")), `${file} differs from the frozen source in more than its pragma`).to.equal(hashes.sha256WithoutPragma);
    }
  });

  it("keeps the three statements, their domain, the tags of the encodings and every code, off chain and in the contract", async () => {
    const [, w] = await ethers.getSigners();
    const d = await t.deploy({ admit: [w] });
    const s = frozen.statements;
    // the type strings, written out; their hashes; and the constants of the contract
    expect({
      EIP712Domain: typeString("EIP712Domain", permit.DOMAIN_TYPE),
      Permit: typeString("Permit", permit.TYPES.Permit),
      Revoke: typeString("Revoke", permit.TYPES.Revoke),
      RaiseNonce: typeString("RaiseNonce", permit.TYPES.RaiseNonce),
    }).to.deep.equal(s.types);
    for (const [name, text] of Object.entries(s.types)) expect(ethers.id(text), name).to.equal(s.typeHashes[name]);
    expect([await d.ledger.EIP712_DOMAIN_TYPEHASH(), await d.ledger.PERMIT_TYPEHASH(), await d.ledger.REVOKE_TYPEHASH(), await d.ledger.RAISE_NONCE_TYPEHASH()])
      .to.deep.equal([s.typeHashes.EIP712Domain, s.typeHashes.Permit, s.typeHashes.Revoke, s.typeHashes.RaiseNonce]);
    expect({ name: permit.NAME, version: permit.VERSION }).to.deep.equal(s.domain);
    const { chainId } = await ethers.provider.getNetwork();
    expect(await d.ledger.domainSeparator()).to.equal(ethers.TypedDataEncoder.hashDomain({ ...s.domain, chainId, verifyingContract: d.ledgerAddress }));

    // the two tags, as the contract encodes them
    const tagged = (tag) => ethers.keccak256(ethers.AbiCoder.defaultAbiCoder().encode(["string", "uint256", "address"], [tag, chainId, d.ledgerAddress]));
    expect([v2.LEDGER_DOMAIN_TAG, v2.FACT_DOMAIN_TAG]).to.deep.equal([frozen.encodings.ledgerDomainTag, frozen.encodings.factDomainTag]);
    expect([await d.ledger.domain(), await d.ledger.factDomain()]).to.deep.equal([tagged(frozen.encodings.ledgerDomainTag), tagged(frozen.encodings.factDomainTag)]);

    // every code: what a number means does not change under a receipt that holds it
    expect({
      pools: { G0: v2.POOL_G0, G1: v2.POOL_G1 },
      operations: permit.OP,
      knownScope: permit.KNOWN_SCOPE,
      ineligible: v2.INELIGIBLE,
      reasonOrder: v2.REASON_ORDER,
      role: v2.ROLE,
      unit: v2.UNIT,
      path: v2.PATH,
    }).to.deep.equal(frozen.codes);
  });
});
