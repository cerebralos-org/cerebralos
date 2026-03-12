#!/usr/bin/env bash
# CerebraLOS リリーススクリプト
# 使い方:
#   ./scripts/release.sh patch   → 1.0.2 → 1.0.3
#   ./scripts/release.sh minor   → 1.0.2 → 1.1.0
#   ./scripts/release.sh major   → 1.0.2 → 2.0.0
#   ./scripts/release.sh         → デフォルトは patch

set -e

BUMP=${1:-patch}
CURRENT_VERSION=$(node -p "require('./package.json').version")

echo ""
echo "🧠 CerebraLOS Release Script"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "Current version : v$CURRENT_VERSION"
echo "Bump type       : $BUMP"
echo ""

# 未コミットの変更がないか確認
if ! git diff --quiet || ! git diff --cached --quiet; then
  echo "❌ Uncommitted changes detected. Please commit or stash them first."
  exit 1
fi

# npm version でバージョンを上げる（git tagも自動で打たれる）
echo "📦 Bumping version..."
NEW_VERSION=$(npm version $BUMP --no-git-tag-version | tr -d 'v')

echo "✅ New version    : v$NEW_VERSION"
echo ""

# CHANGELOG の先頭に新バージョンのエントリを追加するよう案内
echo "📝 Don't forget to update CHANGELOG.md for v$NEW_VERSION"
echo ""

# package.json の変更をコミット
git add package.json
git commit -m "chore: bump version to $NEW_VERSION"

# Git タグを打つ
git tag "v$NEW_VERSION"

echo "🚀 Publishing to npm..."
npm publish --access public

echo ""
echo "📤 Pushing to GitHub..."
git push origin master
git push origin "v$NEW_VERSION"

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "✨ Released CerebraLOS v$NEW_VERSION!"
echo "   npm  : https://www.npmjs.com/package/cerebralos"
echo "   GitHub: https://github.com/cerebralos-org/cerebralos/releases/tag/v$NEW_VERSION"
echo ""
