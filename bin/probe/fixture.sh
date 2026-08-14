#!/usr/bin/env bash
# Build a probe fixture: a copy of staging/ with Babylon vendored locally, then serve it.
#
# WHY: index.html loads babylon.js, cannon.js and the serializers from cdn.babylonjs.com with
# BLOCKING script tags, so when that CDN is slow (it was unreachable for a stretch on
# 2026-08-13) every probe reports "AITutor never loaded" and you go hunting a bug in your own
# code. The fixture removes the CDN from the QA loop entirely. It changes nothing the probes
# measure: same page, same tutor layer, three URLs rewritten.
#
#   bin/probe/fixture.sh          # build into .probe-fixture/ and serve on 8785
#   PORT=8790 bin/probe/fixture.sh
#
# Then point the harness at it:
#   node bin/probe/cdp.mjs "http://localhost:8785/tiny-ai/" 5000 out.png bin/probe/byoai.js
set -euo pipefail
REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
OUT="$REPO/.probe-fixture"          # gitignored: it is build output, not source
PORT="${PORT:-8785}"
V="$OUT/vendor"

mkdir -p "$V"
# vendor once, from the npm registry (the CDN is the thing we are routing around)
BJS_VER="${BJS_VER:-8.32.0}"
fetch() {  # url, dest; resume-friendly, the tarballs are large
  local url="$1" dest="$2" i
  [ -s "$dest" ] && return 0
  for i in 1 2 3 4 5 6; do
    curl -sSL -C - --max-time 180 -o "$dest" "$url" && return 0
    echo "  retry $i ($(stat -f%z "$dest" 2>/dev/null || echo 0) bytes so far)"
  done
  echo "could not fetch $url" >&2; return 1
}
if [ ! -s "$V/babylon.js" ]; then
  echo "vendoring babylon $BJS_VER (once)…"
  fetch "https://registry.npmjs.org/babylonjs/-/babylonjs-$BJS_VER.tgz" "$OUT/bjs.tgz"
  tar -xzf "$OUT/bjs.tgz" -C "$OUT" package/babylon.js && mv "$OUT/package/babylon.js" "$V/babylon.js"
  fetch "https://registry.npmjs.org/babylonjs-serializers/-/babylonjs-serializers-$BJS_VER.tgz" "$OUT/ser.tgz"
  tar -xzf "$OUT/ser.tgz" -C "$OUT" package/babylonjs.serializers.min.js \
    && mv "$OUT/package/babylonjs.serializers.min.js" "$V/babylonjs.serializers.min.js"
  fetch "https://cdn.jsdelivr.net/npm/cannon@0.6.2/build/cannon.min.js" "$V/cannon.js"
  rm -rf "$OUT/package" "$OUT"/*.tgz
fi

rsync -a --delete "$REPO/staging/tiny-ai/" "$OUT/tiny-ai/"
rsync -a --delete "$REPO/staging/labs/"    "$OUT/labs/"
sed -i '' \
  -e 's|https://cdn.babylonjs.com/babylon.js|/vendor/babylon.js|' \
  -e 's|https://cdn.babylonjs.com/cannon.js|/vendor/cannon.js|' \
  -e 's|https://cdn.babylonjs.com/serializers/babylonjs.serializers.min.js|/vendor/babylonjs.serializers.min.js|' \
  "$OUT/tiny-ai/index.html"

# A server answering on this port is NOT proof it is serving THIS directory. An abandoned
# server from an earlier run kept the port and quietly served a stale copy of the lab through
# a whole round of probing, which reads exactly like "my change did nothing".
STAMP="probe-fixture-$$-$(git -C "$REPO" rev-parse --short HEAD 2>/dev/null || echo nogit)"
echo "$STAMP" > "$OUT/.stamp"
if [ "$(curl -s --max-time 3 "http://localhost:$PORT/.stamp" || true)" != "$STAMP" ]; then
  # `|| true` is load-bearing: lsof exits 1 when nothing holds the port, which is the NORMAL
  # case, and under `set -o pipefail` that failure propagates through the pipe and `set -e`
  # kills the script before it can start the server. Same trap as the grep -q one in CLAUDE.md.
  pid=$(lsof -tiTCP:"$PORT" -sTCP:LISTEN 2>/dev/null | head -1 || true)
  if [ -n "$pid" ]; then
    echo "port $PORT held by pid $pid serving something else; replacing it"
    kill "$pid" 2>/dev/null || true
    sleep 1
  fi
  (python3 -m http.server "$PORT" --directory "$OUT" >/dev/null 2>&1 &)
  sleep 1
fi
got=$(curl -s --max-time 3 "http://localhost:$PORT/.stamp" || true)
[ "$got" = "$STAMP" ] || { echo "FAILED: port $PORT is not serving $OUT" >&2; exit 1; }
echo "fixture on http://localhost:$PORT/tiny-ai/  (babylon served locally, verified)"
