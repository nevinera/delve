# Platters (version 2 worlds)

A version 2 world keeps the renditions of its tiles and plates in a text file for each platter (64×64 tiles, 8×8 plates, 16,384 ft square), so a client can draw a continent's ground from afar in a few requests. Code: `client/src/v2/platter.js`.

```
places/continents/<continent>/platters/<px>_<pz>.platter
```

A rendition is a tile's or plate's ground an eighth of its size across: heights at the 9×9 corners of its 8×8 parts (a tile's chunks, or a plate's tiles), with a hash of what it was made from, to tell when it's out of date (`client/src/v2/rendition.js`).

## Layout

Numbers are written as in [v2 plates](v2-plates.md#numbers).

```
platter 5 <px> <pz>
t <index> <hash> <heights line>
tw <index> <levels><types>
p <index> <hash> <heights line>
```

- `t`: a tile's rendition. `index` is the tile's place in the platter in plain decimal, `tz * 64 + tx`. `hash` is 16 hex digits. The heights are one [heights line](v2-plates.md#heights) of the 81 corners in row order, `d` taking rows of 9.
- `tw`: the water of the tile before it: 64 parts' levels (3 digits each, written absolutely, `~~~` for dry), then their 64 types.
- `p`: a plate's rendition, as a tile's, `index` = `pz * 8 + px` within the platter.

## Older platters

Readers still take the gzipped binary platters written before (`client/src/v2/platterBinary.js`, versions 2 to 4), told apart by their first two bytes.
