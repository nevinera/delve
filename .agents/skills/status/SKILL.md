---
name: status
description: Report where the work stands, from branches, PRs and issues: what's in progress, what needs the maintainer, new unsorted issues, and what's left in the current milestone. Use when asked for the status, what's left, what's open, or what's in the milestone.
---

# Status

```sh
.agents/skills/status/status.sh [days]
```

It prints, from git and GitHub:
- the current milestone: the lowest-numbered open one with open issues, and the others' counts
- branches with commits not on main, local or only on GitHub. It compares patches, so branches merged with `--rebase` don't show.
- open PRs: draft or ready, base, and how their checks went
- issues labeled `blocked`
- open issues with no milestone made in the last `days` days, 14 by default
- the current milestone's open issues, and the PRs that close them

Then look further for what needs the maintainer:
- the last comment on each open PR's issue, for "Decisions to review" (the issue-queue skill leaves these)
- memory notes that say something awaits review or a verdict

## The report

Four parts, in this order, each a heading and a few lines. Leave a part out if it's empty, and say so in a line.

1. **In progress:** open branches and PRs still being worked. Leave out branches that are old backups or kept on purpose (such as `backup/*`, or ones a memory note says are kept), and say how many you left out.
2. **Needs you:** ready PRs to merge, blocked issues and their questions, decisions to review, and work awaiting a verdict. Name what each wants from them: a merge, an answer, a look.
3. **New and unsorted:** recent issues with no milestone.
4. **Left in the milestone:** its open issues, and which have work started.

Say each item with its number and a few words. When a part has more than about five, sum it up by topic instead of listing: "#353, #354 and #350 about geo and building tools still need your eyes", "the milestone has 13 left: mostly threat, summons and resurrection; #325 summons has a branch started". Give the numbers so they can be found.

Dependabot PRs go in one line under "Needs you", with how many fail their checks.

Start with a line or two that sums up the whole, and end with what you'd pick next and why, in a line.
