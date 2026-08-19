#!/usr/bin/env bash
#
# Prints the version the Unreleased section of CHANGELOG.md calls for.
#
# The bump follows the rules in CLAUDE.md, read off the section headings:
#   major — an entry marked **BREAKING**, or a "### Removed" heading
#   minor — a "### Added" heading (new tab, setting, dataset, language)
#   patch — anything else (fixes, polish, translations)
#
# While the version is still 0.x the project has no stable surface to break, so a major
# bump lands on minor instead: 0.2.0 -> 0.3.0, never 1.0.0. Once the version reaches 1.0.0
# the bump applies literally.
#
# Written for the system bash 3.2 that ships with macOS.
set -euo pipefail

root="$(cd "$(dirname "$0")/.." && pwd)"
changelog="$root/CHANGELOG.md"
pkg="$root/web/package.json"

die() { echo "next-version: $*" >&2; exit 1; }

[ -f "$changelog" ] || die "CHANGELOG.md not found"
[ -f "$pkg" ] || die "web/package.json not found"

section="$(awk '/^## \[Unreleased\]/{f=1;next} f&&/^## \[/{exit} f' "$changelog")"
[ -n "$(printf '%s' "$section" | tr -d '[:space:]')" ] \
  || die "the Unreleased section is empty — nothing to release"

bump=patch
printf '%s\n' "$section" | grep -q '^### Added' && bump=minor
printf '%s\n' "$section" | grep -q '^### Removed' && bump=major
printf '%s\n' "$section" | grep -qi '\*\*BREAKING\*\*' && bump=major

current="$(node -p "require('$pkg').version")"
major="${current%%.*}"
rest="${current#*.}"
minor="${rest%%.*}"
patch="${rest#*.}"

# pre-1.0 projects express a breaking change as a minor bump
if [ "$bump" = major ] && [ "$major" = 0 ]; then
  bump=minor
fi

case "$bump" in
  major) major=$((major + 1)); minor=0; patch=0 ;;
  minor) minor=$((minor + 1)); patch=0 ;;
  patch) patch=$((patch + 1)) ;;
esac

printf '%s.%s.%s\n' "$major" "$minor" "$patch"
