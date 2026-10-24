import { CELL_FT, TILE_CELLS, TILE_FT, TERRAINS, THEMES } from "./constants.js";

// One tile as bytes: "DLT1", a uint32 manifest length, the JSON manifest
// (palettes, layer table, placed objects), padding to 4 bytes, then the
// dense layers. Heights are uint16 sixteenths of a foot; the rest are
// uint8 ids into the manifest's palettes, so a palette can grow without
// renumbering stored tiles.
const MAGIC = "DLT1";
const HEIGHT_SCALE = 16;
const LAYERS = [
  {name: "height", type: "u16", scale: HEIGHT_SCALE},
  {name: "terrain", type: "u8", palette: "terrain"},
  {name: "forest", type: "u8"},
  {name: "theme", type: "u8", palette: "theme"},
];

export function encodeTile(world, tx, ty) {
  const n = TILE_CELLS * TILE_CELLS;
  const ox = tx * TILE_FT;
  const oz = ty * TILE_FT;
  const objects = world.objects
    .filter((o) => Math.floor(o.x / TILE_FT) === tx && Math.floor(o.z / TILE_FT) === ty)
    .map((o) => ({...o, x: o.x - ox, z: o.z - oz}));

  let offset = 0;
  const layers = LAYERS.map((layer) => {
    const bytes = layer.type === "u16" ? n * 2 : n;
    const entry = {...layer, offset, bytes};
    offset += bytes;
    return entry;
  });
  const manifest = {
    version: 1,
    tile: [tx, ty],
    cells: TILE_CELLS,
    cellFt: CELL_FT,
    palettes: {terrain: TERRAINS, theme: THEMES},
    layers,
    objects,
  };
  const json = new TextEncoder().encode(JSON.stringify(manifest));
  const headerBytes = align4(8 + json.length);
  const out = new Uint8Array(headerBytes + offset);
  const view = new DataView(out.buffer);
  for (let i = 0; i < 4; i++) out[i] = MAGIC.charCodeAt(i);
  view.setUint32(4, json.length, true);
  out.set(json, 8);

  for (const layer of layers) {
    const at = headerBytes + layer.offset;
    forEachCell(world, tx, ty, (k, idx) => {
      if (layer.type === "u16") {
        view.setUint16(at + k * 2, Math.round(world.height[idx] * HEIGHT_SCALE), true);
      } else {
        out[at + k] = world[layer.name][idx];
      }
    });
  }
  return out;
}

// Writes a tile's bytes into the world at the tile the manifest names.
// Returns the manifest.
export function decodeTile(world, bytes) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const magic = String.fromCharCode(...bytes.subarray(0, 4));
  if (magic !== MAGIC) throw new Error(`not a tile (magic ${magic})`);
  const jsonLength = view.getUint32(4, true);
  const manifest = JSON.parse(new TextDecoder().decode(bytes.subarray(8, 8 + jsonLength)));
  if (manifest.cells !== TILE_CELLS) throw new Error(`tile is ${manifest.cells} cells, expected ${TILE_CELLS}`);
  const headerBytes = align4(8 + jsonLength);
  const [tx, ty] = manifest.tile;
  const remap = {
    terrain: paletteRemap(manifest.palettes.terrain, TERRAINS),
    theme: paletteRemap(manifest.palettes.theme, THEMES),
  };

  for (const layer of manifest.layers) {
    if (!world[layer.name]) continue;
    const at = headerBytes + layer.offset;
    forEachCell(world, tx, ty, (k, idx) => {
      if (layer.type === "u16") {
        world.height[idx] = view.getUint16(at + k * 2, true) / layer.scale;
      } else {
        const raw = bytes[at + k];
        world[layer.name][idx] = layer.palette ? remap[layer.palette][raw] ?? 0 : raw;
      }
    });
  }

  const ox = tx * TILE_FT;
  const oz = ty * TILE_FT;
  world.objects = world.objects
    .filter((o) => Math.floor(o.x / TILE_FT) !== tx || Math.floor(o.z / TILE_FT) !== ty)
    .concat(manifest.objects.map((o) => ({...o, x: o.x + ox, z: o.z + oz})));
  return manifest;
}

function forEachCell(world, tx, ty, fn) {
  let k = 0;
  for (let z = 0; z < TILE_CELLS; z++) {
    const row = (ty * TILE_CELLS + z) * world.w + tx * TILE_CELLS;
    for (let x = 0; x < TILE_CELLS; x++) fn(k++, row + x);
  }
}

function paletteRemap(stored, current) {
  return stored.map((name) => Math.max(0, current.indexOf(name)));
}

const align4 = (n) => (n + 3) & ~3;
