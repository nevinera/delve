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
