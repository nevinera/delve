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

  static fromZip(bytes) {
    const files = new Map(Object.entries(unzipSync(bytes)).filter(([path]) => !path.endsWith("/")));
    return new World(files);
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
