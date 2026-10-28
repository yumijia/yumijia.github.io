#!/usr/bin/env bash
# Starts the Firebase Auth (9099) + Firestore (8080) emulators in the background
# for the offline demo project "demo-yumijia" (never touches a real project).
# Stop with: ./stop-emulators.sh
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
PROD="$(cd "$HERE/.." && pwd)"
export FIREBASE_EMULATORS_PATH="$HERE/.cache/emulators"   # jar cache, gitignored
export NO_UPDATE_NOTIFIER=1
mkdir -p "$FIREBASE_EMULATORS_PATH"
[ -d "$HERE/node_modules" ] || (cd "$HERE" && npm ci --no-fund --no-audit)

port_up() { (exec 3<>"/dev/tcp/127.0.0.1/$1") 2>/dev/null; }

if port_up 8080 && port_up 9099; then echo "Emulators already running (auth:9099, firestore:8080)"; exit 0; fi

cd "$HERE"   # keeps firebase-debug.log / firestore-debug.log in tests/ (gitignored)
nohup "$HERE/node_modules/.bin/firebase" --config "$PROD/firebase.json" emulators:start \
  --only auth,firestore --project demo-yumijia \
  > "$HERE/emulators.log" 2>&1 < /dev/null &
echo $! > "$HERE/.emulators.pid"

for i in $(seq 1 180); do
  if port_up 8080 && port_up 9099; then
    echo "ready: auth=127.0.0.1:9099 firestore=127.0.0.1:8080 (pid $(cat "$HERE/.emulators.pid"), log $HERE/emulators.log)"
    exit 0
  fi
  if ! kill -0 "$(cat "$HERE/.emulators.pid")" 2>/dev/null; then
    echo "emulators exited early; see $HERE/emulators.log" >&2; tail -30 "$HERE/emulators.log" >&2; exit 1
  fi
  sleep 1
done
echo "timed out waiting for emulators; see $HERE/emulators.log" >&2; exit 1
