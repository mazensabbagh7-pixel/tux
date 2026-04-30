#!/usr/bin/env bash
set -euo pipefail

# Vite writes hashed renderer assets directly under dist/ because assetsDir is ".".
# Since emptyOutDir is intentionally false (dist also contains main/preload/runtime files),
# repeated builds can leave stale main-*.js chunks and source maps that electron-builder
# will package. Remove only top-level renderer artifacts; preserve backend/preload outputs
# and subdirectories such as dist/cli, dist/node, dist/runtime, and dist/static.

DIST_DIR="${1:-dist}"

if [ ! -d "$DIST_DIR" ]; then
  exit 0
fi

before=$(find "$DIST_DIR" -maxdepth 1 -type f | wc -l | tr -d ' ')

find "$DIST_DIR" -maxdepth 1 -type f \
  \( \
    -name 'index.html' -o \
    -name 'terminal.html' -o \
    \( -name '*.js' ! -name 'preload.js' \) -o \
    -name '*.js.map' -o \
    -name '*.css' -o \
    -name '*.css.map' -o \
    -name '*.wasm' -o \
    -name '*.woff' -o \
    -name '*.woff2' -o \
    -name '*.ttf' \
  \) \
  -delete

after=$(find "$DIST_DIR" -maxdepth 1 -type f | wc -l | tr -d ' ')
removed=$((before - after))

if [ "$removed" -gt 0 ]; then
  echo "Removed $removed stale renderer artifact(s) from $DIST_DIR"
fi
