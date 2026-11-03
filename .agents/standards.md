# Standards

## Writing

These cover docs, comments, commit messages, UI text and issues.

- Write the way you talk, in plain words and active voice.
- Say each thing once, one idea to a sentence.
- No em-dashes.
- No origin stories. Say what's true now, not how it got that way.
- Stop when the point is made.

## Code

- Match the code around you.
- Comments say what something is, in plain words. Look at a neighbouring file for how many to write.
- Keep no dead code "for later".
- Keep format code in `client/src/world/` and `client/src/v2/` pure: it takes what it needs as arguments, so pages, workers and scripts can all call it.
- Share rules between Go and JS by testing them against the same data. `game-server/internal/worlds/testdata/world.mjs` writes the test world and what the client makes of it, and Go and rspec both check against it. `game-server/internal/worlds/fill.json` is a copy of `client/src/v2/fill.json`, so change both.
- Use one shared constant for a game rule, not a number repeated.

## Rules of the game

Combat, stats and rules follow the MMO genre's conventions. [formats.md](formats.md#game-data) defines them.

## Formats

- Version every format, and keep readers working on old versions.
- Keep what players load as text and line-oriented, so an edit changes only the lines it touched.
- Update [formats.md](formats.md) and the schema in `docs/schema/` in the same commit as the code.
- Write zips with `@bokuweb/zstd-wasm` and read them with `fzstd`. Writers must `await loadZipper()`, or tiles fall back to a longer form. Don't use zstdify: it writes frames that decode wrong.

## Commits

- Write one sentence saying what the change does for the user, as the log's recent commits do.
- Don't add co-author lines.

## Tests

Tests sit beside the code: vitest as `*.test.js`, Go as `*_test.go` in `game-server/`, and rspec in `spec/`. Commands are in [workflows.md](workflows.md#tests-and-lint). All of them have to pass before a commit.

## Tracking

Work is tracked in GitHub milestones and issues on `nevinera/delve`.
