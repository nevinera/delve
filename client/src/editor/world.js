import { strFromU8, strToU8, unzipSync, zipSync } from "fflate";
import { builtObjects, builtStructures, images } from "../objects/collections.js";
import { packPlates, unpackPlates } from "./plates.js";

// A whole world directory held in memory, keyed by path within the world (no leading slash). The
// editor reads and writes files here and downloads the lot as a zip that unzips straight over a
// world checkout. Files it doesn't understand are kept as they were. Tiles are stored in plates,
// but held here a file each (unpack, stored).
export class World {
  constructor(files = new Map()) {
    this.files = files;
  }

  static empty() {
    const world = new World();
    world.writeJson("world.json", {
      version: 1,
      name: "New world",
      continents: [{ key: "main", name: "Main" }],
      dungeons: [],
    });
    return world;
  }

  // Accepts the world directory zipped as-is, or inside one top-level folder (as GitHub's "download
  // ZIP" does).
  static fromZip(bytes) {
    let entries = Object.entries(unzipSync(bytes)).filter(([path]) => !path.endsWith("/"));
    if (!entries.length) throw new Error("the zip is empty");
    const tops = new Set(entries.map(([path]) => path.split("/")[0]));
    const [top] = tops;
    const looksLikeWorld = (paths) => paths.some((path) => path === "world.json" || path.startsWith("places/"));
    const stripped = entries.map(([path, data]) => [path.slice(top.length + 1), data]);
    const wrapped = tops.size === 1 && !looksLikeWorld(entries.map(([p]) => p)) && looksLikeWorld(stripped.map(([p]) => p));
    if (wrapped) entries = stripped;
    return World.fromFiles(new Map(entries), wrapped ? top : "World");
  }

  // A world from its files. One without world.json gets one named `name`, with the continents
  // found in places/.
  static fromFiles(files, name) {
    const world = new World(files);
    if (!world.files.has("world.json")) {
      const keys = [...new Set([...files.keys()].map((path) => path.match(/^places\/continents\/([\w-]+)\//)?.[1]).filter(Boolean))];
      if (!keys.length) throw new Error("no world.json and no places/continents/");
      world.writeJson("world.json", {
        version: 1,
        name,
        continents: keys.sort().map((key) => ({ key, name: key[0].toUpperCase() + key.slice(1) })),
        dungeons: [],
      });
    }
    return world;
  }

  get info() {
    return this.readJson("world.json");
  }

  readJson(path) {
    const bytes = this.files.get(path);
    return bytes ? JSON.parse(strFromU8(bytes)) : null;
  }

  writeJson(path, data) {
    this.files.set(path, strToU8(`${JSON.stringify(data, null, 2)}\n`));
  }

  // Splits the world's plates into the tile files the editor works on (plates.js), with its own
  // kinds of objects registered so they can be sized.
  async unpack({ pool, onProgress } = {}) {
    const library = { objects: builtObjects(this), images: images(this), structures: builtStructures(this) };
    this.files = await unpackPlates(this.files, { library, pool, onProgress });
  }

  // The files as the world stores them, with its tiles in plates.
  stored({ pool, onProgress } = {}) {
    this.plateCache ??= new Map();
    return packPlates(this.files, { cache: this.plateCache, pool, onProgress });
  }

  // The world's files zipped, these files by default, or others such as stored() gives.
  toZip(files = this.files) {
    const sorted = [...files.keys()].sort();
    return zipSync(Object.fromEntries(sorted.map((path) => [path, files.get(path)])));
  }
}
