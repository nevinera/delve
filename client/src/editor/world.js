import { strFromU8, strToU8, unzipSync, zipSync } from "fflate";

// A whole world directory held in memory, keyed by path within the world (no leading slash). The
// editor reads and writes files here and downloads the lot as a zip that unzips straight over a
// world checkout. Files it doesn't understand are kept as they were.
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
  // ZIP" does). A world without world.json gets one, with the continents found in places/.
  static fromZip(bytes) {
    let entries = Object.entries(unzipSync(bytes)).filter(([path]) => !path.endsWith("/"));
    if (!entries.length) throw new Error("the zip is empty");
    const tops = new Set(entries.map(([path]) => path.split("/")[0]));
    const [top] = tops;
    const looksLikeWorld = (paths) => paths.some((path) => path === "world.json" || path.startsWith("places/"));
    const stripped = entries.map(([path, data]) => [path.slice(top.length + 1), data]);
    const wrapped = tops.size === 1 && !looksLikeWorld(entries.map(([p]) => p)) && looksLikeWorld(stripped.map(([p]) => p));
    if (wrapped) entries = stripped;
    const world = new World(new Map(entries));
    if (!world.files.has("world.json")) {
      const keys = [...new Set(entries.map(([path]) => path.match(/^places\/continents\/([\w-]+)\//)?.[1]).filter(Boolean))];
      if (!keys.length) throw new Error("no world.json and no places/continents/ in the zip");
      world.writeJson("world.json", {
        version: 1,
        name: wrapped ? top : "World",
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

  toZip() {
    const sorted = [...this.files.keys()].sort();
    return zipSync(Object.fromEntries(sorted.map((path) => [path, this.files.get(path)])));
  }
}
