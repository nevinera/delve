# Game data

What a world defines for combat: classes, abilities, statuses, items, creatures, NPCs, dialogue and spawns. Each is a JSON file in the world, with a schema in [docs/schema](../schema). The rules follow the genre's modern standard as closely as we can: its stats, rating conversions, attack table, GCD and resources.

| Path | What it is | Schema |
| --- | --- | --- |
| `classes/<id>.json` | a class players can pick | [class](../schema/class.schema.json) |
| `abilities/<id>.json` | something a class or creature can do | [ability](../schema/ability.schema.json) |
| `statuses/<id>.json` | a buff, debuff or hidden effect | [status](../schema/status.schema.json) |
| `items/<id>.json` | an item, written by hand | [item](../schema/item.schema.json) |
| `item-templates/<id>.json` | a pattern the server rolls gear from | [item template](../schema/item-template.schema.json) |
| `creatures/<id>.json` | a kind of mob | [creature](../schema/creature.schema.json) |
| `npcs/<id>.json` | a friendly character who talks or sells | [npc](../schema/npc.schema.json) |
| `dialogues/<id>.json` | a dialogue tree | [dialogue](../schema/dialogue.schema.json) |
| `places/continents/<c>/spawns.json` | the continent's spawn regions, placed mobs and NPCs | [spawns](../schema/spawns.schema.json) |

Ids are 8 lowercase base-36 characters, and a file's id matches its name. Files point at each other by id. Every file, and each spawn region and placed mob or NPC, can have `notes`: what it's for and its backstory. The game never reads them. Distances are feet, times are seconds, angles are degrees, and money is copper (100 copper make a silver, 100 silver a gold).

`world.json` sets `levelCap`, 1 to 20 for now. A zone can set `levels`, the `[min, max]` it's built for.

## Amounts

Damage, healing and absorbs take an amount, one of:

- a number, or `[min, max]` to roll between;
- `{ base, attackPower, spellPower, weapon, mastery }`, any of them, added up: `base` is a number or `[min, max]`, `attackPower` and `spellPower` are coefficients of the caster's power, `weapon` a coefficient of a main-hand weapon swing, and `mastery` an amount per point of the caster's mastery percentage.

Power grows with level and gear, so an ability gets stronger as you level without new ranks. A creature has attack and spell power from its level, so the same ability works on a mob.

## Distance and areas

Every unit has a `reach`, how far its body extends from its center: 4.5 ft for a player, and for a creature its `reach`, or one from its body and size. Ranges run from your edge to the target's, so a big target is easier to reach. Range is measured in 3D, so height counts.

Melee is `"melee"` rather than a number: you reach the target when you're within your reach plus its reach plus 4 ft, and never less than 15 ft.

An area is a cylinder: `radius` across, and `height` above and below its center, 15 ft by default. It only takes in units with line of sight from its center.

## Schools

`physical`, `holy`, `fire`, `nature`, `frost`, `shadow` and `arcane`. Armor reduces physical damage only.

## Classes

```json
{
  "id": "m0nk0001",
  "name": "Monk",
  "colors": { "major": "#2e7d5b", "minor": "#e8d8a0" },
  "primaryStats": ["agility"],
  "resources": [
    { "key": "energy", "name": "Energy", "kind": "energy", "color": "#f0d040" },
    { "key": "ki", "name": "Ki", "kind": "points", "color": "#80e0c0", "max": 5 }
  ],
  "armor": [{ "type": "cloth", "level": 1 }, { "type": "leather", "level": 1 }],
  "weapons": ["fist", "staff", "polearm"],
  "offhands": ["fist"],
  "abilities": [{ "ability": "jab00001", "level": 1 }, { "ability": "kick0001", "level": 4 }],
  "passives": [{ "status": "flow0001", "level": 1 }],
  "mastery": { "name": "Centered", "description": "Your strikes hit harder the more ki you hold.", "status": "cntr0001" },
  "startingGear": ["wrap0001", "fist0001"]
}
```

- `primaryStats`: one or more of `strength`, `agility` and `intellect`. A hybrid lists the ones its roles use. Gear rolled for the class uses the first.
- `resources`: one to three. The first is the primary resource, and the UI shows all of them. `kind` sets the rules:
  - `mana`: its maximum comes from level, and it regenerates over time.
  - `energy`: 100, regenerating 10 a second, faster with haste.
  - `rage`: 100, built by dealing and taking damage, decaying out of combat.
  - `points`: whole points up to `max`, like ki or combo points. Abilities build and spend them. `regen` adds that many a second (astra's is `1/9`, so about a point every 9 s), and `decay` drains that many a second out of combat.
- `armor`: what it can wear, each with the level it unlocks at. A paladin lists `chain` at 1 and `plate` at 40.
- `weapons` and `offhands`: weapon types from `client/src/character/weapons.js` (`HELD`) that it can use.
- `abilities` and `passives`: granted automatically at their level. Passives are statuses that never expire, and hidden ones don't show.
- `mastery`: one mastery effect, a status the class always has, whose amounts use `mastery`.
- `startingGear`: items a new character starts with.

Every class has auto-attack from its weapons. The UI shows at most 12 of its abilities on the action bar.

## Abilities

```json
{
  "id": "frst0001",
  "name": "Frostbolt",
  "icon": "frostbolt",
  "school": "frost",
  "target": "enemy",
  "range": 120,
  "castTime": 2,
  "cost": [{ "resource": "mana", "percent": 2 }],
  "speed": 70,
  "effects": [
    { "type": "damage", "affects": "target", "amount": { "spellPower": 1.1 } },
    { "type": "status", "affects": "target", "status": "chil0001" }
  ],
  "visuals": [{ "effect": "bolt", "when": "launch", "colors": ["#a0d8ff", "#ffffff"] }],
  "sounds": [{ "sound": "frost-cast", "when": "cast" }, { "sound": "frost-hit", "when": "impact" }]
}
```

- `target`: what you need targeted to use it. `enemy` or `ally`, or `self`, `ground` (you pick a place within range) or `none`. An `ally` ability with no friendly target lands on you.
- `icon`: its action bar icon, from the stock set the core world ships.
- `range`: how far the target can be, a number or `"melee"` (see Distance and areas). `minRange` is how near it can be.
- `requires`: conditions to use it, each `{ health, below or above }` (`health` is `self` or `target`, in percent) or `{ status, on }` (a status `on` `self` or `target`), or `{ stealthed }` or `{ inCombat }` (true or false, about you). An execute needs `{ "health": "target", "below": 20 }`.
- `creatureTypes`: the creature types it can target, for an ability that only works on beasts, say.
- `facing`: you must face the target within 90° either side. True by default for `enemy` abilities.
- `castTime`: 0 is instant. Moving or jumping cancels a cast unless `castWhileMoving` is true.
- `channel`: `{ duration, ticks }`. You keep casting for `duration` and the effects land on each tick. Moving cancels it too.
- `gcd`: 1.5 by default, and haste shortens it to no less than 0.75. `gcd: 0` is off the global cooldown. `gcdHasted: false` keeps it fixed, as energy users' is (1 s).
- `cooldown`, `charges` and `cooldownHasted`: its own cooldown, how many uses it stores, and whether haste shortens it.
- `cost`: what it spends, each `{ resource, amount }`, or `{ resource: "mana", percent }` of base mana. You can't use it without enough.
- `speed`: a projectile's speed. Its effects aimed at the target land when it arrives, and fizzle if the target dies first.
- `school`: the school of its damage, unless an effect says otherwise.
- `effects`: what it does, below.
- `visuals` and `sounds`: what plays, from the stock sets the core world ships. Each picks an `effect` or `sound`, `when` it plays (`cast`, `launch`, `impact` or `channel`), and `on` (`caster`, `target` or `ground`, the target by default for impacts). Visuals take `colors` and `scale`, and sounds take `volume` and `pitch`, each 1 by default.
- `tags`: free-form words for sorting.

### Effects

Each effect has a `type` and an `affects`:

- `target`: whoever you targeted, or the place, for `ground`.
- `self`.
- `enemies` or `allies`: everyone of that side in an area (see Distance and areas) of `radius` and `height` around `around` (`self`, `target` or `ground`; `self` by default). `cone` narrows it to a slice that many degrees wide in front of you, around yourself only. `max` caps how many it hits, nearest first.

Types:

- `damage`: `amount`, and `school` to override the ability's.
- `heal`: `amount`.
- `resource`: gives `amount` of `resource` (negative takes it).
- `status`: applies `status`, for its own duration unless `duration` says otherwise.
- `interrupt`: stops a cast, and locks its school out for `lockout` seconds.
- `taunt`: makes a mob attack you for `duration`.
- `move`: moves someone, as `kind` says:
  - `charge`: you run to the target at `speed`, stopping in melee range.
  - `leap`: you jump to the target or the ground point, arcing `height` ft up.
  - `knockback`: knocks those it `affects` `distance` ft away from you, `height` ft up.
  - `pull`: pulls those it `affects` to you.
  - `blink`: puts you `distance` ft forward, short of anything in the way.

  The server moves them, and their client follows.

A creature's ability uses the same format. An ability doesn't say who gets it: a class's `abilities` and a creature's `abilities` do.

## Statuses

```json
{
  "id": "chil0001",
  "name": "Chilled",
  "icon": "chilled",
  "kind": "debuff",
  "dispel": "magic",
  "duration": 8,
  "stacking": "refresh",
  "effects": [{ "type": "stat", "stat": "movementSpeed", "multiply": 0.5 }]
}
```

- `kind`: `buff` or `debuff`, shown on unit frames with its `icon`, or `hidden`.
- `dispel`: `magic`, `curse`, `poison`, `disease` or `enrage`, or left out if it can't be dispelled.
- `duration`: how long it lasts, unless whatever applies it says otherwise. Leave it out for one that lasts until something removes it.
- `stacking`: what happens when it lands again. `refresh` resets the duration (and keeps up to 30% of what was left), `replace` starts it over, and `stack` adds a stack up to `maxStacks`, refreshing the duration. Effects scale with stacks.
- `breaksOn`: any of `move`, `damage` and `action` (using an ability or attacking). Food and drink break on `move` and `damage`, and stealth on `damage` and `action`.
- `pose`: `sit` sits you down while it lasts.
- `aura`: a visual on the unit while it lasts, `{ effect, colors }`.

Effects:

Any effect can have `when`, conditions written as an ability's `requires`, checked as the fight goes. It only works while they hold.

- `stat`: changes `stat` by `add` or `multiply`. `school` limits a damage or healing stat to one school. Stats:
  - from gear: `strength`, `agility`, `intellect`, `stamina`, `armor`, `critRating`, `hasteRating`, `masteryRating`, `versatilityRating`, `leechRating`, `avoidanceRating` and `speedRating`;
  - worked out from those: `attackPower`, `spellPower`, `maxHealth`, `critChance`, `critDamage`, `haste`, `mastery`, `versatility`, `leech`, `avoidance`, `dodge`, `parry`, `block`, `movementSpeed`, `attackSpeed`, `stealth` and `detection` (in levels), where percentages add in points;
  - outcomes: `damageDone`, `healingDone`, `damageTaken`, `healingTaken` and `threat`, which multiply.
- `periodic`: every `every` seconds (shorter with the caster's haste), does `damage`, `heal` or `resource` by `amount`. `school` and `resource` as for ability effects.
- `absorb`: soaks up `amount` of damage, of `schools` if it lists them, then ends.
- `control`: one of `stun`, `root`, `silence`, `incapacitate`, `disorient`, `fear` and `disarm`. Damage breaks incapacitate, disorient and fear.
- `trigger`: when the holder does something (`on`: `dealDamage`, `takeDamage`, `heal`, `crit`, `cast`, `dodge`, `parry` or `block`, or `healthBelow` when its health drops below `threshold` percent), with `chance` (0 to 1, 1 by default), at most once each `cooldown` seconds, applies `effect`, an ability effect that `affects` `self` or `target`.
- `stealth`: hides the holder. Others see it only when they detect it, which depends on how near it is, whether they face it, and the gap between its level plus its `stealth` stat and their level plus their `detection` stat. Undetected, it can't be targeted, but areas still hit it. Entering combat, or being hit, ends the status. Stealth's slower movement is a `movementSpeed` stat effect beside it.
- `none`: nothing, for a status other things look for by name.

## Items

```json
{
  "id": "wrap0001",
  "name": "Initiate's Wraps",
  "icon": "leather-chest",
  "quality": "common",
  "itemLevel": 5,
  "requiredLevel": 1,
  "slot": "chest",
  "armorType": "leather",
  "stats": { "agility": 2, "stamina": 2 },
  "colors": ["#6b4a2e", "#c8b070"],
  "price": 120
}
```

- `icon`: its bag and tooltip icon, from the stock set. `description` is flavor text on the tooltip.
- `quality`: `poor` (junk), `common`, `uncommon`, `rare` or `epic`.
- `itemLevel` sets armor and weapon damage, which the server works out. `requiredLevel` is the level you need to equip it.
- `slot`: `head`, `neck`, `shoulders`, `back`, `chest`, `wrists`, `hands`, `waist`, `legs`, `feet`, `finger`, `trinket`, `oneHand`, `mainHand`, `offHand`, `twoHand` or `ranged`. Leave it out for an item you don't wear.
- `armorType`: for the six armor slots with a model (`client/src/character/armor.js`, `ARMOR_SLOTS`), one of `cloth`, `leather`, `chain` and `plate`.
- `weaponType`: for weapon slots, a type from `HELD` in `client/src/character/weapons.js`, including `shield` and `orb` for an off hand. `speed` is its swing time, and `damage` (`[min, max]`) overrides what the server works out.
- `stats`: gear stats, from the list above.
- `colors`: `[main, trim]`, recoloring the shared model for its type and slot.
- `price`: what a vendor sells it for. Vendors buy it back for a quarter of that. Leave it out for an item vendors won't take.
- `stack`: how many fit in one bag slot, 1 by default.
- `use`: an ability it casts when you use it, like food or a potion. `consumed` true uses one up.

## Item templates

The server rolls generated gear from these when a mob drops gear, at the mob's level.

```json
{
  "id": "swrd0001",
  "names": ["Worn Shortsword", "Militia Sword", "Notched Blade"],
  "slot": "oneHand",
  "weaponType": "sword",
  "speed": 2.4,
  "levels": [1, 12],
  "qualities": { "common": 4, "uncommon": 1 },
  "stats": { "primary": 2, "stamina": 2, "secondary": 1 },
  "colors": [["#9a9ea4", "#6b4a2e"], ["#7a7e84", "#3a2a1a"]]
}
```

- `levels`: the mob levels it drops from.
- `qualities`: how likely each quality is, by weight. Better quality means a higher item level.
- `stats`: how the stat budget splits, by weight. `primary` is the primary stat of whoever loots it, and each `secondary` is a secondary rating rolled at random.
- `colors`: `[main, trim]` pairs to pick from.

The rest is as for items.

## Creatures

```json
{
  "id": "wolf0001",
  "name": "Timber Wolf",
  "family": "wolves",
  "creatureType": "beast",
  "look": { "body": "wolf", "height": 3, "colors": { "skin": ["#6a5a4a", "#4a4a4a"] } },
  "reaction": "hostile",
  "attack": { "speed": 2 },
  "abilities": ["bite0001"],
  "loot": { "junk": 0.6, "gear": 0.08, "items": [{ "item": "pelt0001", "chance": 0.3 }] }
}
```

- `look`: a character recipe (`client/src/character/recipe.js`). Its `body` is `humanoid`, or one of the creature bodies in `BODIES` (`client/src/world/gameData.js`). A creature body gives the look its own settings (recipe.js's `BODY_LOOKS`), and the recipe's settings go over them, so a world can make a pale goblin or a small troll. Goblins and trolls stand on the humanoid skeleton and use its clips; four-legged bodies (wolf, panther, rat, hyena, lion, tiger, deshaug, coalhound, bear, gorilla, owlbear, myoxa, boar, stag, deer, goat, sheep, cow, horse, elephant, mammoth, rhino, hippo, lizard, basilisk, crocodile, turtle, tortoise) dragons (dragon, wyvern), serpents (snake, cobra, centipede, duneshk, eel, coatl) swimmers (shark, barracuda, piranha, stingray, sea turtle as `seaturtle`), bats, crawlers (spider, scorpion, beetle, crab, ant, hivari, wasp), slimes and wisps, birds (vulture, owl, eagle, crow, chicken, penguin) and striders on two legs (raptor, tyrant, ostora) have skeletons and clips of their own. A bird folds its wings on the ground and flies on them, but a chicken or penguin can't fly; a penguin slides on its belly to attack. A wisp floats and glows, motes of light circling it. A four-legged look can take a `flesh` (deshaug are fire, coalhounds molten, myoxa fungal). A turtle or tortoise hides in its shell when hit, a hyena laughs and a gorilla beats its chest for a battle cry. A wasp hovers, its legs hanging, and flies; a coatl flies on feathered wings; a duneshk rises out of the ground for its battle cry and dives back into it to attack. A swimmer floats off the ground, and its height is its length (a stingray's or sea turtle's, its width); its walk and run are swims. A bat is always in the air, and its height is its wingspan. A creature plays a clip for each role it has: idle, walk, run, fly, attack, bigAttack, cast, shoot, breath (a dragon's or deshaug's fire, from its `mouth` bone), battleCry, hit and death. Bodies not built yet are drawn as humanoids.
- A humanoid look holds a `weapon` and `offhand`, each made in a `weaponStyle` and `offhandStyle` of `fine`, `crude` or `savage`, and wears `armor` with a `style` per piece of `fine`, `tattered` or `savage`. Its attacks go by its weapon: unarmed, one-handed, two-handed, bow, firearm or thrown.
- `loadouts`: a list of outfits, each with any of `weapon`, `offhand`, `weaponStyle`, `offhandStyle`, `armor` and `colors`, and a `weight` (1 by default). Each spawn wears one, picked by weight. An outfit goes over its body's look, and the recipe's own settings go over the outfit. Goblins and trolls come with loadouts, and a world's `loadouts` replace them.
- A recipe also shapes the body with `arms`, `legs` and `head` (0 to 1, 0.5 ordinary: longer arms, longer legs, a bigger head, at the same height), `ears` (`round`, `pointed`, `long` or `bear`), `nose` (`human`, `long` or `broad`), `tusks` (`none`, `small` or `large`), `muzzle` (`none`, `canine`, `reptile`, `bovine`, `frog`, `boar`, `bear`, or `insect` for mandibles and compound eyes), `horns` (`none`, `small`, `bull`, `ram`, `swept`, `antennae` or `antlers`, colored by `colors.horn`), `tail` (`none`, `reptile`, `thin`, `tuft` or `bushy`), `wings` (`none`, `bat` or `feather`), `hands` (`hands`, or `pincers` for a crab's claws), `lowerArms` (`none`, or `pair` for a second pair of arms below the first, which hold nothing), `flesh`, `lower` (`legs`, `hocked` for goat's legs on hocks in the secondary color, or `horse` for a horse's body in the secondary color, `drake` for a drake's body in the skin color, `serpent` for a serpent's tail, `vortex` for a whirl down to a point in the secondary color), `gait` (`normal`, or `shamble` to stand, walk and run as a zombie) and `unarmed` (`punch`, or `claw` to tear with its hands when it holds no weapon). `hair` can also be `cap` (a mushroom's), `branches` (a tree's, with leaves in `colors.leaf`) or `leaves`, and `jewelry` can hold a `crown`, its gem in `colors.paint`.
- `flesh` is `living`, `rotting`, `stitched` (rotting, sewn together), `bone`, an element's (`stone`, `fire`, `water` or `air`), or `fur`, `shell`, `chitin`, `wrapped` (a mummy's linen), `spirit` (pale and see-through), `shadow` (dark and see-through), `bark`, `fungal` or `molten` (dark rock with glowing cracks). Fur, shell, chitin, wrapped, spirit, shadow, bark, fungal and molten wear no clothes, though they wear armor.
- The humanoid creature bodies are made of these: orc, ogre, kobold, gnoll, lizardfolk, tauros, skeleton, zombie, giant, harpy, gargoyle, imp, centaur, naga, amphen, the elementals georite, furite, aquite and aerite (earth, fire, water and air), boric (boar-folk), ursol (bear-folk), trog, homari (lobster-folk), tyrshaug, drakel, abomination, ghoul, mummy, lich, banshee, ghost, deepshaug, smoulder, treant, dryad, succubus, hivelord, cindershaug, golem, mycosi (mushroom-folk) and drakesh (a drakel's upper body on a drake's).
- `creatureType`: `beast`, `humanoid`, `undead`, `elemental`, `demon`, `dragonkin`, `giant`, `mechanical`, `aberration` or `critter`. Some abilities only work on some types. `family` groups creatures in the editor.
- `reach`: how far its body extends from its center (see Distance and areas). Left out, it comes from the body and `look.height`.
- `classification`: `normal` by default, or `trivial`, `elite`, `rare`, `rareElite` or `boss`. With the level, it sets health, damage and armor, and `health`, `damage` and `armor` multiply those (1 by default).
- `reaction`: `hostile` attacks you on sight, `neutral` only when attacked.
- `aggroRadius`: how near you get before it notices, 60 ft by default, longer when it outlevels you and shorter when you outlevel it. It's measured in 3D, and it has to see you.
- `stealthed`: it spawns stealthed, and stealths again when it resets, with the `stealth` status this names.
- `attack`: auto-attack `{ speed, range, school }`, by default 2 s, melee, physical.
- `speed`: a multiplier on run speed, 1 by default.
- `resource`: one resource, as a class has, for abilities that cost something.
- `onDeath`: an ability it uses as it dies, from where it fell, with no cost or cast time. Tactics never pick it.
- `abilities` and `tactics`: what it can do and how it picks. `tactics` is one of `{ "type": "random" }` (the default), `{ "type": "priority", "abilities": [...] }` and `{ "type": "rotation", "abilities": [...] }`.
- `loot`: `gold` multiplies the gold it drops for its level (1 by default; 0 drops none). `junk` and `gear` are chances of a junk item and of generated gear. `items` are written items, each with a `chance`.
- `tags`: free-form words for sorting, like `caster` or `healer`. They don't change how it plays.

Every mob picks its target by threat.

## NPCs

```json
{
  "id": "vend0001",
  "name": "Brother Danil",
  "title": "General Supplies",
  "look": { "body": "humanoid", "height": 5.8 },
  "dialogue": "danl0001",
  "vendor": { "sells": ["brd00001", "watr0001"] }
}
```

NPCs can't be attacked. `dialogue` is what they say when you talk to them. `vendor` sells `sells` and buys what you bring.

## Dialogue

```json
{
  "id": "danl0001",
  "start": "hello",
  "lines": {
    "hello": {
      "text": "Welcome, traveller. Bread's fresh today.",
      "choices": [
        { "text": "What's for sale?", "do": "vendor" },
        { "text": "What is this place?", "next": "place" },
        { "text": "Goodbye.", "do": "close" }
      ]
    },
    "place": { "text": "Saint Aldric's Priory. Mind the goblins in the hills.", "choices": [{ "text": "Thanks.", "next": "hello" }] }
  }
}
```

Each line has the NPC's `text` and your `choices`. A choice goes to the line `next` names, or does `vendor` (opens the NPC's shop) or `close`. A line with no choices ends the conversation.

## Spawns

`places/continents/<c>/spawns.json`:

```json
{
  "version": 1,
  "regions": [
    {
      "id": "r8k2m1qa",
      "name": "Wolf Den",
      "area": [[[[10, 12], [14, 12], [14, 15], [10, 15]]]],
      "spawns": [{ "creature": "wolf0001", "density": 6, "pack": [1, 3], "levels": [3, 4], "respawn": 300 }]
    }
  ],
  "placed": [
    { "id": "p1x9z2aa", "npc": "vend0001", "at": [5120, 82, 6400], "yaw": 90 },
    { "id": "p2b7c3dd", "creature": "wolf0002", "at": [5400, 80, 6600], "levels": 6, "respawn": 900, "pack": "den00001" },
    { "id": "p3c8d4ee", "creature": "wolf0002", "at": [5410, 80, 6604], "levels": 6, "respawn": 900, "pack": "den00001" },
    { "id": "p4d9e5ff", "creature": "wolf0001", "at": [5600, 85, 6500], "levels": 5, "patrol": { "points": [[5600, 6500], [5800, 6500], [5800, 6700]], "loop": true } }
  ]
}
```

- `regions`: areas marked on the map, named or not. `area` is a multipolygon in tile units, as a zone's region is. Each of its `spawns` scatters `density` mobs a tile (512 ft square) of `creature` across the area at random, at a level from `levels` (a number, or `[min, max]`), each coming back `respawn` seconds after it dies. `pack`, `[min, max]`, spawns them in packs of that many, 1 by default. `wander` is how far each strays from where it spawned, 30 ft by default.
- `placed`: one `creature` or `npc` each, `at` a point in feet, facing `yaw`. Creatures take `levels`, `respawn`, `wander`, `pack` and `patrol`:
  - `pack`: an id that placed creatures share. When one is pulled, the rest join.
  - `patrol`: `points`, each `[x, z]` in feet, that it walks between, on the ground. With `loop` it goes back to the first; without, it turns back. A patrolling creature doesn't wander.

Mobs near one that's pulled, of the same `family`, may join it too.
