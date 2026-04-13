#!/usr/bin/env bash

set -Eeuo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd -- "$SCRIPT_DIR/.." && pwd)"
API_DIR="$REPO_ROOT/api"
FRONTEND_DIR="$REPO_ROOT/frontend"

log() {
  printf '\n[%s] %s\n' "$(date '+%Y-%m-%d %H:%M:%S')" "$*"
}

require_command() {
  if ! command -v "$1" >/dev/null 2>&1; then
    printf 'Missing required command: %s\n' "$1" >&2
    exit 1
  fi
}

require_command git
require_command npm
require_command pm2
require_command sudo
require_command systemctl

log "Deploy started in $REPO_ROOT"

log "Pulling latest changes"
git -C "$REPO_ROOT" pull --ff-only

log "Installing API dependencies"
npm --prefix "$API_DIR" install --no-fund --no-audit

log "Installing frontend dependencies"
npm --prefix "$FRONTEND_DIR" install --no-fund --no-audit

log "Building frontend production bundle"
npm --prefix "$FRONTEND_DIR" run build:prod

log "Restarting PM2 processes"
pm2 restart all

log "Restarting nginx"
sudo systemctl restart nginx

log "Deploy finished successfully"
git -C "$REPO_ROOT" rev-parse --short HEAD
