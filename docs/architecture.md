# Architecture

Delve is a browser-based 3D MMO in a tiled, height-mapped world. People build worlds in the editor, keep them in GitHub repos, and play them in the browser.

## Pieces

| Piece | Where | What it does |
| --- | --- | --- |
| Rails app | `app/`, `config/` | accounts, characters, GitHub connections, the list of worlds; serves the pages and the built client |
| Client | `client/src/` | three.js pages, built by vite into `public/client` |
| Game server | `game-server/` | Go; owns where characters are in each world, and tells each player who's near them |

The client has one entry point per page (`vite.config.js`):

| Page | Entry | What it is |
| --- | --- | --- |
| `/editor` | `client/src/editor/main.js` | the world editor |
| `/objects` | `client/src/objects/main.js` | the object builder |
| `/characters/new` | `client/src/character/builder.js` | the character builder |
| `/characters`, `/home` | `client/src/character/list.js` | your characters |
| `/animation_lab` | `client/src/character/lab.js` | the animation lab |

`client/src/main.js` is a placeholder for the game.

## Client code

- `client/src/world/` is shared by every page and has no DOM: world scale (`constants.js`), file formats (`tileCodec.js`, `plateCodec.js`, `landGrid.js`), paths (`paths.js`), the generator, and object, slab, template and water rules.
- `client/src/editor/` is the editor: its views and tools, workers for heavy jobs, and loading and saving.
- `client/src/objects/` is the object library: collections, and the builder pages.
- `client/src/github/github.js` is the browser's only route to GitHub.

The format code in `world/` is pure: it takes what it needs as arguments, so the game, the editor, workers and scripts can all call it. `world/objects.js` keeps a registry of the open world's kinds of object for rendering and placing; the codecs don't read it.

## Worlds

A world is a directory of files: JSON, plain-text plates, and a few binary files. [A world's files](formats/world-files.md) lists every path and links its format.

The editor builds a continent in steps, each writing its own files:

1. **Heights**: sculpt the [land grid](formats/land-grid.md).
2. **Biomes**, **water** and **civilization**: pins, rivers, lakes, roads and the spawn point in the sketch ([schema](schema/sketch.schema.json)).
3. **Zones**: named regions ([schema](schema/zone.schema.json)).
4. **Tiles**: the generator makes 512 ft tiles from the land and the sketch.
5. **Detail**: change tiles by hand. Edited tiles are listed in `edited.json`, and generating leaves them alone. Digging beside water makes the water flow again over the edited ground.
6. **Publish**: validate the saved world and tag it as a version.

A world also defines what you fight and meet: classes, abilities, statuses, items, creatures, NPCs, dialogue, and each continent's spawns. [Game data](formats/game-data.md) describes them, and `client/src/world/gameData.js` checks them. Nothing reads them yet.

Tiles are the heavy part. The editor holds each as a binary [tile file](formats/tile-file.md) while a world is open, and stores them 256 to a text [plate](formats/plates.md). Each plate carries the sizes of the objects in it, so a reader such as the game server can block movement without the world's object library. Tiles also hold [slabs](formats/slabs.md): flat pieces placed by hand for floors, walls and roofs, each kept by one tile and reaching at most 64 ft from its corner. A [template](formats/templates.md) is a group of slabs and objects kept in the world's library, to place as copies. Storing a world also writes [shapes.json](formats/shapes.md): for each kind of object that blocks line of sight, a mesh of a few dozen faces: a hull of at most 32 corners with any holes cut through it by hand (`client/src/editor/shapes.js`).

## Checking a world

`client/src/world/validate.js` checks a version 1 world's files for the old editor's publish step. Nothing checks a version 2 world, and importing doesn't check either.

## Loading and saving

The editor opens a world from a zip or a GitHub repo, and saves to a zip or to GitHub as one commit. Publishing tags a saved commit that passes the validator as a version. [Opening, saving and publishing worlds on GitHub](formats/github-sync.md) covers the protocol.

Opening splits plates into tile files on a few workers. Saving packs them again, remaking only plates whose tiles or object sizes changed, so an edit to one tile changes one plate.

`/create` opens a version 2 world the same ways (`client/src/create/repo.js`), with the same protocol, and keeps it in IndexedDB with the files changed since. It saves to GitHub and publishes from its manage tools. It doesn't validate before publishing.

## Importing and releasing versions

A published version is a tag. The world's page (`/worlds/:id`) lists its tags for the owner, with an import button for each. Importing (`ImportWorldJob`, on the SolidQueue worker):

1. finds the commit the tag points at, once, and keeps its sha;
2. downloads that commit as a zip from GitHub, by sha;
3. runs `node script/manifest.mjs` on it;
4. records a `WorldImport` as passed, with each file's blob sha and size.

Nothing after step 1 reads the tag again, so moving or rewriting a tag can't change an import. The page shows when a tag has moved since it was imported.

The owner releases an import that passed from the same page. Releasing checks that the repo is public right then, and sets the world's `released_sha` to the import's sha (with `released_tag` and `released_at`). Players get that commit the next time they enter.

## Playing

The play page reads version 1 worlds, and the game server reads only version 2, so the worlds pages show the play and preview links greyed out.

Released worlds are listed for everyone signed in, on `/worlds`. A world's owner can also preview an import that passed, before releasing it, from the world's page (`/play/:id?import=`); the game server keeps it on a layer of its own, by its commit. Playing one (`/play/:id`) asks which of your characters to enter as, then loads `client/src/play/main.js`:

1. It reads `world.json`, the continents' sketches and the object library from `raw.githubusercontent.com/<repo>/<released sha>/`. The page lists the commit's files from its import, so nothing is probed for.
2. It enters the game server with an entry token from the page, and the server says where your character is. A character new to the world starts at its spawn point, `spawn` in `world.json`, which `/create`'s manage tools set.
3. It loads the plates around you, and more as you walk toward them, and walks your character there with the editor's walk mode (`RenderView`, `Walker`). It reads each plate as it streams in, and keeps its tiles in IndexedDB by the plate's hash from `plates.json` (`client/src/play/plateCache.js`), so a plate already there isn't downloaded again. The cache holds the 16 plates used last. Plates you've walked well away from leave memory, and come back from the cache.
4. It reports how you move, and draws the characters near you as the server reports theirs (`client/src/play/game.js`, `others.js`).
5. A menu button in the bottom right opens the menu: graphics settings (`client/src/editor/graphicsPanel.js`, shared with the editor) and leaving the world.
6. On a phone (`client/src/play/touch.js`) it plays in landscape only, with a thumbstick, a jump button, and drags that turn you with the camera, on lighter graphics. Menu and chat buttons sit along the bottom, and the menu scrolls.

## The game server

The game server (`game-server/`) holds every character in a world. Browsers connect over a websocket, and send what their player does; the server tells each one what the characters near them do. [The game protocol](formats/game-protocol.md) covers entry tokens, the messages and the internal API.

- `internal/token` checks entry tokens, which Rails signs (`Game::EntryToken`).
- `internal/worlds` downloads each released commit's zip once, keeps it on disk, and reads a version 2 world's continents and spawn point. It reads a continent's plates and placed files as characters reach them, and samples the ground as `/create`'s builder walks it: heights pressed down by level slabs, water, slabs, objects placed by hand, the trees and objects in the tiles' slots (`fill.go`, by a copy of `client/src/v2/fill.json`), and boulders across courses' cascades from `water.json`. Off the tiles is sea. `testdata/world.mjs` writes its test world and what `/create` makes of it, with the client's own code.
- `internal/game` places characters on a layer, works out who's near whom (the 3×3 tiles around each), checks that their movement adds up (speed, clocks, rising and falling, the ground and slabs under them, and not walking into slabs, trees or objects), and passes it on.
- `internal/rails` reads characters from Rails's internal API (`/internal/...`, `InternalApi::` controllers), with a shared token, and writes their positions back to it (`WorldCharacter`, one per character per world). The server never writes to the database itself.

Bots play characters, so you can test with others around: `script/game/bot` (code in `lib/bot/`) enters a released world as a character, the way the play page does, and runs a strategy. A bot fetches plates and placed files from GitHub and walks the ground as the game server reads it, stopping at slabs, trees and objects in its way. It doesn't know about the boulders across cascades. `null` stands still, and `follow` runs after a named character.

## Docs

- `docs/formats/`: file formats and protocols.
- `docs/schema/`: JSON Schemas for a world's JSON files.

When you change a format, a JSON file's shape or how the pieces fit together, update the matching doc in the same commit.
