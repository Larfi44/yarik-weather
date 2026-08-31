#!/bin/bash
# ============================================================
#  Build the static site and publish it to GitVerse Pages
#
#  Usage:  ./scripts/deploy-gitverse.sh [branch] [remote]
#    branch  - Git branch that holds the site (default: pages)
#    remote  - Git remote to push to       (default: gitverse)
#
#  Builds frontend/out, puts its contents on the given branch and
#  pushes it. Then enable Pages ONCE in the web UI:
#    gitverse.ru -> yarik-weather -> Settings -> Pages
#    source: branch "pages", folder "/"
#  Site URL: https://<owner>.gitverse.site/yarik-weather
# ============================================================
set -euo pipefail

cd "$(dirname "$0")/.."

BRANCH="${1:-pages}"
REMOTE="${2:-gitverse}"

echo "==> 1/3 Building static site (frontend -> out/)"
(cd frontend && npm run build:pages)

# Stage the built site in a temporary folder
SITE_DIR=$(mktemp -d)
WORKTREE=$(mktemp -d)
trap 'git worktree remove --force "$WORKTREE" 2>/dev/null || true; rm -rf "$SITE_DIR"' EXIT
cp -R frontend/out/. "$SITE_DIR/"
# Disable GitVerse's built-in Jekyll processing for plain static files
touch "$SITE_DIR/.nojekyll"

echo "==> 2/3 Preparing branch '$BRANCH'"
if git show-ref --verify --quiet "refs/heads/$BRANCH"; then
  git worktree add --force "$WORKTREE" "$BRANCH"
  git -C "$WORKTREE" rm -rf --quiet . 2>/dev/null || true
else
  git worktree add --force --detach "$WORKTREE"
  git -C "$WORKTREE" checkout --orphan "$BRANCH"
fi

# Replace the branch contents with the freshly built site
find "$WORKTREE" -mindepth 1 -maxdepth 1 ! -name '.git' -exec rm -rf {} +
cp -R "$SITE_DIR"/. "$WORKTREE"/

git -C "$WORKTREE" add -A
if git -C "$WORKTREE" diff --cached --quiet; then
  echo "No changes to publish — site is up to date."
else
  git -C "$WORKTREE" commit -m "Deploy static site - $(date '+%Y-%m-%d %H:%M:%S')"
  echo "==> 3/3 Pushing '$BRANCH' -> '$REMOTE'"
  git -C "$WORKTREE" push --force "$REMOTE" "$BRANCH"
fi

git worktree remove --force "$WORKTREE"

echo ""
echo "Done! Site is published on '$REMOTE/$BRANCH'."
echo "If this is the first time, enable Pages in the web UI once:"
echo "  gitverse.ru -> yarik-weather -> Settings -> Pages"
echo "  source: branch '$BRANCH', folder '/', then Save."
echo "Site URL: https://<owner>.gitverse.site/yarik-weather"