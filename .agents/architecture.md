# Architecture

Delve is a browser-based 3D MMO in a tiled, height-mapped world. People build worlds in `/create`, keep them in GitHub repos, and play them in the browser.

## Pieces

| Piece | Where | What it does |
| --- | --- | --- |
| Rails app | `app/`, `config/` | accounts, characters, GitHub connections, the list of worlds; serves the pages and the built client |
| Client | `client/src/` | three.js pages, built by vite into `public/client` |
| Game server | `game-server/` | Go; owns where characters are in each world, and tells each player who's near them |

The client has one entry point per page (`vite.config.js`):

| Page | Entry | What it is |
| --- | --- | --- |
| `/create` | `client/src/create/main.js` | the world editor |
| `/objects` | `client/src/objects/main.js` | the object builder |
| `/characters/new` | `client/src/character/builder.js` | the character builder |
| `/characters`, `/home` | `client/src/character/list.js` | your characters |
| `/animation_lab` | `client/src/character/lab.js` | the animation lab |
| `/creatures` | `client/src/character/creatures.js` | each creature body playing its clips, by skeleton |
| `/creature` | `client/src/character/creature.js` | one creature playing each of its roles in turn, with a control for each setting |
| `/monster_lab` | `client/src/character/monsterLab.js` | the shipped bodies, and a world's own from its `models.json` |
| `/classes` | `client/src/classes/main.js` | the class editor |
| `/play/:id` | `client/src/play/main.js` | the game |

`client/src/main.js` is a placeholder for the game.

## Client code

- `client/src/v2/` is the current world format, shared by every page: sizes (`sizes.js`), plates, platters, caves, water, slots and biomes.
- `client/src/world/` is also shared and has no DOM: paths (`paths.js`), object, slab and template rules, built-in objects, and the day and night. It still holds version 1 code that `script/convert-v2.mjs` and `script/plates.mjs` need: `tileCodec.js`, `plateCodec.js`, `plates.js`, `landGrid.js`, `generator.js`.
- `client/src/create/` is the world editor.
- `client/src/render/` draws the world with three.js for `/create`, `/play` and the object builder: the ground's and water's materials, trees, objects, slabs, clutter, the sky, graphics settings and the performance overlay.
- `client/src/play/` is the game page, and its walker, which the character builder uses too.
- `client/src/classes/` is the class editor.
- `client/src/abilities/` is what abilities look and sound like: pure timelines, stock visuals and sounds made in code, and the stage that plays them.
- `client/src/objects/` is the object library: collections, its storage in the browser, and the builder pages.
- `client/src/character/` is bodies, rigs, animations and the character and creature pages.
- `client/src/github/github.js` is the browser's route to GitHub's API. The play page reads world files from `raw.githubusercontent.com` (`client/src/play/loader.js`).

The format code in `world/` is pure: it takes what it needs as arguments, so the game, `/create`, workers and scripts can all call it. `world/objects.js` keeps a registry of the open world's kinds of object for rendering and placing; the codecs don't read it.

## Worlds

A world is a directory of files: JSON and plain-text plates, platters and caves. [formats.md](formats.md#a-worlds-files) lists every path.

`/create` is the world editor: one view where a builder walks and flies over the world, with tools for the ground, water, biomes, paths, caves, objects and slabs. 
- **Ground tiers** (`client/src/create/ground.js`) go by tile distance, in squares: full within 4 tiles, cell scale within 8, tile renditions within 16, then plate renditions. What's drawn changes only when the builder leaves their tile, one plate at a time, as one merged mesh per plate for each tier except full tiles.
- **Controls:** a right sidebar picks the type of work, then the tool, then configures it. A bottom bar shows readouts and display toggles.

A world also defines what you fight and meet: classes, abilities, statuses, items, creatures, NPCs, dialogue, and each continent's spawns. [Game data](formats.md#game-data) describes them. The game server and play page read classes. Nothing reads the rest yet.

## Loading and saving

`/create` opens a version 2 world from a zip or a GitHub repo (`client/src/create/repo.js`), and keeps it in IndexedDB with the files changed since. Downloading gives a zip of the world with those changes.

### GitHub

/create reads and writes a world's repo straight from the browser, through GitHub's REST API (`client/src/github/github.js`, `client/src/create/repo.js`).

- **Tokens:** the browser gets a GitHub App user token from Rails at `GET /github/token`, as `{ token, expires_at, login }`, and fetches a new one shortly before it expires. A 401 means you need to connect GitHub (`connect_url`) or authorize again (`reauth_url`).
- **Opening:** `/create?from=github/<owner>/<repo>` opens the head of the default branch. It lists every file at that commit with its blob sha, and downloads blobs pinned to that commit, so a branch that moves during the load doesn't mix commits. The world remembers `{ repo, branch, commitSha, shas }`, and opening again skips files whose sha hasn't changed. A repo with no `world.json` opens as a new world named after the repo, and keeps its files.
- **Saving:** one commit on the branch the world came from. It works out each file's blob sha to find what changed, and refuses if the branch head is no longer `commitSha`. Binary files go up as blobs, and text files (`.plate`, `.platter`, `.json`, `.md`, `.txt`) go inline in the tree. Trees are built in requests of at most 10 MB of inline text and 500 files, each building on the last, because GitHub refuses a request over about 40 MB and times one out after about 10 s. A repo with no commits gets its `world.json` first through the contents API.
- **Saving from `/objects` and `/classes`:** each page's own button commits only that page's files, on the same branch, through `client/src/create/keptSave.js`. The kept world's source moves to the new commit, and an open `/create` tab hears of it, so its next save isn't refused. `/create`'s other changes stay unsaved.
- **Publishing:** a published version is a tag on a saved commit, `v1`, `v2` and so on. Publishing refuses while anything is unsaved, and when the commit is published already. Nothing checks the world first.

## Importing and releasing versions

A published version is a tag. The world's page (`/worlds/:id`) lists its tags for the owner, with an import button for each. Importing (`ImportWorldJob`, on the SolidQueue worker):

1. finds the commit the tag points at, once, and keeps its sha;
2. downloads that commit as a zip from GitHub, by sha;
3. runs `node script/manifest.mjs` on it;
4. records a `WorldImport` as passed, with each file's blob sha and size.

Nothing after step 1 reads the tag again, so moving or rewriting a tag can't change an import. The page shows when a tag has moved since it was imported.

The owner releases an import that passed from the same page. Releasing checks that the repo is public right then, and sets the world's `released_sha` to the import's sha (with `released_tag` and `released_at`). Players get that commit the next time they enter.

## Playing

Released worlds are listed for everyone signed in, on `/worlds`. A world's owner can also preview an import that passed, before releasing it, from the world's page (`/play/:id?import=`); the game server keeps it on a layer of its own, by its commit. Playing one (`/play/:id`) asks which of your characters to enter as, then loads `client/src/play/main.js`. It plays version 2 worlds only.

1. It reads `world.json` and the object library from `raw.githubusercontent.com/<repo>/<released sha>/` (`client/src/play/loader.js`). The page lists the commit's files from its import, so nothing is probed for.
2. It enters the game server with an entry token from the page. A character with no class in this world chooses one (`client/src/play/classPicker.js`), and the server says where your character is. A character new to the world starts at its spawn point, `spawn` in `world.json`, which `/create`'s manage tools set.
3. It reads your continent's platters, biomes, water and cave layout, and draws the world as `/create` does (`client/src/play/view.js`, with `client/src/create/ground.js` and the rest): tiles near you in full, coarser further off, out to where the fog closes in, 3,500 ft away. Plate files are fetched as the ground wants them, and placed and caves files for the plates within two plates' width of you. Caves are drawn as `/create`'s finished view draws them (`client/src/create/caves.js`), with their mouths cut through the ground. The sky, its day and night, and the fog come from `client/src/render/sky.js` and `client/src/world/dayNight.js`.
4. You walk with `client/src/play/walker.js`, on the ground as the game server has it (`client/src/play/ground.js`), caves' floors included: slabs, cave rock, objects placed by hand, and the trees and objects in tiles' slots are in the way.
5. It reports how you move, and draws the characters near you as the server reports theirs (`client/src/play/game.js`, `others.js`).
6. You fight with `client/src/play/combat.js`: frames, the action bar (keys 1 to 0), Tab or a click to target, a reticle for ground abilities, and a log. It asks the server to use abilities and shows what the server says happened. `client/src/abilities/stage.js` plays their timelines, for this and for `/classes`' preview.
7. A menu button in the bottom right opens the menu: graphics settings (`client/src/render/graphicsPanel.js`, shared with the editor) and leaving the world.
8. On a phone (`client/src/play/touch.js`) it plays in landscape only, with a thumbstick, a jump button, and drags that turn you with the camera, on lighter graphics. Menu and chat buttons sit along the bottom, and the menu scrolls.

## The game server

The game server (`game-server/`) holds every character in a world. Browsers connect over a websocket, and send what their player does; the server tells each one what the characters near them do. [The game protocol](formats.md#the-game-protocol) covers entry tokens, the messages and the internal API.

- `internal/token` checks entry tokens, which Rails signs (`Game::EntryToken`).
- `internal/worlds` downloads each released commit's zip once, keeps it on disk, and reads a version 2 world's continents and spawn point. It reads a continent's plates and placed files as characters reach them, and samples the ground as `/create`'s builder walks it: heights pressed down by level slabs, water, slabs, objects placed by hand, the trees and objects in the tiles' slots (`fill.go`, by a copy of `client/src/v2/fill.json`), and boulders across courses' cascades from `water.json`. Off the tiles is sea. `testdata/world.mjs` writes its test world and what `/create` makes of it, with the client's own code.
- `internal/game` places characters on a layer, works out who's near whom (the 3×3 tiles around each), checks that their movement adds up (speed, clocks, rising and falling, the ground, slabs and cave floors under them, and not walking into slabs, cave rock, trees or objects), and passes it on.
- `internal/rails` reads characters from Rails's internal API (`/internal/...`, `InternalApi::` controllers), with a shared token, and writes their classes and positions back to it (`WorldCharacter`, one per character per world). The server never writes to the database itself.

- `internal/combat` reads classes and works out stats and what amounts come to. `internal/game/combat.go` runs abilities on a layer, and `Hub.Run` moves them on every 50 ms. [Combat](formats.md#combat) has the rules.

Bots play characters, so you can test with others around: `script/game/bot` (code in `lib/bot/`) enters a released world as a character, the way the play page does, and runs a strategy. A bot fetches plate, placed and caves files from GitHub and walks the ground as the game server reads it, standing on cave floors and stopping at slabs, cave rock, trees and objects in its way. It doesn't know about the boulders across cascades. `null` stands still, and `follow` runs after a named character.
