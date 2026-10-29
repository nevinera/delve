import { pool } from "../github/github.js";
import { World } from "../editor/world.js";
import { plateOf } from "../world/plateCodec.js";
import { COLLECTIONS_PATH, IMAGE_PATH, OBJECT_PATH, WORLD_PATH, plateAt, platePath, platesIndexPath, sketchPath, tilePath } from "../world/paths.js";
import { MemoryStore, PlateCache } from "./plateCache.js";

// A released world, read straight from raw GitHub at its commit: no API calls and no token. The
// page knows the commit's files (its import's list), so nothing has to be probed for. Plates are
// streamed in and kept in the browser by their hashes (plateCache.js), so a plate already there
// isn't downloaded again.

const FETCHES = 8; // at once
// Plates stay loaded this many tiles beyond the reach they're loaded for, so walking back and forth
// across a plate's edge doesn't load and drop it each time.
const KEEP_BEYOND = 8;

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
  // paths: every file at the commit. fetchFn: fetch, or a stand-in. cache: a PlateCache.
  constructor({ repo, sha, paths, fetchFn = (...args) => fetch(...args), cache = new PlateCache(new MemoryStore()) }) {
    Object.assign(this, { repo, sha, fetchFn, cache });
    this.paths = new Set(paths);
    this.world = new World();
    this.plates = new Map(); // plate path -> a promise of the tile keys it held
    this.hashes = new Map(); // plate path -> its hash, from its continent's plates.json
  }

  async response(path) {
    const res = await this.fetchFn(rawUrl(this.repo, this.sha, path));
    if (!res.ok) throw new Error(`couldn't fetch ${path} (${res.status})`);
    return res;
  }

  async bytes(path) {
    return new Uint8Array(await (await this.response(path)).arrayBuffer());
  }

  // A file's text as it arrives, in pieces.
  async *text(path) {
    const reader = (await this.response(path)).body.pipeThrough(new TextDecoderStream()).getReader();
    for (;;) {
      const { done, value } = await reader.read();
      if (done) return;
      yield value;
    }
  }

  // Fetches the files the world needs before any tiles: world.json, the continents' sketches and
  // plate indexes, and its object library.
  async open() {
    const want = (path) => this.paths.has(path);
    await this.fetchAll([WORLD_PATH]);
    const continents = this.world.info.continents.map((c) => c.key);
    const library = [...this.paths].filter((p) => p === COLLECTIONS_PATH || OBJECT_PATH.test(p) || IMAGE_PATH.test(p));
    await this.fetchAll([...continents.flatMap((c) => [sketchPath(c), platesIndexPath(c)]).filter(want), ...library]);
    for (const continent of continents) {
      const index = this.paths.has(platesIndexPath(continent)) && this.world.readJson(platesIndexPath(continent));
      for (const [key, hash] of Object.entries(index?.plates ?? {})) {
        const [layer, coords] = key.split("/");
        this.hashes.set(platePath(continent, layer, ...coords.split("_").map(Number)), hash);
      }
    }
  }

  async fetchAll(paths) {
    const bytes = await pool(paths, FETCHES, (path) => this.bytes(path));
    paths.forEach((path, i) => this.world.files.set(path, bytes[i]));
  }

  // Loads the plates around tile (tx, tz) that haven't been, from the cache or GitHub, into tile
  // files in the world, and drops the tile files of plates left well behind (the cache keeps them).
  // Resolves with the "tx,tz" keys of the tiles that came.
  async platesAround(continent, tile, reach) {
    this.dropBeyond(continent, tile, reach + KEEP_BEYOND);
    const fresh = platesAround(continent, tile, reach).filter((path) => this.paths.has(path) && !this.plates.has(path));
    for (const path of fresh) {
      const { layer } = plateAt(path);
      // A plate missing from plates.json is known by the commit it's in instead.
      const hash = this.hashes.get(path) ?? `${this.sha} ${path}`;
      this.plates.set(
        path,
        this.cache.tiles(hash, () => this.text(path)).then((tiles) =>
          tiles.map(([key, file]) => {
            this.world.files.set(tilePath(continent, layer, ...key.split(",").map(Number)), file);
            return key;
          }),
        ),
      );
    }
    const added = await Promise.all(fresh.map((path) => this.plates.get(path).catch((err) => (this.plates.delete(path), Promise.reject(err)))));
    return added.flat();
  }

  // Drops the loaded plates on the continent with no tile within reach of (tx, tz), or on another.
  dropBeyond(continent, tile, reach) {
    const keep = new Set(platesAround(continent, tile, reach));
    for (const [path, loading] of this.plates) {
      if (keep.has(path)) continue;
      this.plates.delete(path);
      const plate = plateAt(path);
      loading.then(
        (keys) => {
          if (this.plates.has(path)) return; // loaded again since
          for (const key of keys) this.world.files.delete(tilePath(plate.continent, plate.layer, ...key.split(",").map(Number)));
        },
        () => {},
      );
    }
  }
}
