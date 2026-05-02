#!/bin/bash
# push-to-github.sh — push current state to the salon-seal GitHub repo
set -e

REPO="JBlizzard-sketch/salon-seal"
REMOTE="https://${GITHUB_PERSONAL_ACCESS_TOKEN}@github.com/${REPO}.git"

cd "$(git rev-parse --show-toplevel)"

# Configure git identity if not set
git config user.email "ci@salon-seal.app" 2>/dev/null || true
git config user.name "SalonSeal Bot" 2>/dev/null || true

# Set or update the remote
git remote remove github 2>/dev/null || true
git remote add github "$REMOTE"

# Stage and commit everything
git add -A
git diff --cached --quiet || git commit -m "chore: sync workspace to GitHub [$(date '+%Y-%m-%d %H:%M')]"

# Push to GitHub
git push github HEAD:main --force
echo "✅ Pushed to https://github.com/${REPO}"
