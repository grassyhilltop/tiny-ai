#!/usr/bin/env bash
# One command to get FULL live tutoring working in the Claude app.
#
# Why this exists: the claude.ai chat client will only fetch URLs that already appeared in the
# conversation, so the zero-setup relay path (a URL per command) cannot work there; a
# constructed command URL is refused, or silently matched to some earlier URL and the wrong
# payload goes out. An MCP connector has no such limit, because the AI calls tools directly
# instead of dressing commands up as web pages. This script stands one up and prints the two
# things you need to paste.
#
#   bin/tutor-live.sh                 # public tunnel, works with claude.ai and the apps
#   bin/tutor-live.sh --local         # localhost only, for Claude Code on this machine
#
set -euo pipefail
REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PORT="${PORT:-8787}"
LAB="${LAB:-https://claybits.xyz/staging/tiny-ai/}"
ROOM="$(LC_ALL=C tr -dc 'ACDEFHJKMNPRTWXY34679' < /dev/urandom | head -c 4)"

cleanup() { kill ${BRIDGE_PID:-0} ${TUNNEL_PID:-0} 2>/dev/null || true; }
trap cleanup EXIT

command -v node >/dev/null || { echo "node is required"; exit 1; }
node "$REPO/staging/tiny-ai/tutor-bridge/server.mjs" > /tmp/tutor-bridge.log 2>&1 &
BRIDGE_PID=$!
sleep 1
curl -sf "http://localhost:$PORT/" >/dev/null || { echo "bridge did not start; see /tmp/tutor-bridge.log"; exit 1; }
echo "bridge up on :$PORT (log: /tmp/tutor-bridge.log)"

BASE="http://localhost:$PORT"
if [ "${1:-}" != "--local" ]; then
  # cloudflared needs no account for a quick tunnel; brew install cloudflared
  command -v cloudflared >/dev/null || {
    echo
    echo "cloudflared is not installed, and claude.ai needs a public https URL."
    echo "  brew install cloudflared      then run this again"
    echo "  (or use --local with Claude Code on this machine)"
    exit 1
  }
  cloudflared tunnel --url "http://localhost:$PORT" > /tmp/tutor-tunnel.log 2>&1 &
  TUNNEL_PID=$!
  echo "opening a public tunnel..."
  for _ in $(seq 1 40); do
    BASE="$(grep -om1 'https://[a-z0-9-]*\.trycloudflare\.com' /tmp/tutor-tunnel.log || true)"
    [ -n "$BASE" ] && break
    sleep 1
  done
  [ -n "$BASE" ] || { echo "tunnel did not come up; see /tmp/tutor-tunnel.log"; exit 1; }
fi

cat <<EOF

  ROOM $ROOM

  1. Open your lab page with the bridge attached:
     $LAB?bridge=$BASE&room=$ROOM

  2. In claude.ai: Settings, Connectors, Add custom connector, paste:
     $BASE/mcp/$ROOM

  3. In a new chat say: "You are my tutor for the tiny-ai lab. Call get_page_state,
     introduce yourself, then point at where I am and ask me one question."
     Voice mode works the same way.

  Claude Code instead of the app:
     claude mcp add --transport http tutor $BASE/mcp/$ROOM

  Ctrl-C stops the bridge and the tunnel.

EOF
wait $BRIDGE_PID
