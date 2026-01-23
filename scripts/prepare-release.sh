#!/bin/bash

# Release helper script for @wtree/payload-ecommerce-coupon
# Usage: ./scripts/prepare-release.sh [patch|minor|major|x.y.z]

set -e

if [ -z "$1" ]; then
  echo "Usage: ./scripts/prepare-release.sh [patch|minor|major|x.y.z]"
  echo "Example: ./scripts/prepare-release.sh patch"
  exit 1
fi

VERSION=$1
CURRENT_VERSION=$(node -p "require('./package.json').version")

echo "📦 @wtree/payload-ecommerce-coupon Release Helper"
echo "================================================="
echo ""
echo "Current version: $CURRENT_VERSION"
echo "New version: $VERSION"
echo ""

# Validate
echo "📋 Running validation..."
npm run lint
npm run type-check
npm test

echo ""
echo "✅ All checks passed!"
echo ""

# Bump version
echo "🚀 Bumping version..."
npm version "$VERSION" -m "chore: release v%s"

echo ""
echo "📤 Pushing to GitHub..."
git push origin main --follow-tags

echo ""
echo "✅ Release complete!"
echo ""
echo "GitHub Actions will now:"
echo "  1. Run full test suite"
echo "  2. Build the package"
echo "  3. Publish to NPM"
echo "  4. Create GitHub Release"
echo ""
echo "Monitor at: https://github.com/technewwings/payload-ecommerce-coupon/actions"
