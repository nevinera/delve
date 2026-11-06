#!/usr/bin/env bash
# Gathers what a status report needs, from git and GitHub, for the status skill to sum up.
# Usage: .agents/skills/status/status.sh [days]   (days: how far back "recent" issues go, 14 by default)
set -euo pipefail
cd "$(git rev-parse --show-toplevel)"
days="${1:-14}"
git fetch -q --prune origin

echo "## Current milestone"
# The lowest-numbered open milestone with open issues ("2. Abilities, ..."). Unnumbered ones follow.
current=$(gh api 'repos/{owner}/{repo}/milestones?state=open&per_page=100' \
  -q '.[] | select(.open_issues > 0) | "\(.title)"' | sort -V | grep -E '^[0-9]+\.' | head -1 || true)
echo "${current:-none}"
gh api 'repos/{owner}/{repo}/milestones?state=open&per_page=100' \
  -q '.[] | select(.open_issues > 0) | "  \(.title): \(.open_issues) open"' | sort -V

echo
echo "## Branches with work not on main"
# git cherry compares patches, so branches merged with --rebase count as merged.
for branch in $(git for-each-ref --format='%(refname:short)' refs/heads); do
  [ "$branch" = main ] && continue
  left=$(git cherry origin/main "$branch" 2>/dev/null | grep -c '^+' || true)
  [ "$left" -eq 0 ] && continue
  when=$(git log -1 --format=%cs "$branch")
  pushed=$(git rev-parse -q --verify "refs/remotes/origin/$branch" >/dev/null && echo pushed || echo local)
  echo "$when  $branch: $left commits, $pushed, last: $(git log -1 --format=%s "$branch" | cut -c1-100)"
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
