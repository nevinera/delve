# Population plans

How a zone gets its units: each place (see [schema/map.md](schema/map.md#place)) carries a plan
in its `population` annotation, and `bin/place-units` (the placer) applies the plans, adding
units and NCUs to the maps. An LLM writes the plans with `bin/annotate`, from the zone outline
(`bin/zone-outline`), the places' `intent`, and the quests' needs.

```sh
bin/annotate ZONE.json the-hills/area_11 --set population - <<'EOF'
density: dense
mix: goblin-wolfrider 2, dire-wolf
groups: 2
movement: patrol
EOF
bin/place-units ZONE.json             # every map
bin/place-units ZONE.json --map the-hills --dry-run
```

The placer only adds. Units already in a place count toward its density, and a boss or NCU that's
already there isn't placed again, so running it twice adds nothing. To start a place over, clear
its units (the map editor's Places tab) and run it again. It's deterministic: the same map and
plans give the same units.

## The plan

One `key: value` per line. Only `density` and `mix` are needed for ordinary units.

| Key | Value | Default |
|---|---|---|
| `density` | `none`, `sparse`, `normal`, `dense`, `packed`, or a number: encounters per 1000 sq ft of the place's open ground (0, 0.25, 0.5, 1, 1.5). | `none` |
| `mix` | Unit types (the zone's keys), comma separated, each with an optional weight and hostility: `wolf 3, deer neutral, boar 2`. | |
| `groups` | Units per encounter, `1` to `8`, or a range (`2-4`). A group shares a `groupIdentifier`, so it aggros together. | `1` |
| `movement` | `wander [radius]` (feet), `patrol` (back and forth to another spot in the place), or `still`. Group members wander a little instead of patrolling. | `wander 10` |
| `hostility` | `hostile`, `neutral` or `friendly`, for the mix's units that don't say. | `hostile` |
| `boss` | A unit type and an optional movement: placed once, at the place's most open spot near its middle. It takes the room of two encounters. Repeatable. | |
| `ncu` | `identifier "Name" tokenImageUrl ["greeting"] [movement]`: an NCU, placed once near the middle. The token URL is relative to the map file. The greeting is its dialogue's one line. Repeatable. | |

```
density: none
ncu: ranger-hale "Ranger Hale" ../../../tokens/ncu/ranger.webp "Keep to the trails, if you can."
ncu: ranger-sela "Ranger Sela" ../../../tokens/ncu/ranger-2.webp wander 5
```

## Where units go

- On open ground in the place, kept clear of walls by their token radius, and 20 ft from the map's
  connections, so players don't arrive into a fight.
- Spaced by density: encounters about 0.75 x sqrt(1000 / density) feet apart (10 to 40), and from
  units and NCUs already there.
- Off the trails (7.5 ft either side) where they can be, unless the place is `dense` or more.
- A wanderer's radius shrinks to what its spot has room for (`still` under 2 ft). A patroller walks
  20 to 45 ft in a straight, clear line; with no such line, it wanders.
- Units are named `MAP-PLACE-TYPE-N`, groups `MAP-PLACE-gN`.

When a place hasn't room for its density, the placer says how many encounters it placed. A plan
it can't read, or a unit type the zone doesn't have, is an error: that place gets nothing, the
others are still placed, and the tool exits 1.
