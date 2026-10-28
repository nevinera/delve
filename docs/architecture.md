# Architecture

Delve is a browser-based 3D MMO in a tiled, height-mapped world. People build worlds in the editor, keep them in GitHub repos, and play them in the browser.

## Pieces

| Piece | Where | What it does |
| --- | --- | --- |
| Rails app | `app/`, `config/` | accounts, characters, GitHub connections, the list of worlds; serves the pages and the built client |
| Client | `client/src/` | three.js pages, built by vite into `public/client` |
| Game server | `game-server/` | Go; a health check so far |

The client has one entry point per page (`vite.config.js`):

| Page | Entry | What it is |
| --- | --- | --- |
| `/editor` | `client/src/editor/main.js` | the world editor |
| `/objects`, `/structures` | `client/src/objects/main.js` | the object and structure builders |
| `/characters/new` | `client/src/character/builder.js` | the character builder |
| `/characters`, `/home` | `client/src/character/list.js` | your characters |
| `/animation_lab` | `client/src/character/lab.js` | the animation lab |

`client/src/main.js` is a placeholder for the game.

## Client code

- `client/src/world/` is shared by every page and has no DOM: world scale (`constants.js`), file formats (`tileCodec.js`, `plateCodec.js`, `landGrid.js`), paths (`paths.js`), the generator, and object, structure and water rules.
- `client/src/editor/` is the editor: its views and tools, workers for heavy jobs, and loading and saving.
- `client/src/objects/` is the object library: collections, and the builder pages.
- `client/src/github/github.js` is the browser's only route to GitHub.

The format code in `world/` is pure: it takes what it needs as arguments, so the game, the editor, workers and scripts can all call it. `world/objects.js` keeps a registry of the open world's kinds of object for rendering and placing; the codecs don't read it.

## Worlds

A world is a directory of files: JSON, plain-text plates, and a few binary files. [A world's files](formats/world-files.md) lists every path and links its format.

The editor builds a continent in steps, each writing its own files:

1. **Heights**: sculpt the [land grid](formats/land-grid.md).
2. **Biomes**, **water** and **civilization**: pins, rivers, lakes and roads in the sketch ([schema](schema/sketch.schema.json)).
3. **Zones**: named regions ([schema](schema/zone.schema.json)).
4. **Tiles**: the generator makes 512 ft tiles from the land and the sketch.
5. **Detail**: change tiles by hand. Edited tiles are listed in `edited.json`, and generating leaves them alone. Digging beside water makes the water flow again over the edited ground.
6. **Publish**: validate the saved world and tag it as a version.

Tiles are the heavy part. The editor holds each as a binary [tile file](formats/tile-file.md) while a world is open, and stores them 256 to a text [plate](formats/plates.md). Each plate carries the sizes of the objects in it, so a reader such as the game server can block movement without the world's object library.

## Checking a world

`client/src/world/validate.js` checks a stored world's files and lists what's wrong. Problems stop a world being played; warnings don't. Run it with `node script/validate.mjs <world directory or zip>`, which exits 1 when there are problems (`--json` prints them as JSON).

## Loading and saving

The editor opens a world from a zip or a GitHub repo, and saves to a zip or to GitHub as one commit. Publishing tags a saved commit that passes the validator as a version. [Opening, saving and publishing worlds on GitHub](formats/github-sync.md) covers the protocol.

Opening splits plates into tile files on a few workers. Saving packs them again, remaking only plates whose tiles or object sizes changed, so an edit to one tile changes one plate.

## Importing and releasing versions

A published version is a tag. The world's page (`/worlds/:id`) lists its tags for the owner, with an import button for each. Importing (`ImportWorldJob`, on the SolidQueue worker):

1. finds the commit the tag points at, once, and keeps its sha;
2. downloads that commit as a zip from GitHub, by sha;
3. runs `node script/validate.mjs --manifest` on it;
4. records a `WorldImport`: passed or failed, the problems, and each file's blob sha and size.

Nothing after step 1 reads the tag again, so moving or rewriting a tag can't change an import. The page shows when a tag has moved since it was imported.

The owner releases an import that passed from the same page. Releasing checks that the repo is public right then, and sets the world's `released_sha` to the import's sha (with `released_tag` and `released_at`). Players get that commit the next time they enter.

## Docs

- `docs/formats/`: file formats and protocols.
- `docs/schema/`: JSON Schemas for a world's JSON files.

When you change a format, a JSON file's shape or how the pieces fit together, update the matching doc in the same commit.
