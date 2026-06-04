#!/bin/bash
# install-hooks.sh — install git hooks for this workspace
# Run once after cloning, or automatically via the root `prepare` npm script.
set -e

ROOT="$(git rev-parse --show-toplevel)"
HOOKS_DIR="$ROOT/.git/hooks"

cat > "$HOOKS_DIR/post-commit" << 'HOOK'
#!/bin/bash
# post-commit — mirror every local commit to GitHub automatically
if [ -z "${GITHUB_PERSONAL_ACCESS_TOKEN}" ]; then
  exit 0
fi
ROOT="$(git rev-parse --show-toplevel)"
cd "$ROOT"
bash scripts/src/push-to-github.sh 2>&1 | sed 's/^/[post-commit] /' || \
  echo "[post-commit] ⚠️  GitHub push failed (non-fatal)" >&2
exit 0
HOOK

chmod +x "$HOOKS_DIR/post-commit"
echo "✅ Git hooks installed"
