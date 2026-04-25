#!/bin/bash
set -euo pipefail

if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
  exit 0
fi

cd "$CLAUDE_PROJECT_DIR"

if [ -f .gitmodules ]; then
  git submodule update --init --recursive || echo "session-start: submodule init failed, continuing"
fi

npm install

npm run build
