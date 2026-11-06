# Delve

A browser-based 3D MMO in a tiled, height-mapped world. People build worlds in `/create`, keep them in their own GitHub repos, and play them in the browser. Rails serves the pages, a three.js client draws the world, and a Go server runs the game.

## Where everything is

- [.agents/architecture.md](.agents/architecture.md): the pieces, entry points, code layout, and how a world loads, saves and plays.
- [.agents/formats.md](.agents/formats.md): every world file and the game protocol. It's long, so search it or use its contents list.
- [.agents/standards.md](.agents/standards.md): code, writing, naming, commits and tests.
- [.agents/glossary.md](.agents/glossary.md): our words, and the ones we avoid.
- [.agents/workflows.md](.agents/workflows.md): running, testing, screenshots, converting worlds and deploying.
- [docs/schema/](docs/schema): JSON Schemas for a world's JSON files and the game's messages.
- `plans/`: designs and history, not in git and not on every machine. It's background, not binding.

Skills, for jobs with steps and scripts:

- [screenshot-create](.agents/skills/screenshot-create/SKILL.md): screenshot `/create` with a test world.
- [convert-world](.agents/skills/convert-world/SKILL.md): run the world converters and check the result.
- [measure-world](.agents/skills/measure-world/SKILL.md): measure a world's file sizes and read times.
- [deploy-dev](.agents/skills/deploy-dev/SKILL.md): deploy to the dev server.
- [issue-queue](.agents/skills/issue-queue/SKILL.md): work several issues unattended, leaving decisions on the issues and PRs to review.
- [status](.agents/skills/status/SKILL.md): report what's in progress, what needs the maintainer, new issues and what's left in the milestone.

## Hard rules

- Don't name or compare us to other games in anything committed or on GitHub. Describe the rule itself. `plans/` is the only exception.
- The game server owns character state. The client never writes position, status or flags, and there are no client-writable endpoints for them.
- Players load world files from the world's own URLs, never through our servers. Every format has to work fetched straight from GitHub raw URLs.
- The walkable slope limit is 50°, measured on the ground's face. `/create` and the game server both use it.
- Signed credentials for entering the game are "tokens", never "tickets".
- Local Rails runs on :8000. Leave whatever's on :3000 alone.
- When you change a format, a JSON file's shape or how the pieces fit together, update every reader and the matching `.agents/` file in the same commit.
