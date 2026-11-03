// Every path in a world, relative to its root (.agents/formats.md). Builders
// make a path; parsers take one apart, returning null for a path that isn't theirs.

const CONTINENT = (continent) => `places/continents/${continent}`;

export const WORLD_PATH = "world.json";
export const COLLECTIONS_PATH = "collections.json";
export const TEMPLATE_COLLECTIONS_PATH = "template-collections.json";
export const SHAPES_PATH = "shapes.json";

export const objectPath = (id) => `objects/${id}.json`;
export const templatePath = (id) => `templates/${id}.json`;
export const imagePath = (id) => `textures/${id}.json`;
export const OLD_IMAGES = /^images\/[0-9a-z]{8}\.json$/;
// Structures, which templates replaced: worlds that still have them drop them.
export const OLD_STRUCTURES = /^structures\/[0-9a-z]{8}\.json$|^structure-collections\.json$/;
export const OBJECT_PATH = /^objects\/[0-9a-z]{8}\.json$/;
export const TEMPLATE_PATH = /^templates\/[0-9a-z]{8}\.json$/;
export const IMAGE_PATH = /^textures\/[0-9a-z]{8}\.json$/;

// Game data (.agents/formats.md): each kind's directory, holding <id>.json files.
export const GAME_DATA_DIRS = {
  classes: "classes",
  abilities: "abilities",
  statuses: "statuses",
  items: "items",
  itemTemplates: "item-templates",
  creatures: "creatures",
  npcs: "npcs",
  dialogues: "dialogues",
};
export const gameDataPath = (kind, id) => `${GAME_DATA_DIRS[kind]}/${id}.json`;
const GAME_DATA = /^([\w-]+)\/([0-9a-z]{8})\.json$/;

// The world's models (.agents/formats.md), shared by every continent: its own bodies, and the
// patterns and colorations it adds to shipped bodies.
export const MODELS_PATH = "models.json";

export const sketchPath = (continent) => `${CONTINENT(continent)}/sketch.json`;
export const editedPath = (continent) => `${CONTINENT(continent)}/edited.json`;
export const indexPath = (continent) => `${CONTINENT(continent)}/index.json`;
export const platesIndexPath = (continent) => `${CONTINENT(continent)}/plates.json`;
export const spawnsPath = (continent) => `${CONTINENT(continent)}/spawns.json`;
export const zonePath = (continent, key) => `${CONTINENT(continent)}/zones/${key}.json`;
export const landPath = (continent, bx, bz) => `${CONTINENT(continent)}/land/${bx}_${bz}.f32`;
export const platePath = (continent, layer, px, pz) => `${CONTINENT(continent)}/plates/${layer}/${px}_${pz}.plate`;
export const thumbsDir = (continent) => `${CONTINENT(continent)}/thumbs`;
export const thumbsIndexPath = (continent) => `${thumbsDir(continent)}/index.json`;
export const chunkPath = (continent, cx, cz) => `${thumbsDir(continent)}/${cx}/${cz}.png`;
// A tile file: how the editor holds a tile while a world is open. Stored worlds keep tiles in plates.
export const tilePath = (continent, layer, tx, tz) => `${CONTINENT(continent)}/tiles/${layer}/${tx}/${tz}.dlt.gz`;
// The surface tile file at (tx, tz).
export const surfacePath = (continent, tx, tz) => tilePath(continent, "surface", tx, tz);

const TILE = /^places\/continents\/([\w-]+)\/tiles\/([\w-]+)\/(-?\d+)\/(-?\d+)\.dlt\.gz$/;
const PLATE = /^places\/continents\/([\w-]+)\/plates\/([\w-]+)\/(-?\d+)_(-?\d+)\.plate$/;
const PLATES_INDEX = /^places\/continents\/([\w-]+)\/plates\.json$/;
const LAND = /^places\/continents\/([\w-]+)\/land\/(-?\d+)_(-?\d+)\.f32$/;
const ZONE = /^places\/continents\/([\w-]+)\/zones\/([\w-]+)\.json$/;
const ANY = /^places\/continents\/([\w-]+)\//;

// { continent, layer, tx, tz } for a tile file.
export function tileAt(path) {
  const m = path.match(TILE);
  return m && { continent: m[1], layer: m[2], tx: Number(m[3]), tz: Number(m[4]) };
}

// { continent, layer, coords: [px, pz] } for a plate.
export function plateAt(path) {
  const m = path.match(PLATE);
  return m && { continent: m[1], layer: m[2], coords: [Number(m[3]), Number(m[4])] };
}

// { continent, bx, bz } for a land block.
export function landBlockAt(path) {
  const m = path.match(LAND);
  return m && { continent: m[1], bx: Number(m[2]), bz: Number(m[3]) };
}

// { continent, key } for a zone file.
export function zoneAt(path) {
  const m = path.match(ZONE);
  return m && { continent: m[1], key: m[2] };
}

// { kind, id } for a game data file, kind a key of GAME_DATA_DIRS.
export function gameDataAt(path) {
  const m = path.match(GAME_DATA);
  const kind = m && Object.keys(GAME_DATA_DIRS).find((k) => GAME_DATA_DIRS[k] === m[1]);
  return kind ? { kind, id: m[2] } : null;
}

export const isPlatePath = (path) => PLATE.test(path);
export const isPlatesIndex = (path) => PLATES_INDEX.test(path);

// The continent a path is under, if any.
export const continentOf = (path) => path.match(ANY)?.[1] ?? null;
