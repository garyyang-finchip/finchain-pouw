#!/usr/bin/env bash
# Reviewed operation wrapper, not a repository release. Run only after the specific R2b
# plan is approved. This script sends the deployment after all three NEW readings pass.
# Usage: bash deploy-reviewed-r2b.sh [path-to-finchain-pouw]
set -Eeuo pipefail
umask 077

REPO=${1:-"$HOME/finchip/finch/finchain-pouw"}
cd "$REPO"
EXPECTED_COMMIT=3c484778612df82804f2e1de7f2fcc11e57170c4
C=deployments/finchain-sepolia-r2b.config.json
K="$HOME/pouw-keys/finchain-sepolia-r2b"
O=out/finchain-sepolia-r2b
RPC=https://rpc.finchain.one
G=2026-11-29T11:30:00+08:00
STAGE=precheck
RUN=""

on_exit() {
  local rc=$?
  trap - EXIT
  if (( rc != 0 )); then
    local label=STOP
    if (( rc == 3 )) && [[ $STAGE == validate-three-funds-records ]]; then label=WAIT; fi
    printf '%s: %s exited %s.\n' "$label" "$STAGE" "$rc" >&2
    if [[ $STAGE == deployment ]]; then
      printf 'A deployment may be partial. Inspect its journal and transaction hashes before any retry; do not fund or deploy again automatically.\n' >&2
    else
      printf 'This wrapper has not invoked the deployment.\n' >&2
    fi
    [[ -z $RUN ]] || printf 'Reading/log directory retained: %s\n' "$RUN" >&2
  fi
  exit "$rc"
}
trap on_exit EXIT

[[ $(git rev-parse HEAD) == "$EXPECTED_COMMIT" ]] || {
  printf 'STOP: checkout is not the reviewed commit.\n' >&2; exit 2;
}
git diff --quiet
git diff --cached --quiet

# These are the dedicated round keys' PUBLIC address files, not either cell's key.
STEWARD=$(cat "$K/steward.address")
OG=$(cat "$K/delegate-og.address")
CELL_B=$(cat "$K/delegate-cell-b.address")
[[ ${STEWARD,,} == 0xdc4f433282f00170610d80703b952a250b4cdf50 ]] || exit 2
[[ ${OG,,} == 0x928fa5f1155d05e23c827bd31cdf42e5f621ff92 ]] || exit 2
[[ ${CELL_B,,} == 0x1d7823cfb6891bb2adc5f6d86081fd37c818b63e ]] || exit 2

mkdir -p "$O"
if [[ -e "$O/manifest.json" || -L "$O/manifest.json" ]] ||
   compgen -G "$O/deployment-*.journal.jsonl" >/dev/null; then
  printf 'STOP: a deployment manifest or prior journal exists. Inspect that attempt first.\n' >&2
  exit 2
fi

# mktemp creates a new, private directory. No glob, pre-existing reading or old output
# can satisfy this run's gate. The deployment itself keeps the reviewed canonical O.
RUN=$(mktemp -d "$O/predeploy-$(date -u +%Y%m%dT%H%M%SZ)-XXXXXX")
S="$RUN/funds-steward.json"
A="$RUN/funds-delegate-og.json"
B="$RUN/funds-delegate-cell-b.json"
R=(--rpc "$RPC" --chain-id 85422 --margin 50)

STAGE=steward-funds
node scripts/chain-reading.js "${R[@]}" --tx-bytes 32768 --address "$STEWARD" \
  --gas 11450000 --txs 19 --value 0.004 --out "$S"
STAGE=delegate-og-funds
node scripts/chain-reading.js "${R[@]}" --tx-bytes 2000 --address "$OG" \
  --gas 4113185 --txs 5 --funds 0.002 --out "$A"
STAGE=delegate-cell-b-funds
node scripts/chain-reading.js "${R[@]}" --tx-bytes 2000 --address "$CELL_B" \
  --gas 2709258 --txs 4 --funds 0.002 --out "$B"

STAGE=validate-three-funds-records
node - "$S" "$A" "$B" "$STEWARD" "$OG" "$CELL_B" <<'NODE'
const fs = require('fs');
const args = process.argv.slice(2);
if (args.length !== 6) throw new Error('exactly three files and three addresses are required');
const roles = [
  { file: args[0], address: args[3], txBytes: 32768, gas: '11450000', txs: '19', value: '4000000000000000', assumed: false },
  { file: args[1], address: args[4], txBytes: 2000, gas: '4113185', txs: '5', value: '0', assumed: true },
  { file: args[2], address: args[5], txBytes: 2000, gas: '2709258', txs: '4', value: '0', assumed: true },
];
for (const role of roles) {
  const r = JSON.parse(fs.readFileSync(role.file, 'utf8'));
  const c = r.coverage;
  const ok = r.schema === 'finchain-pouw.chain-reading/1' &&
    String(r.chainId) === '85422' && r.client?.version === '0.2.3' &&
    r.dataFee?.how === 'getL1FeeUpperBound' && r.dataFee.txBytes === role.txBytes &&
    c?.covered === true && c.address.toLowerCase() === role.address.toLowerCase() &&
    c.fundsAssumed === role.assumed && String(c.gas) === role.gas &&
    String(c.transactions) === role.txs && String(c.value) === role.value &&
    BigInt(c.marginPercent) >= 50n &&
    (!role.assumed || String(c.funds) === '2000000000000000');
  if (!ok) throw new Error(`STOP: the current record does not match the approved role/budget: ${role.file}`);
  // The steward funding was independently observed successful in block 716188. The
  // existing runbook requires a dependent action to wait for that block to finalize.
  if (!role.assumed && (!Number.isSafeInteger(r.finalized?.number) || r.finalized.number < 716188)) {
    console.error(`WAIT: the steward funding block 716188 is not finalized in ${role.file}; no deployment is invoked.`);
    process.exit(3);
  }
}
console.log('PASS: all three newly created readings match the reviewed roles, budgets and both fee conditions.');
NODE
sha256sum "$S" "$A" "$B" > "$RUN/funds.sha256.txt"

STAGE=deployment
node scripts/deploy-v2.js --config "$C" --keys "$K" --rpc "$RPC" \
  --out "$O" --genesis "$G" --yes 2>&1 | tee "$RUN/deploy.log"
STAGE=complete
printf 'Deployment command succeeded. Records/logs: %s\n' "$RUN"
printf 'Next: wait until finalized includes the last confirmed journal block, then verify.\n'
