#!/bin/zsh
set -eu
cd -- "${0:A:h}"
if ! command -v node >/dev/null 2>&1; then
  print 'Install Node.js 22 or newer, then run this launcher again.'
  read -r '?Press Enter to close.'
  exit 1
fi
if [[ ! -f dist/app.js || ! -d node_modules ]]; then
  print 'First run: npm ci --ignore-scripts --no-audit --no-fund && npm run build'
  read -r '?Press Enter to close.'
  exit 1
fi
exec node start-local.mjs
