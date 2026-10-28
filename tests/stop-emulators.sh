#!/usr/bin/env bash
# Stops emulators started by start-emulators.sh (SIGINT lets firebase-tools shut down the JVMs cleanly).
HERE="$(cd "$(dirname "$0")" && pwd)"
PIDF="$HERE/.emulators.pid"
[ -f "$PIDF" ] || { echo "no pid file; nothing to stop"; exit 0; }
PID="$(cat "$PIDF")"
kill -INT "$PID" 2>/dev/null || true
for i in $(seq 1 30); do kill -0 "$PID" 2>/dev/null || break; sleep 1; done
kill -0 "$PID" 2>/dev/null && kill -9 "$PID" 2>/dev/null
rm -f "$PIDF"; echo "stopped"
