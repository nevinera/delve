# Delve

A user-generated MMO built for low server overhead and low content-creation barriers. Zones, units, and powers are defined as JSON files hosted in public repositories - the game server loads them directly. The application server handles character persistence, publishing worlds, and hosting the browser client.

See [docs/goals.md](docs/goals.md) for the full design philosophy.

## Documentation

### Design

| Doc | Description |
|---|---|
| [docs/goals.md](docs/goals.md) | Project goals and design philosophy |
| [docs/architecture.md](docs/architecture.md) | System architecture: application server, game server, client |
| [docs/the-world.md](docs/the-world.md) | How zones, regions, and instances fit together, and how worlds are published |
| [docs/classes-and-abilities.md](docs/classes-and-abilities.md) | Classes and powers: design philosophy and user contributions |
| [docs/stats-and-equipment.md](docs/stats-and-equipment.md) | Stat system and item scoring |
| [docs/unit-construction.md](docs/unit-construction.md) | Proposed encounter-tag vocabulary for unit types |

### Content Formats

Content is defined in JSON files conforming to the schemas in [docs/schema/](docs/schema/). See [docs/formats.md](docs/formats.md) for an index of all schemas and the coordinate system used across them.

## Development

### Requirements

- Ruby 3.3.9
- SQLite

### Setup

```sh
rvm use 3.3.9@delve
bundle install
bin/rails db:setup
```

### Running

```sh
bin/rails server
```

### Tests

```sh
bundle exec rspec
```

### Cell maps from the command line

Generate a cell map (see client/src/cellMap/generate.js) and render one to a PNG, the way the game
draws it. Both need `npm install`; `--help` lists their flags.

```sh
bin/cellmap-generate --cols 40 --rows 30 --exits 3 --tags chamber,paths --seed 11 -o woods.json
bin/cellmap-render woods.json --scale 8 --auto   # with Auto Barriers' walls and fill
bin/cellmap-render woods-map.json --places        # each place outlined and numbered
bin/cellmap-generate --tags burrow,coral --theme cave | bin/cellmap-render - -o cave.png
bin/cellmap-generate --exits north:0.2,east -o woods.json   # exits on given sides, the north one near its west end
bin/cellmap-generate --map woods --barriers -o woods-map.json   # a whole map file
```

`bin/zone-build` builds a zone from its `zone-build.json` (see docs/zone-build.md): every map
generated and walled, the zone file linking them, its unit types copied into the world, and the
world file's links to other built zones. `--dry-run` says what it would write.

```sh
bin/zone-build ../content/worlds/demo-wild/zones/thornwood/zone-build.json
bin/zone-build --force old-growth ../content/worlds/demo-wild/zones/thornwood/zone-build.json
```

`bin/zone-outline` prints a zone's outline for an LLM to work from: each map's places (their
tags, annotations, area, where on the map, terrains, trails, neighbors, connections and units) and the links between maps, with the
annotations of the zone, its unit types, maps, units and NCUs.

```sh
bin/zone-outline ../content/zones/darkwood/darkwood.json          # text
bin/zone-outline --json ../content/zones/darkwood/darkwood.json   # JSON
```

`bin/annotate` prints, sets or removes one annotation (an LLM's notes, see
[docs/schema/common.md](docs/schema/common.md#annotations)) on a world, zone, map, place, unit
type, unit, quest or NCU, following `$ref`s to the file that holds it:

```sh
bin/annotate ZONE.json grutts-hall/throne --set population "dense; goblin 4; group"
bin/annotate WORLD.json quest:l3-grutt --set plan - < plan.txt
bin/annotate ZONE.json grutts-hall/unit:grutt              # print
bin/annotate ZONE.json grutts-hall/unit:grutt --remove plan
```
