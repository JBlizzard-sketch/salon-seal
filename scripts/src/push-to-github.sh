#!/bin/bash
# push-to-github.sh — push current state to the salon-seal GitHub repo
# Delegates to the TypeScript push script which uses the GitHub REST API
# (no `git push` required — works inside the Replit sandbox).
set -e
cd "$(git rev-parse --show-toplevel)"
pnpm --filter @workspace/scripts run push-github
