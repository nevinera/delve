import { pool } from "../github/github.js";
import { unpackPlate } from "../editor/plates.js";
import { World } from "../editor/world.js";
import { plateOf } from "../world/plateCodec.js";
import { COLLECTIONS_PATH, IMAGE_PATH, OBJECT_PATH, STRUCTURE_COLLECTIONS_PATH, STRUCTURE_PATH, WORLD_PATH, platePath, sketchPath, tileAt } from "../world/paths.js";

// A released world, read straight from raw GitHub at its commit: no API calls and no token. The
// page knows the commit's files (its import's list), so nothing has to be probed for.

const FETCHES = 8; // at once

export const rawUrl = (repo, sha, path) => `https://raw.githubusercontent.com/${repo}/${sha}/${path}`;

// The plates holding the surface tiles within `reach` tiles of (tx, tz) on a continent, as paths.
export function platesAround(continent, [tx, tz], reach) {
  const [x0, z0] = plateOf(tx - reach, tz - reach);
  const [x1, z1] = plateOf(tx + reach, tz + reach);
  const paths = [];
  for (let pz = z0; pz <= z1; pz++) for (let px = x0; px <= x1; px++) paths.push(platePath(continent, "surface", px, pz));
  return paths;
}

export class PlayWorld {
  // paths: every file at the commit. fetchFn: fetch, or a stand-in.
  constructor({ repo, sha, paths, fetchFn = (...args) => fetch(...args) }) {
    Object.assign(this, { repo, sha, fetchFn });
    this.paths = new Set(paths);
    this.world = new World();
    this.plates = new Map(); // plate path -> a promise of the tile keys it held
  }

  async bytes(path) {
    const res = await this.fetchFn(rawUrl(this.repo, this.sha, path));
    if (!res.ok) throw new Error(`couldn't fetch ${path} (${res.status})`);
    return new Uint8Array(await res.arrayBuffer());
  }

  // Fetches the files the world needs before any tiles: world.json, the continents' sketches, and
  // its object library.
  async open() {
    const want = (path) => this.paths.has(path);
    await this.fetchAll([WORLD_PATH]);
    const continents = this.world.info.continents.map((c) => c.key);
    const library = [...this.paths].filter((p) => p === COLLECTIONS_PATH || p === STRUCTURE_COLLECTIONS_PATH || OBJECT_PATH.test(p) || STRUCTURE_PATH.test(p) || IMAGE_PATH.test(p));
    await this.fetchAll([...continents.map(sketchPath).filter(want), ...library]);
  }

  async fetchAll(paths) {
    const bytes = await pool(paths, FETCHES, (path) => this.bytes(path));
    paths.forEach((path, i) => this.world.files.set(path, bytes[i]));
  }

  // Fetches the plates around tile (tx, tz) that haven't been, and splits them into tile files in
  // the world. Resolves with the "tx,tz" keys of the tiles that came.
  async platesAround(continent, tile, reach) {
    const fresh = platesAround(continent, tile, reach).filter((path) => this.paths.has(path) && !this.plates.has(path));
    for (const path of fresh) {
      this.plates.set(
        path,
        this.bytes(path).then((bytes) =>
          unpackPlate(path, bytes).map(([tilePath, gz]) => {
            this.world.files.set(tilePath, gz);
            const { tx, tz } = tileAt(tilePath);
            return `${tx},${tz}`;
          }),
        ),
      );
    }
    const added = await Promise.all(fresh.map((path) => this.plates.get(path).catch((err) => (this.plates.delete(path), Promise.reject(err)))));
    return added.flat();
  }
}
