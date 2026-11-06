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

## Browser errors

Every page imports `client/src/errors/install.js` first. It keeps the last 100 console lines and reports errors, failed promises, `console.error` calls and lost WebGL contexts to `POST /client_errors`, with those lines. `ClientError` keeps a row for each kind of error, counted, for the 100 kinds seen most lately. Every report also goes to `log/client_errors/<day>.jsonl`, and files older than 7 days are deleted. System admins see them at `/client_errors`, with stacks mapped back to source lines from the build's hidden source maps.

## Metrics

Call `metrics()` from `client/src/metrics/metrics.js` to measure something on a page: `timing(name, ms, tags)`, `count(name, n, tags)`, `gauge(name, value, tags)`, or `time(name)`, which returns a function that records how long it's been. Names are lowercase words joined by dots, such as `play.load.platters`. Every measurement gets the page, build and device (phone or desktop) as tags. The page sends them to `POST /metrics` every 10 seconds and when it's hidden or closed.

`Metric` keeps them in their own SQLite database (`storage/<env>_metrics.sqlite3`, migrations in `db/metrics_migrate`) for 30 days. To read them, run `bin/rails metrics:summary`, with `SINCE=<hours>`, `BY=<tag>` and `NAME=<prefix>` to narrow it. On the dev server, run it in `/home/deploy/delve` with the env file loaded.

## Timing and debug logging

`client/src/metrics/timing.js` is timing a page keeps for itself, not sent anywhere:
- `Startup` times the steps of opening a page, each from the one before. Each step also goes on the browser's performance timeline as a measure, so it shows in the developer tools' performance panel.
- `FrameParts` times each part of a frame, and gives each part's mean a frame and its slowest frame.
- `debugLog(topic, ...)` logs only when the topic's turned on: in the page's address, as in `?debug=ground,perf`, or for every page in the browser with `localStorage.debug = "perf"` in the console. `all` turns on every topic.

`/create` and `/play` both time their startup steps. `/play` also sends them as `play.load.<step>` metrics. In `/create`, the debug toggles in the bottom bar show the frame's parts and the startup steps. Its topics:
- `perf`: each startup step as it's done, and every frame slower than 100 ms with what it spent its time on.
- `ground`: each plate as it's read, with how many are still being read.

## Reports

Every page imports `client/src/report/button.js`, a button in the bottom-left corner for reporting a bug, an object or structure you wish you had, something you can't work out how to do, or something annoying. You can type or talk. Talking records a voice note, and where the browser has speech recognition it also types what it hears. A report sends a screenshot of the page's scene where it fills the window, the error recorder's console lines, and what the page gives `setReportContext()`. `ProblemReport` keeps them, with voice notes and screenshots in `storage/problem_reports/<id>/` until a system admin marks the report done at `/problem_reports`.

## Deploying

Use the [deploy-dev](skills/deploy-dev/SKILL.md) skill.
