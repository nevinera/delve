import { strFromU8, strToU8, unzipSync, zipSync } from "fflate";
import { builtObjects, images } from "../objects/collections.js";
import { packPlates, unpackPlates } from "./plates.js";
import { SHAPES_PATH, WORLD_PATH, continentOf } from "./paths.js";
import { kindSizes, setBuiltObjects } from "./objects.js";
import { shapesFile, shapesText } from "./shapes.js";

// A whole world directory held in memory, keyed by path within the world (no leading slash). The
// editor reads and writes files here and downloads the lot as a zip that unzips straight over a
// world checkout. Files it doesn't understand are kept as they were. Tiles are stored in plates,
// but held here a file each (unpack, stored).
export class World {
  constructor(files = new Map()) {
    this.files = files;
  }

  // A new world with one continent, keeping `files` (a repo's README, say).
  static empty(name = "New world", files = new Map()) {
    const world = new World(files);
    world.writeJson(WORLD_PATH, {
      version: 1,
      name,
      continents: [{ key: "main", name: "Main" }],
      dungeons: [],
    });
    return world;
  }

  // Accepts the world directory zipped as-is, or inside one top-level folder (as GitHub's "download
  // ZIP" does).
  static fromZip(bytes) {
    const { files, top } = unzipWorld(bytes);
    return World.fromFiles(files, top ?? "World");
  }

  // A world from its files. One without world.json gets one named `name`, with the continents
  // found in places/. Files with no world at all are refused, or with orNew, start a new world.
  static fromFiles(files, name, { orNew = false } = {}) {
    const world = new World(files);
    if (!world.files.has(WORLD_PATH)) {
      const keys = [...new Set([...files.keys()].map((path) => continentOf(path)).filter(Boolean))];
      if (!keys.length && orNew) return World.empty(name, files);
      if (!keys.length) throw new Error("no world.json and no places/continents/");
      world.writeJson(WORLD_PATH, {
        version: 1,
        name,
        continents: keys.sort().map((key) => ({ key, name: key[0].toUpperCase() + key.slice(1) })),
        dungeons: [],
      });
    }
    return world;
  }

  get info() {
    return this.readJson(WORLD_PATH);
  }

  readJson(path) {
    const bytes = this.files.get(path);
    return bytes ? JSON.parse(strFromU8(bytes)) : null;
  }

  writeJson(path, data) {
    this.files.set(path, strToU8(`${JSON.stringify(data, null, 2)}\n`));
  }

  // Splits the world's plates into the tile files the editor works on (plates.js).
  async unpack({ pool, onProgress } = {}) {
    this.files = await unpackPlates(this.files, { pool, onProgress });
  }

  // The files as the world stores them, with its tiles in plates, sized by its own library, and
  // when it has plates, the shapes file for the kinds they place.
  async stored({ pool, onProgress } = {}) {
    this.plateCache ??= new Map();
    setBuiltObjects(builtObjects(this), images(this));
    const files = await packPlates(this.files, { cache: this.plateCache, pool, sizes: kindSizes(), onProgress });
    const plates = [...this.plateCache].filter(([path]) => files.has(path));
    if (plates.length) files.set(SHAPES_PATH, strToU8(shapesText(shapesFile(plates.flatMap(([, plate]) => plate.kinds)))));
    return files;
  }

  // The world's files zipped, these files by default, or others such as stored() gives.
  toZip(files = this.files) {
    const sorted = [...files.keys()].sort();
    return zipSync(Object.fromEntries(sorted.map((path) => [path, files.get(path)])));
  }
}

// A zipped world's files, as a Map of path -> bytes. A zip with everything in one top-level folder
// (as GitHub's "download ZIP" gives) has that folder taken off, and its name given as `top`.
export function unzipWorld(bytes) {
  const entries = Object.entries(unzipSync(bytes)).filter(([path]) => !path.endsWith("/"));
  if (!entries.length) throw new Error("the zip is empty");
  const tops = new Set(entries.map(([path]) => path.split("/")[0]));
  const [top] = tops;
  const looksLikeWorld = (paths) => paths.some((path) => path === WORLD_PATH || path.startsWith("places/"));
  const stripped = entries.map(([path, data]) => [path.slice(top.length + 1), data]);
  const wrapped = tops.size === 1 && !looksLikeWorld(entries.map(([p]) => p)) && looksLikeWorld(stripped.map(([p]) => p));
  return wrapped ? { files: new Map(stripped), top } : { files: new Map(entries), top: null };
}
