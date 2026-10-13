#!/bin/bash
# Weekly CRM price check. REPORT ONLY: it never updates a CRM price.
# usage: run-check.sh [outDir] [maxDeals]
set -u
ROOT=/home/ubuntu/cabinet-dealz
OUT=${1:-/home/ubuntu/crm-price-check/$(date +%Y-%m-%d)}
MAX=${2:-10000}
PORT=3100
cd "$ROOT" || exit 1
mkdir -p "$OUT"
snap() { pnpm exec tsx scripts/crm-price-check/snapshot.mts 2>&1 | sed -n 's/^SNAPSHOT //p' | tail -1; }

BEFORE=$(snap)
echo "before: $BEFORE"
pnpm exec tsx scripts/crm-price-check/export-deals.mts "$OUT" 2>&1 | grep -E "EXPORTED|rror" || { echo "export failed"; exit 1; }

# Private second server with the view log switched off, so opening designs leaves no trace.
# It runs in its own process group so it can be stopped cleanly afterwards.
CD_SKIP_VIEW_LOG=1 NODE_ENV=development PORT=$PORT setsid pnpm exec tsx server/_core/index.ts > "$OUT/server.log" 2>&1 &
SRV=$!
stop_server() { kill -- -"$SRV" 2>/dev/null; kill "$SRV" 2>/dev/null; }
trap stop_server EXIT
for i in $(seq 1 60); do curl -s -o /dev/null "http://127.0.0.1:$PORT/" && break; sleep 2; done
curl -s -o /dev/null -w "check server http %{http_code}\n" "http://127.0.0.1:$PORT/"

python3 scripts/crm-price-check/read-totals.py "$OUT" "http://127.0.0.1:$PORT" "$MAX" | tee "$OUT/read.log" | tail -4
stop_server

AFTER=$(snap)
echo "after:  $AFTER"
python3 - "$OUT" "$BEFORE" "$AFTER" <<'PY'
import json, sys
out, b, a = sys.argv[1], json.loads(sys.argv[2]), json.loads(sys.argv[3])
json.dump({"before": b, "after": a, "unchanged": b == a}, open(f"{out}/snapshot_check.json", "w"))
print("UNCHANGED" if b == a else "CHANGED!")
PY
python3 scripts/crm-price-check/build-report.py "$OUT" snap
rm -f "$OUT/token.txt"
