# Attributions

The MIT license in [LICENSE](LICENSE) covers this project's own code, docs and data. It doesn't cover the things below, which keep their own licenses.

## Icons

**Where:** `public/icons/*.svg`

**License:** [Creative Commons Attribution 3.0](https://creativecommons.org/licenses/by/3.0/)

**Source:** [game-icons.net](https://game-icons.net). Their backgrounds are removed, and the game tints them.

[public/icons/credits.txt](public/icons/credits.txt) credits each icon's author. Add a line there when you add an icon. The play menu links to that file, so players can see it too.

## Character animations

**Where:** `client/src/character/animations.json`

**License:** [CC0](https://creativecommons.org/publicdomain/zero/1.0/)

**Source:** [Universal Animation Library](https://quaternius.com/packs/universalanimationlibrary.html) by Quaternius, baked onto our skeleton by `script/bake_animations.mjs`. CC0 doesn't require credit, so this is a courtesy.

## Effect textures

**Where:** `public/effects/stock.png`

The repeating textures beside it, like `public/effects/energy.png`, are ours: `script/bake_effect_textures.py` draws them.

**License:** [CC0](https://creativecommons.org/publicdomain/zero/1.0/)

**Source:** [Particle Pack](https://kenney.nl/assets/particle-pack) by Kenney, scaled down and made grayscale by `script/bake_effect_textures.py`. Its filter templates are credited to Indigo Ray, Craig Nisbet, Zoltan Erdokovy, Heliagon, ThreeDee, Killst4r and Tim2501. The `shard` cell is ours.

## Packages

Packages in `package.json`, `Gemfile` and `game-server/go.mod` keep their own licenses. They aren't copied into this repo.

## Sound effects

**Where:** `public/sounds/*.mp3`

**License:** [CC0](https://creativecommons.org/publicdomain/zero/1.0/)

**Source:** [Impact Sounds](https://kenney.nl/assets/impact-sounds) and [RPG Audio](https://kenney.nl/assets/rpg-audio) by Kenney. `client/src/abilities/stockSounds.json` says which sounds come from them. `script/bake_sounds.py` converts those, and synthesizes the rest, which are ours.

## Footsteps

**Where:** `public/sounds/footstep-*.mp3`, filtered to 200 Hz to 4 kHz and cut into single steps

**License:** [CC0](https://creativecommons.org/publicdomain/zero/1.0/)

**Source:** [Footsteps wearing sneakers walking on sand](https://freesound.org/s/705747/) by felix.blume, on Freesound

## Level-up chime

**Where:** `public/sounds/level-up-1.*.mp3`, trimmed, filtered above 200 Hz and evened out in loudness

**License:** [CC0](https://creativecommons.org/publicdomain/zero/1.0/)

**Source:** [Vibrato Celesta C.wav](https://freesound.org/s/573617/) by acollier123, on Freesound

## Interface sounds

**Where:** `public/sounds/ui-*.mp3`, each trimmed, filtered above 150 Hz and evened out in loudness

**License:** [CC0](https://creativecommons.org/publicdomain/zero/1.0/)

**Source:** on Freesound:
- `ui-click`: [Button Tick](https://freesound.org/s/268108/) by NenadSimic
- `ui-open`: [Page Turn 2](https://freesound.org/s/737005/) by redagee
- `ui-close`: [Closing book](https://freesound.org/s/221910/) by Huminaatio
- `ui-error`: [UI_Cancel](https://freesound.org/s/565133/) by unfa
