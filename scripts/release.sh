#!/usr/bin/env bash
#
# Cuts a release: closes the Unreleased section of CHANGELOG.md, bumps the version in
# web/package.json (the single source of truth — vite.config.ts inlines it as __APP_VERSION__),
# then commits and tags. Usage: make release VERSION=0.2.0
#
# Written for the system bash 3.2 that ships with macOS: no associative arrays, no mapfile.
set -euo pipefail

version="${1:-}"
root="$(cd "$(dirname "$0")/.." && pwd)"
changelog="$root/CHANGELOG.md"
pkg="$root/web/package.json"

die() { echo "release: $*" >&2; exit 1; }

[ -n "$version" ] || die "usage: make release VERSION=x.y.z"
echo "$version" | grep -Eq '^[0-9]+\.[0-9]+\.[0-9]+$' || die "version must be x.y.z, got '$version'"

git -C "$root" diff --quiet HEAD || die "working tree is dirty — commit or stash first"

if git -C "$root" rev-parse -q --verify "refs/tags/v$version" >/dev/null; then
  die "tag v$version already exists"
fi

current="$(node -p "require('$pkg').version")"
newest="$(printf '%s\n%s\n' "$current" "$version" | sort -V | tail -1)"
[ "$version" = "$newest" ] && [ "$version" != "$current" ] \
  || die "version must be greater than the current $current"

# A release with nothing written down is almost always a forgotten changelog entry.
unreleased="$(awk '/^## \[Unreleased\]/{f=1;next} f&&/^## /{exit} f' "$changelog" | tr -d '[:space:]')"
[ -n "$unreleased" ] || die "CHANGELOG.md: the Unreleased section is empty"

tmp="$changelog.tmp.$$"
awk -v ver="$version" -v date="$(date +%F)" '
  !closed && /^## \[Unreleased\]/ {
    print
    print ""
    print "## [" ver "] - " date
    closed = 1
    next
  }
  { print }
  END { if (!closed) exit 3 }
' "$changelog" >"$tmp" || { rm -f "$tmp"; die "CHANGELOG.md: no '## [Unreleased]' section"; }
mv "$tmp" "$changelog"

npm --prefix "$root/web" version "$version" --no-git-tag-version --allow-same-version >/dev/null

files="CHANGELOG.md web/package.json"
if [ -f "$root/web/package-lock.json" ]; then
  files="$files web/package-lock.json"
fi

git -C "$root" add $files
git -C "$root" commit -m "Release $version" >/dev/null
git -C "$root" tag -a "v$version" -m "$version"

echo "release: v$version committed and tagged"
if [ -n "$(git -C "$root" remote)" ]; then
  echo "release: push with 'git push --follow-tags'"
fi
