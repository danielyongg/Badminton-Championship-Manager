#!/bin/bash
# Pasang dependensi npm (npm ci: sesuai lockfile, tidak mengubahnya) di sesi cloud Claude Code agar typecheck, test & build bisa dijalankan.
set -euo pipefail

if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
  exit 0
fi

cd "$CLAUDE_PROJECT_DIR"

# Di lingkungan cloud, registry.npmjs.org ada di NO_PROXY tetapi DNS langsung tidak tersedia:
# paksa npm lewat proxy agen bila ada.
if [ -n "${HTTPS_PROXY:-}" ]; then
  NO_PROXY= no_proxy= npm_config_noproxy= npm ci --no-audit --no-fund \
    --proxy "$HTTPS_PROXY" --https-proxy "$HTTPS_PROXY" --noproxy ""
else
  npm ci --no-audit --no-fund
fi
