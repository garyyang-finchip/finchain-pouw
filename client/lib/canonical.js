// The one byte form of a record, and the hashes taken over it.
//
// A record is hashed in the canonical form of RFC 8785 (JSON Canonicalization Scheme): object
// members in the order of their names' UTF-16 code units, no white space, strings and numbers as
// ECMAScript serializes them, UTF-8. One restriction is added, the one production-service.md 4.2
// states for every record of this protocol: a number is an integer that a double holds exactly
// (at most 2^53 - 1 in magnitude). Every integer read from a chain that can be larger - an amount,
// an id, a GMU total - is carried as a decimal string from the moment it is read, and is never a
// number on the way. A record that holds anything else is refused, not rounded.
//
// The file a record is written to is the same record printed with indentation, for people. The
// hash is over the canonical form, not over the file's bytes: `scripts/report-hash.py` computes
// it again from a file, in another language and without this code.

"use strict";

const crypto = require("crypto");

const fail = (path, why) => { throw new Error(`not a canonical record at ${path || "the root"}: ${why}`); };

/// The canonical text of a value (RFC 8785 with the integer restriction).
function canonicalize(value, path = "") {
  if (value === null) return "null";
  if (typeof value === "boolean") return value ? "true" : "false";
  if (typeof value === "string") {
    if (!value.isWellFormed()) fail(path, "a string with a lone surrogate");
    return JSON.stringify(value);
  }
  if (typeof value === "number") {
    if (!Number.isSafeInteger(value)) fail(path, `the number ${value} is not an integer a double holds exactly: carry it as a decimal string`);
    return String(value === 0 ? 0 : value); // minus zero is zero
  }
  if (Array.isArray(value)) return `[${value.map((v, i) => canonicalize(v, `${path}[${i}]`)).join(",")}]`;
  if (typeof value === "object" && Object.getPrototypeOf(value) === Object.prototype) {
    // the default sort of strings is by UTF-16 code units, which is the order RFC 8785 asks for
    // a member without a value is not a member, as in JSON
    const keys = Object.keys(value).filter((k) => value[k] !== undefined).sort();
    return `{${keys.map((k) => `${canonicalize(k, path)}:${canonicalize(value[k], `${path}.${k}`)}`).join(",")}}`;
  }
  return fail(path, `a ${typeof value === "object" ? "value that is not a plain object" : typeof value}`);
}

const sha256 = (text) => crypto.createHash("sha256").update(Buffer.from(text, "utf8")).digest("hex");

/// A record without some of its top-level members.
const without = (record, names) => Object.fromEntries(Object.entries(record).filter(([k]) => !names.includes(k)));

// What a record says about the run that made it, and not about what was found: the two hashes
// themselves, the two times of the run, how the block was asked for, the endpoint that was asked and
// the client that asked.
const RUN_MEMBERS = ["reportHash", "resultHash", "observedAt", "recordedAt", "snapshotTag", "snapshotFinality", "endpointHost", "client"];

/// SHA-256 of the whole record in canonical form, its own `reportHash` member left out. Two runs
/// have two report hashes: the time each observed its block is part of what it reports.
const reportHash = (record) => sha256(canonicalize(without(record, ["reportHash"])));

/// SHA-256 of what was found, in canonical form: the record without the members that describe the
/// run. Two runs that read the same block and agree have the same result hash.
const resultHash = (record) => sha256(canonicalize(without(record, RUN_MEMBERS)));

/// The record with both hashes set.
function sealed(record) {
  const out = { ...record };
  out.resultHash = resultHash(out);
  out.reportHash = reportHash(out);
  return out;
}

module.exports = { canonicalize, sha256, without, RUN_MEMBERS, reportHash, resultHash, sealed };
