#!/usr/bin/env bash
# Commits the working tree by OpenSpec stage: planning artifacts, implementation,
# and archive each get their own commit. Runs on the Stop hook; does nothing unless
# the changed paths clearly belong to one stage. Never pushes.
#
# Set OPENSPEC_AUTOCOMMIT_DRY_RUN=1 to print the decision instead of committing.

set -uo pipefail

root=$(git rev-parse --show-toplevel 2>/dev/null) || exit 0
cd "$root" || exit 0

# stay out of the way of an in-progress merge or rebase
if [ -d .git/rebase-merge ] || [ -d .git/rebase-apply ] || [ -f .git/MERGE_HEAD ]; then
  exit 0
fi

# -uall expands new directories to their files, so a fresh change is seen as its artifacts
changed=$(git status --porcelain -uall | sed 's/^...//' | sed 's/.* -> //')
[ -n "$changed" ] || exit 0

only_under() {
  # true when every changed path starts with one of the given prefixes
  local path prefix matched
  while IFS= read -r path; do
    [ -n "$path" ] || continue
    matched=0
    for prefix in "$@"; do
      case "$path" in "$prefix"*) matched=1 ;; esac
    done
    [ "$matched" = 1 ] || return 1
  done <<EOF
$changed
EOF
  return 0
}

first_match() {
  printf '%s\n' "$changed" | grep -m1 "$1" || true
}

active_change() {
  # the single change that is not archived yet
  local dir names count
  names=""
  count=0
  for dir in openspec/changes/*/; do
    [ -d "$dir" ] || continue
    case "$dir" in */archive/) continue ;; esac
    names="${dir#openspec/changes/}"
    names="${names%/}"
    count=$((count + 1))
  done
  [ "$count" = 1 ] || return 1
  printf '%s' "$names"
}

commit() {
  local message="$1"
  shift
  if [ "${OPENSPEC_AUTOCOMMIT_DRY_RUN:-}" = "1" ]; then
    printf 'would commit: %s\n' "$message"
    return 0
  fi
  git add -A "$@" >/dev/null 2>&1 || return 1
  git diff --cached --quiet && return 1
  git commit -q -m "$message" || return 1
  printf '{"systemMessage":"Автокоммит: %s"}\n' "$message"
}

# 1. archive: the change moved under archive/, main specs may have been synced with it
if only_under openspec/; then
  archived=$(first_match '^openspec/changes/archive/')
  if [ -n "$archived" ]; then
    name=${archived#openspec/changes/archive/}
    name=${name%%/*}
    name=$(printf '%s' "$name" | sed -E 's/^[0-9]{4}-[0-9]{2}-[0-9]{2}-//')
    commit "OpenSpec: archive $name" openspec
    exit 0
  fi

  # 2. planning: only the change's own artifacts moved. Ticking tasks alone is not a
  # plan change — that is implementation in progress, so wait for the code to land.
  planned=$(first_match '^openspec/changes/')
  if [ -n "$planned" ]; then
    lines=$(printf '%s\n' "$changed" | grep -c '')
    case "$changed" in */tasks.md) [ "$lines" -eq 1 ] && exit 0 ;; esac
    name=${planned#openspec/changes/}
    name=${name%%/*}
    commit "OpenSpec: plan $name" openspec
    exit 0
  fi
  exit 0
fi

# 3. implementation: code changed together with a tasks.md whose tasks are all ticked.
# The edited tasks.md is what says the work finished — a change that was completed in an
# earlier session has nothing pending here and must not claim unrelated edits.
tasks=$(first_match '^openspec/changes/[^/]*/tasks.md$')
[ -n "$tasks" ] || exit 0
name=${tasks#openspec/changes/}
name=${name%%/*}
grep -q '^- \[ \]' "$tasks" && exit 0
grep -q '^- \[x\]' "$tasks" || exit 0
commit "Implement $name"
