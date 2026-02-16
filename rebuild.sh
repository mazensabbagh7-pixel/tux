#!/bin/bash
set -e
cd /home/coder/coder/mux

echo "=== Building frontend ==="
npx vite build 2>&1 | tail -3

echo "=== Killing old server ==="
pkill -f "node dist/cli/index.js server" 2>/dev/null || true
sleep 2

echo "=== Starting server ==="
MUX_SERVER_AUTH_TOKEN=mux-experiment-token nohup node dist/cli/index.js server --port 4000 --host 0.0.0.0 > /tmp/mux-server.log 2>&1 &
sleep 4

HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:4000/health)
if [ "$HTTP_CODE" = "200" ]; then
    echo "=== Server is UP (200 OK) ==="
else
    echo "=== Server FAILED (HTTP $HTTP_CODE) ==="
    cat /tmp/mux-server.log | tail -20
fi
