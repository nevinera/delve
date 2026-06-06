# File Formats

## Coordinate System

All formats use **map coordinates**:

- Origin `(0, 0)` = lower-left corner of the map
- `+X` = east (right on map)
- `+Y` = north (up on map)
- 1 unit = 1 foot
- Angles in degrees, 0 = north, clockwise positive

> **Internal note:** the Three.js renderer uses a different convention (`x`/`z` axes, `z` increasing southward). Descriptor classes note this distinction and callers are responsible for converting before construction.

## Schemas

| Schema | Description |
|---|---|
| [schema/common.md](schema/common.md) | Shared types: `Location`, `Position`, `floatRange`, `AssetReference` |
| [schema/zone.md](schema/zone.md) | Zone - a discrete location in the world, composed of maps |
| [schema/map.md](schema/map.md) | Map - one visual floor within a zone, with barriers and connections |
| [schema/unit_type.md](schema/unit_type.md) | UnitType - a template for creating units (monsters, NPCs) |
| [schema/unit.md](schema/unit.md) | Unit - a placed instance of a UnitType on a map |
| [schema/power.md](schema/power.md) | Power - an active ability a unit can use in combat |
| [schema/power_effect.md](schema/power_effect.md) | PowerEffect - a single mechanical outcome of a power |
| [schema/resource_type.md](schema/resource_type.md) | ResourceType - a unit's combat resource (mana, energy, rage, etc.) |
| [schema/graphic_effect.md](schema/graphic_effect.md) | GraphicEffect - a visual played when a power fires |
| [schema/sound_effect.md](schema/sound_effect.md) | SoundEffect - audio played when a power fires |
