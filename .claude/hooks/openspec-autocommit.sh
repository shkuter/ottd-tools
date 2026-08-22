#!/usr/bin/env bash
# Commits the working tree by OpenSpec stage: planning artifacts, implementation,
# and archive each get their own commit. Runs on the Stop hook; does nothing unless
# the changed paths clearly belong to one stage. Never pushes.
#
# A stage is revisited all the time — a review round sends the plan back for an edit and
# the code after it — so a stage that already has a commit is folded into that commit
# instead of stacking another one: amended when it is HEAD, fixup + autosquash when later
# stages sit on top. Only unpushed commits are ever rewritten.
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

# A release is its own axis: several archived changes can ship together, so this only
# reports what the changelog would produce — cutting the release stays a manual step.
release_hint() {
  local version
  version=$(scripts/next-version.sh 2>/dev/null) || return 0
  [ -n "$version" ] || return 0
  printf ' · накопилось на %s: make release-auto' "$version"
}

# Where history stops being ours to rewrite. Without an upstream nothing is folded:
# a rebase could then touch commits that are already published elsewhere.
upstream_ref() {
  git rev-parse --abbrev-ref --symbolic-full-name '@{upstream}' 2>/dev/null && return 0
  git rev-parse --verify --quiet origin/HEAD >/dev/null 2>&1 && printf 'origin/HEAD\n' && return 0
  return 1
}

# Newest unpushed commit carrying exactly this message, if any.
stage_commit() {
  local message="$1" upstream sha subject
  upstream=$(upstream_ref) || return 1
  git log --format='%H%x09%s' "$upstream..HEAD" 2>/dev/null | while IFS="$(printf '\t')" read -r sha subject; do
    if [ "$subject" = "$message" ]; then
      printf '%s\n' "$sha"
      break
    fi
  done
}

commit() {
  local message="$1"
  local hint="${HINT:-}"
  shift
  if [ "${OPENSPEC_AUTOCOMMIT_DRY_RUN:-}" = "1" ]; then
    printf 'would commit: %s%s\n' "$message" "$hint"
    return 0
  fi
  git add -A "$@" >/dev/null 2>&1 || return 1
  git diff --cached --quiet && return 1

  local target
  target=$(stage_commit "$message")

  if [ -n "$target" ] && [ "$target" = "$(git rev-parse HEAD)" ]; then
    git commit -q --amend --no-edit || return 1
    printf '{"systemMessage":"Автокоммит: %s — дополнен%s"}\n' "$message" "$hint"
    return 0
  fi

  if [ -n "$target" ]; then
    # later stages sit on top, so the edit rides in as a fixup and autosquash puts it
    # back where it belongs; --autostash because the rest of the tree is usually still
    # dirty at this point (a half-ticked task list, code waiting for the next stage), and
    # a rebase that cannot apply cleanly is undone, leaving the fixup rather than the work
    if git commit -q --fixup="$target" >/dev/null 2>&1 &&
      GIT_SEQUENCE_EDITOR=: GIT_EDITOR=: git rebase --quiet --autostash --autosquash "$target^" >/dev/null 2>&1; then
      printf '{"systemMessage":"Автокоммит: %s — сведён в коммит стадии%s"}\n' "$message" "$hint"
      return 0
    fi
    git rebase --abort >/dev/null 2>&1
    printf '{"systemMessage":"Автокоммит: fixup к «%s» — свести вручную: git rebase --autosquash%s"}\n' "$message" "$hint"
    return 0
  fi

  git commit -q -m "$message" || return 1
  printf '{"systemMessage":"Автокоммит: %s%s"}\n' "$message" "$hint"
}

# 1. archive: the change moved under archive/, main specs may have been synced with it
if only_under openspec/; then
  archived=$(first_match '^openspec/changes/archive/')
  if [ -n "$archived" ]; then
    name=${archived#openspec/changes/archive/}
    name=${name%%/*}
    name=$(printf '%s' "$name" | sed -E 's/^[0-9]{4}-[0-9]{2}-[0-9]{2}-//')
    HINT=$(release_hint)
    commit "OpenSpec: archive $name" openspec
    exit 0
  fi
fi

# 2. planning: the change's own artifacts other than the task list. They go in first and on
# their own, even when code is waiting beside them — a plan edit that rode along in the
# implementation commit could never be folded back into the plan commit afterwards.
# Ticking tasks alone is not a plan change; that is implementation in progress.
plan_paths=$(printf '%s\n' "$changed" |
  grep '^openspec/changes/' |
  grep -v '^openspec/changes/archive/' |
  grep -v '/tasks\.md$')
if [ -n "$plan_paths" ]; then
  name=${plan_paths%%$'\n'*}
  name=${name#openspec/changes/}
  name=${name%%/*}
  commit "OpenSpec: plan $name" $plan_paths
  # the tree may still hold code; fall through and let the stage below claim it
  changed=$(git status --porcelain -uall | sed 's/^...//' | sed 's/.* -> //')
  [ -n "$changed" ] || exit 0
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
