# Land grid

The land grid is the continent's sculpted shape: a height every 32 ft, from which the generator makes tiles. Code: `client/src/world/landGrid.js`.

```
places/continents/<continent>/land/<bx>_<bz>.f32
```

- Point `(gx, gz)` sits at continent feet `(gx * 32, gz * 32)`. That's 16 points to a tile.
- A block is 256×256 points, which covers 16×16 tiles. Block `(bx, bz)` holds points `gx` from `bx * 256` to `bx * 256 + 255`, and the same for z.
- A block file is exactly 262,144 bytes: 65,536 little-endian float32 heights in feet, in row order (north to south, each row west to east).
- Only blocks with raised land have files. Everywhere else is sea floor, at -50 ft.

Sea level is 0 ft. Ground below -30 ft is deep ocean and gets no tiles.

Between points, the ground follows a Catmull-Rom curve each way, held between its two nearest points so it doesn't overshoot next to a steep step.
