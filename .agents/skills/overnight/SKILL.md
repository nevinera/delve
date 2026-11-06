---
name: overnight
description: Work through a queue of GitHub issues unattended, overnight, leaving decisions on the issues and a PR for each one that isn't blocked, merging nothing. Use when asked to work on issues overnight, or while the maintainer's away.
---

# Overnight queue

You're asked for some issues by number, and maybe "anything you can do without me" in a milestone. Work them one at a time while nobody's watching, and leave everything ready to review in the morning. Nobody answers questions overnight, so the issues and PRs are where you talk.

## What asking grants

Asking for an overnight queue lets you, for the issues in it only:
- push branches and open or update PRs
- comment on the issues, and add or remove their `blocked` label
- push and deploy `dev_merge` (see the end)

It doesn't let you merge, close an issue, push to main, or touch issues outside the queue.

## Picking the issues

1. Take the issues named, in the order given.
2. For "anything you can do without me in milestone Q", add the milestone's open issues that have a clear spec: what to build is written down, or obvious from the code. Leave out:
   - design tickets (designing a class, a feature's rules, a look): those are conversations, and a draft made alone won't help
   - issues labeled `blocked`, or waiting on another issue that isn't done
   - issues that need a person: playtesting, judging a feel, accounts or keys you don't have
3. Work out the order, and which issues build on others, before you start. Don't comment on the issues you leave out.

## Each issue

1. Read the issue, its comments, and the code it touches.
2. Branch:
   - an issue on its own branches off `origin/main`
   - an issue that builds on another in the queue branches off that issue's branch, and its PR targets that branch, so the PRs stack
3. Finish the whole issue in its branch. Don't stop partway.
4. When something's undecided, decide it yourself if a wrong choice is cheap to change later, and note it as a decision for review. Block only when a wrong choice would be costly to undo: a world format or protocol change, deleting or moving data, or a choice of direction the issue doesn't settle.
5. Check your work as the repo's standards say: tests, and screenshots for anything you can see. GitHub can't take images from `gh`, so describe what the screenshots showed, and give their paths.
6. Run `partest`, open the PR, and wait for CI with `gh pr checks <n> --watch`. Fix what fails. A PR is ready only when both pass.
7. Comment on the issue (see below), and go on to the next.

### Blocked

An issue blocks on a decision (above), or on an action that's refused, such as a command or push the permissions turn down. When one's refused, look for another good way to keep the work going: a different approach, a different tool, or leaving that step for the morning and finishing the rest. Don't send the same action again reworded or split up to get it past the check: the refusal means that action needs a person. The issue is blocked only when there's no good way on without one. Either way, note what was refused and what you did instead.

When you have to block:
1. Commit and push what you have to the branch, if it's worth keeping, and open the PR as a draft.
2. Add the `blocked` label, and comment with the question, the options you see, and which you'd pick.
3. Skip every queued issue that builds on it, and say so in their comments.
4. Go on to the next issue that doesn't depend on it.

## What the comments say

Everything on GitHub is public. Name no other games, and keep out anything about other work or other projects, as with commits.

Each issue gets one comment when you're done with it, updated rather than added to if you come back:
- **Outcome**: the PR, ready or draft, and what it stacks on; or blocked, and on what.
- **What changed**: a few lines.
- **Decisions to review**: each choice you made that the issue didn't settle, with what you'd do instead if it's wrong.
- **Checked**: tests, CI, what you looked at in a browser, and what you couldn't check.

## At the end

1. Make `dev_merge` from `origin/main`, merge every ready PR's branch into it, the bottom of each stack first, and push it with `--force`. Leave out drafts.
2. Deploy it with the deploy-dev skill: `~/bin/deploy-delve-dev [--full] dev_merge`, with `--full` if any of it touches `game-server/`, the Gemfile or migrations. Check the site loads.
3. Finish with one message, the first thing read in the morning:
   - for each issue: ready (with the PR link), blocked (with the question, or what was refused), or skipped (and why)
   - the decisions to review, by issue
   - stacks, in merge order. Merging one with `--rebase` gives its commits new SHAs, so the PR above it has to be rebased onto main before it merges.
   - whether `dev_merge` deployed, and anything that failed
