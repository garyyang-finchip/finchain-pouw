#!/usr/bin/env python3
"""Compute the hashes of a record again, from its file, without the client's code.

    python3 scripts/report-hash.py <record.json> [<record.json> ...]

Prints, for each file, the report hash and the result hash as this program computes them, and
whether they are the ones the record states. Exit status 0 when every stated hash is the
recomputed one, 2 when one differs, 1 on any other failure.

The byte form is that of RFC 8785 (JSON Canonicalization Scheme) with the restriction the
records of this protocol keep: a number is an integer of at most 2^53 - 1 in magnitude, and a
larger integer is a decimal string. Object members are ordered by the UTF-16 code units of their
names; there is no white space; strings are escaped as ECMAScript escapes them; the text is
UTF-8. The report hash is the SHA-256 of the record without its `reportHash` member; the result
hash is the SHA-256 of the record without the members that describe the run.

A file is refused, and nothing is computed from it, when an object in it - at any depth - names
a member twice: a parser that keeps the last of the two would hash a record that is not the one
in the file.

Standard library only.
"""
import hashlib
import json
import sys

RUN_MEMBERS = ("reportHash", "resultHash", "observedAt", "recordedAt", "snapshotTag", "snapshotFinality", "endpointHost", "client")
SAFE = 2 ** 53 - 1
SHORT = {0x08: "\\b", 0x09: "\\t", 0x0A: "\\n", 0x0C: "\\f", 0x0D: "\\r", 0x22: '\\"', 0x5C: "\\\\"}


class NotCanonical(Exception):
    pass


def text(value, path):
    out = ['"']
    for ch in value:
        code = ord(ch)
        if 0xD800 <= code <= 0xDFFF:
            raise NotCanonical("%s: a string with a lone surrogate" % (path or "the root"))
        if code in SHORT:
            out.append(SHORT[code])
        elif code < 0x20:
            out.append("\\u%04x" % code)
        else:
            out.append(ch)
    out.append('"')
    return "".join(out)


def canonical(value, path=""):
    if value is None:
        return "null"
    if value is True:
        return "true"
    if value is False:
        return "false"
    if isinstance(value, str):
        return text(value, path)
    if isinstance(value, int):
        if abs(value) > SAFE:
            raise NotCanonical("%s: the number %d is not an integer a double holds exactly" % (path or "the root", value))
        return str(value)
    if isinstance(value, list):
        return "[" + ",".join(canonical(v, "%s[%d]" % (path, i)) for i, v in enumerate(value)) + "]"
    if isinstance(value, dict):
        keys = sorted(value, key=lambda k: k.encode("utf-16-be"))
        return "{" + ",".join(text(k, path) + ":" + canonical(value[k], "%s.%s" % (path, k)) for k in keys) + "}"
    raise NotCanonical("%s: a %s" % (path or "the root", type(value).__name__))


def refuse_duplicates(pairs):
    """An object as the file gives it, member by member: a name given twice is refused."""
    out = {}
    for name, value in pairs:
        if name in out:
            raise NotCanonical("the member %s is given twice in one object" % json.dumps(name))
        out[name] = value
    return out


def refuse_float(literal):
    raise NotCanonical("the number %s is not an integer: carry it as a decimal string" % literal)


def sha256(record, leave_out):
    kept = {k: v for k, v in record.items() if k not in leave_out}
    return hashlib.sha256(canonical(kept).encode("utf-8")).hexdigest()


def main(paths):
    if not paths:
        print(__doc__.strip().split("\n\n")[1].strip(), file=sys.stderr)
        return 1
    differs = False
    for path in paths:
        with open(path, encoding="utf-8") as f:
            record = json.load(f, parse_float=refuse_float, parse_constant=refuse_float, object_pairs_hook=refuse_duplicates)
        if not isinstance(record, dict):
            raise NotCanonical("%s: a record is an object" % path)
        computed = {"reportHash": sha256(record, ("reportHash",)), "resultHash": sha256(record, RUN_MEMBERS)}
        for name in ("reportHash", "resultHash"):
            stated = record.get(name)
            verdict = "not stated" if stated is None else ("as stated" if stated == computed[name] else "DIFFERS from the stated %s" % stated)
            differs = differs or (stated is not None and stated != computed[name])
            print("%s  %s  %s  %s" % (computed[name], name, path, verdict))
    return 2 if differs else 0


if __name__ == "__main__":
    try:
        sys.exit(main(sys.argv[1:]))
    except (NotCanonical, OSError, ValueError) as e:
        print("report-hash: %s" % e, file=sys.stderr)
        sys.exit(1)
