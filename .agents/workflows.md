# Workflows

## Setup

You need Ruby 3.3.9, Node 22, Go 1.26 with golangci-lint, and SQLite.

```sh
bundle install
npm install
bin/rails db:prepare
```

## Running

`bin/dev` runs `Procfile.dev`:

| Process | Port |
| --- | --- |
| Rails | 8000 |
| Game server | 8090 |
| Client build, in watch mode, into `public/client` | none |

Killing one child stops the whole stack. To test a game server change without stopping it, run a second game server on another port.

In development, `/login` has a button to sign in as each local user.

## Tests and lint

```sh
npx vitest run
npm run build
bundle exec rspec
bundle exec standardrb
(cd game-server && go test ./... && golangci-lint run ./...)
```

CI also runs `bin/brakeman` and `bin/bundler-audit`.

To regenerate the shared test world after a format change, run `node game-server/internal/worlds/testdata/world.mjs`.

## Test worlds

Named test worlds are zips in `tmp/worlds/`, which isn't in git, and `tmp/worlds/README.md` lists them. Add new ones there and update the README. On a machine without them, make one in `/create`.

- `northvale.zip`: a working world.
- `large.zip`: a large one, 20,392 tiles.

## Screenshots

Use the [screenshot-create](skills/screenshot-create/SKILL.md) skill.

For `/play`, headless Chromium runs at about 3 fps, so judge walking by stepping the walker directly through `window.play`, not by watching frames.

## Worlds

Use the [convert-world](skills/convert-world/SKILL.md) and [measure-world](skills/measure-world/SKILL.md) skills.

World content for the core world is in `nevinera/delve-content`.

## Bots

`script/game/bot --character <id|name> --world <id|name|repo> [--strategy null|follow]` plays a character in a released world. Its header has the details.

## Deploying

Use the [deploy-dev](skills/deploy-dev/SKILL.md) skill.
