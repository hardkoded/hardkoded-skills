#!/bin/bash

# Self-contained wrapper: resolves its own directory so it works no matter
# where this skill folder is installed, and needs nothing beyond Node on PATH.

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

if ! command -v node &> /dev/null; then
  echo "Error: node is not installed or not in PATH"
  exit 1
fi

exec node "$SCRIPT_DIR/dist/cronito.cjs" "$@"
