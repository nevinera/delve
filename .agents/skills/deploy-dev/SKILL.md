---
name: deploy-dev
description: Deploy a branch to the dev server at delve.nevinera.dev. Use when asked to deploy.
---

# Deploy to the dev server

Run this from the checkout. The script lives on the maintainer's machine, not in this repo, so without it you can't deploy.

```sh
~/bin/deploy-delve-dev                  # the current branch
~/bin/deploy-delve-dev <branch>         # another branch
~/bin/deploy-delve-dev --full [branch]  # also gems, migrations and the Go server
```

Use `--full` when a change touches the Gemfile, a migration or `game-server/`. The branch has to be pushed first, because the server pulls it from GitHub.

## The server

| Thing | Where |
| --- | --- |
| Rails | `delve.nevinera.dev`, service `delve-web` |
| Jobs | service `delve-jobs` |
| Game server | `game.nevinera.dev`, service `delve-game` |
| Checkout | `/home/deploy/delve` |
| Env files | `/etc/delve/` |

`/home/deploy/delve-old` and `/etc/delve-old/` are a recovery copy. Don't delete them.
