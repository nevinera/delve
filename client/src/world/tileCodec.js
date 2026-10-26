// One file per tile: "DLT1", a uint32 manifest length, the JSON manifest, padding to 4 bytes, then
// the dense layers (plans/design.md, "Tile data"). All numbers are little-endian.

const MAGIC = "DLT1";
export const FORMAT_VERSION = 2;

// i32 layers store round(value * scale). The type's lowest value marks "no value" (no
// water, no upper surface) and decodes to NaN.
const LAYER_TYPES = {
  i32: { bytes: 4, array: Float64Array, none: -(2 ** 31), max: 2 ** 31 - 1, get: "getInt32", set: "setInt32" },
  u8: { bytes: 1, array: Uint8Array },
};

// Layers in file order, with how each is stored. An optional layer is left out of the file when
// the tile doesn't have it.
export const SURFACE_LAYERS = [
  { name: "height", type: "i32", scale: 4 },
  { name: "water", type: "i32", scale: 4 },
  { name: "waterKind", type: "u8", optional: true }, // index into palettes.water, where there's water
  { name: "terrain", type: "u8" },
  { name: "biome", type: "u8" },
  { name: "forest", type: "u8" },
  { name: "clutter", type: "u8", optional: true }, // ground clutter density, 100 = normal
  { name: "flowDir", type: "u8", optional: true }, // which way running water goes (generator.js)
  { name: "flowSlope", type: "u8", optional: true }, // how steeply it falls (generator.js)
];

// tile: { coords: [tx, tz], layer, cells, cellFt, palettes, objects, generator, layers: { name: array } }
export function encodeTile(tile, layerSpecs = SURFACE_LAYERS) {
  const count = tile.cells * tile.cells;
  let offset = 0;
  const table = layerSpecs.filter((spec) => !spec.optional || tile.layers[spec.name]).map(({ optional, ...spec }) => {
    const entry = { ...spec, offset };
    offset += count * LAYER_TYPES[spec.type].bytes;
    return entry;
  });

  const manifest = {
    version: FORMAT_VERSION,
    coords: tile.coords,
    layer: tile.layer,
    cells: tile.cells,
    cellFt: tile.cellFt,
    palettes: tile.palettes,
    layers: table,
    objects: tile.objects ?? [],
    ...(tile.falls?.length ? { falls: tile.falls } : {}),
    generator: tile.generator,
  };
  const json = new TextEncoder().encode(JSON.stringify(manifest));
  const headerBytes = align4(8 + json.length);

  const out = new Uint8Array(headerBytes + offset);
  const view = new DataView(out.buffer);
  for (let i = 0; i < 4; i++) out[i] = MAGIC.charCodeAt(i);
  view.setUint32(4, json.length, true);
  out.set(json, 8);

  for (const entry of table) {
    const values = tile.layers[entry.name];
    if (!values || values.length !== count) throw new Error(`layer ${entry.name} needs ${count} values`);
    const at = headerBytes + entry.offset;
    for (let k = 0; k < count; k++) {
      if (entry.type === "u8") out[at + k] = values[k];
      else {
        const type = LAYER_TYPES[entry.type];
        view[type.set](at + k * type.bytes, encodeInt(values[k], entry.scale, type), true);
      }
    }
  }
  return out;
}

export function decodeTile(bytes) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const magic = String.fromCharCode(bytes[0], bytes[1], bytes[2], bytes[3]);
  if (magic !== MAGIC) throw new Error(`not a tile file (magic ${JSON.stringify(magic)})`);
  const jsonLength = view.getUint32(4, true);
  const manifest = JSON.parse(new TextDecoder().decode(bytes.subarray(8, 8 + jsonLength)));
  if (manifest.version !== FORMAT_VERSION) throw new Error(`unsupported tile version ${manifest.version}`);
  const headerBytes = align4(8 + jsonLength);
  const count = manifest.cells * manifest.cells;

  const layers = {};
  for (const entry of manifest.layers) {
    const type = LAYER_TYPES[entry.type];
    if (!type) throw new Error(`unknown layer type ${entry.type}`);
    const values = new type.array(count);
    const at = headerBytes + entry.offset;
    for (let k = 0; k < count; k++) {
      values[k] = entry.type === "u8" ? bytes[at + k] : decodeInt(view[type.get](at + k * type.bytes, true), entry.scale, type);
    }
    layers[entry.name] = values;
  }
  return { ...manifest, layers };
}

function encodeInt(value, scale, { none, max }) {
  if (Number.isNaN(value)) return none;
  return Math.max(none + 1, Math.min(max, Math.round(value * scale)));
}

function decodeInt(raw, scale, { none }) {
  return raw === none ? NaN : raw / scale;
}

function align4(n) {
  return (n + 3) & ~3;
}
