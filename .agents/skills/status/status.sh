#!/usr/bin/env bash
# Gathers what a status report needs, from git and GitHub, for the status skill to sum up.
# Usage: .agents/skills/status/status.sh [days]   (days: how far back "recent" issues go, 14 by default)
#        .agents/skills/status/status.sh --publish   (only leave this machine's branches on the dev box)
set -euo pipefail
cd "$(git rev-parse --show-toplevel)"
days="${1:-14}"
[ "$days" = --publish ] && days=14
git fetch -q --prune origin

# Work goes on in checkouts here and on the dev box. The box can be reached from here but not the
# other way, so each run leaves this machine's branches on the box, and the box reads them there.
BOX=${DELVE_STATUS_BOX:-nevinera@delve.nevinera.dev}
BOX_NAME=nevinera-delve-dev
SHARED='~/.delve-status'
here=$(hostname -s)

# Branches with commits not on main, local or only on GitHub, newest first. git cherry compares
# patches, so branches merged with --rebase count as merged.
branches_not_on_main() {
  {
  # Work on main itself that isn't pushed, and changes not committed.
  ahead=$(git rev-list --count origin/main..main 2>/dev/null || echo 0)
  [ "$ahead" -gt 0 ] && echo "$(git log -1 --format=%cs main)  main: $ahead commits not pushed, last: $(git log -1 --format=%s main | cut -c1-100)"
  changed=$(git status --porcelain | grep -c . || true)
  [ "$changed" -gt 0 ] && echo "$(date +%Y-%m-%d)  $(git branch --show-current) has $changed files changed or new, not committed: $(git status --porcelain | head -3 | cut -c4- | tr '\n' ' ')"
  for branch in $(git for-each-ref --format='%(refname:short)' refs/heads); do
    [ "$branch" = main ] && continue
    left=$(git cherry origin/main "$branch" 2>/dev/null | grep -c '^+' || true)
    [ "$left" -eq 0 ] && continue
    pushed=$(git rev-parse -q --verify "refs/remotes/origin/$branch" >/dev/null && echo pushed || echo local)
    echo "$(git log -1 --format=%cs "$branch")  $branch: $left commits, $pushed, last: $(git log -1 --format=%s "$branch" | cut -c1-100)"
  done | sort -r
  # Branches pushed from elsewhere, with no copy here. Dependabot's are its PRs.
  for remote in $(git for-each-ref --format='%(refname:short)' refs/remotes/origin); do
    branch=${remote#origin/}
    case "$branch" in main | HEAD | origin | dependabot/*) continue ;; esac
    git rev-parse -q --verify "refs/heads/$branch" >/dev/null && continue
    left=$(git cherry origin/main "$remote" 2>/dev/null | grep -c '^+' || true)
    [ "$left" -eq 0 ] && continue
    echo "$(git log -1 --format=%cs "$remote")  $branch: $left commits, only on GitHub, last: $(git log -1 --format=%s "$remote" | cut -c1-100)"
  done | sort -r
  } | grep . || echo "nothing"
}
branches_here=$(branches_not_on_main)
snapshot=$(printf 'as of %s\n%s\n' "$(date -u +%Y-%m-%dT%H:%MZ)" "$branches_here")
if [ "$here" = "$BOX_NAME" ]; then
  mkdir -p ~/.delve-status && echo "$snapshot" >~/.delve-status/"$here".txt
else
  echo "$snapshot" | ssh -o BatchMode=yes -o ConnectTimeout=5 "$BOX" "mkdir -p $SHARED && cat > $SHARED/$here.txt" 2>/dev/null || true
fi
# With --publish, that's all: git hooks run it so the box hears of new branches between reports.
[ "${1:-}" = --publish ] && exit 0

echo "## Branches with work not on main"
echo "$branches_here" | sed "s/^/[$here] /"
if [ "$here" = "$BOX_NAME" ]; then
  # The box can't reach the other machines, so they leave what they have here when they run this.
  for file in "$HOME"/.delve-status/*.txt; do
    [ -e "$file" ] || continue
    name=$(basename "$file" .txt)
    [ "$name" = "$here" ] && continue
    echo "[$name, $(head -1 "$file")]"
    tail -n +2 "$file" | sed "s/^/[$name] /"
  done
else
  if box=$(ssh -o BatchMode=yes -o ConnectTimeout=5 "$BOX" "cd ~/delve && git fetch -q --prune origin && bash -s" < <(declare -f branches_not_on_main; echo branches_not_on_main) 2>/dev/null); then
    echo "$box" | sed "s/^/[$BOX_NAME] /"
  else
    echo "[$BOX_NAME] couldn't be reached"
  fi
fi

if ! command -v gh >/dev/null; then
  echo
  echo "## GitHub"
  echo "gh isn't installed here, so there are no PRs, issues or milestones. Run this on a machine with gh."
  exit 0
fi

echo
echo "## Current milestone"
# The lowest-numbered open milestone with open issues ("2. Abilities, ..."). Unnumbered ones follow.
current=$(gh api 'repos/{owner}/{repo}/milestones?state=open&per_page=100' \
  -q '.[] | select(.open_issues > 0) | "\(.title)"' | sort -V | grep -E '^[0-9]+\.' | head -1 || true)
echo "${current:-none}"
gh api 'repos/{owner}/{repo}/milestones?state=open&per_page=100' \
  -q '.[] | select(.open_issues > 0) | "  \(.title): \(.open_issues) open"' | sort -V

echo
echo
echo "## Open PRs"
gh pr list --state open --limit 50 --json number,title,isDraft,baseRefName,headRefName,reviewDecision,statusCheckRollup,url \
  -q '.[] | "#\(.number) \(if .isDraft then "draft" else "ready" end), \(.headRefName) -> \(.baseRefName), checks: \([.statusCheckRollup[]?.conclusion // "pending"] | unique | join(",")), \(.title)"'

echo
echo "## Blocked or waiting on the maintainer"
gh issue list --state open --label blocked --limit 50 --json number,title,milestone \
  -q '.[] | "#\(.number) [\(.milestone.title // "no milestone")] \(.title)"'
echo "(Also check the issues of open PRs for \"Decisions to review\" comments.)"

echo
echo "## Recent issues with no milestone (last $days days)"
since=$(date -v-"${days}"d +%Y-%m-%d 2>/dev/null || date -d "-${days} days" +%Y-%m-%d)
gh issue list --state open --search "no:milestone created:>=$since" --limit 100 --json number,title,labels,createdAt \
  -q '.[] | "#\(.number) \(.createdAt[0:10]) [\([.labels[].name] | join(","))] \(.title)"'

echo
echo "## Open issues in the current milestone"
if [ -n "$current" ]; then
  gh issue list --state open --milestone "$current" --limit 200 --json number,title,labels \
    -q '.[] | "#\(.number) [\([.labels[].name] | join(","))] \(.title)"'
  echo "PRs naming them:"
  gh pr list --state open --limit 50 --json number,body,title -q '.[] | select(.body | test("(?i)(closes|fixes|resolves) #[0-9]+")) | "#\(.number) \(.title): \([.body | scan("(?i)(?:closes|fixes|resolves) #([0-9]+)")[] | "#" + .[0]] | join(" "))"'
fi
