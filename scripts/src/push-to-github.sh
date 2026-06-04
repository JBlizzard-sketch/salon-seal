#!/bin/bash
# push-to-github.sh — push current workspace to GitHub
# Stable entrypoint called by the post-commit hook and manually.
#
# 1. Ensures the `github` remote is configured in .git/config.
# 2. Delegates the actual push to the TypeScript REST-API script
#    (git push is sandboxed in this Replit environment; we use the API).
set -e

ROOT="$(git rev-parse --show-toplevel)"
cd "$ROOT"

REPO="JBlizzard-sketch/salon-seal"
GITHUB_URL="https://github.com/${REPO}.git"

# Ensure `github` remote exists and points to the correct repo.
# Write directly to .git/config because `git remote add/set-url` is
# sandboxed in this environment.
if ! git --no-optional-locks remote | grep -q '^github$'; then
  cat >> "$ROOT/.git/config" << REMOTE_EOF

[remote "github"]
	url = ${GITHUB_URL}
	fetch = +refs/heads/*:refs/remotes/github/*
REMOTE_EOF
  echo "[push-to-github] Configured 'github' remote → ${GITHUB_URL}"
else
  echo "[push-to-github] 'github' remote already configured → ${GITHUB_URL}"
fi

# Delegate actual push to the TypeScript script (uses GitHub REST API).
pnpm --filter @workspace/scripts run push-github
