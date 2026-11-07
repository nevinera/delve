import { strFromU8 } from "fflate";
import { pool } from "../github/github.js";
import { biomesPath } from "../create/biomes.js";
import { layoutPath } from "../create/caveLayout.js";
import { PLACED_PATH, placedPath } from "../create/placed.js";
import { CAVES_PATH, cavesPath } from "../v2/caves.js";
import { mapPinsPath, readMapPins } from "../v2/mapPins.js";
import { PLATE_PATH, platePath } from "../v2/plate.js";
import { PLATTER_PATH } from "../v2/platter.js";
import { roadsPath } from "../v2/roads.js";
import { waterPath } from "../v2/water.js";
import { COLLECTIONS_PATH, EFFECT_IMAGE_PATH, EFFECT_SHEET_PATH, ICON_PATH, IMAGE_PATH, OBJECT_PATH, WORLD_PATH } from "../world/paths.js";

// A released version 2 world, read straight from raw GitHub at its commit: no API calls and no
// token. The page knows the commit's files (its import's list), so nothing has to be probed for.
// World.json, the object library, icons and a continent's platters, biomes, water, roads, cave layout and map pins come
// first; plate, placed and caves files as they're wanted.

const FETCHES = 8; // at once
const RETRY_MS = [500, 2000]; // how long to wait before each try again, after a fetch that failed but might not next time

export const rawUrl = (repo, sha, path) => `https://raw.githubusercontent.com/${repo}/${sha}/${path}`;

export class PlayWorld {
  // paths: every file at the commit. fetchFn: fetch, or a stand-in. wait(ms): waits that long.
  constructor({ repo, sha, paths, fetchFn = (...args) => fetch(...args), wait = (ms) => new Promise((done) => setTimeout(done, ms)) }) {
    Object.assign(this, { repo, sha, fetchFn, wait });
    this.paths = new Set(paths);
    this.files = new Map(); // path -> bytes, of what's been fetched to keep
  }

  // Tries again after the network fails, or after GitHub says it's busy or broken, but not after
  // it says there's no such file.
  async bytes(path) {
    for (let tries = 0; ; tries++) {
      let res;
      try {
        res = await this.fetchFn(rawUrl(this.repo, this.sha, path));
      } catch (err) {
        if (tries >= RETRY_MS.length) throw new Error(`couldn't fetch ${path} (${err.message})`);
      }
      if (res?.ok) return new Uint8Array(await res.arrayBuffer());
      const again = !res || res.status === 429 || res.status >= 500;
      if (!again || tries >= RETRY_MS.length) throw new Error(`couldn't fetch ${path} (${res.status})`);
      await this.wait(RETRY_MS[tries]);
    }
  }

  // A file's bytes, or null where the commit hasn't got it.
  async file(path) {
    return this.paths.has(path) ? this.bytes(path) : null;
  }

  readJson(path) {
    const bytes = this.files.get(path);
    return bytes ? JSON.parse(strFromU8(bytes)) : null;
  }

  // World.json, the object library, the icons and the effect sheets.
  async open() {
    const library = [...this.paths].filter((p) => p === COLLECTIONS_PATH || OBJECT_PATH.test(p) || IMAGE_PATH.test(p) || ICON_PATH.test(p) || EFFECT_SHEET_PATH.test(p) || EFFECT_IMAGE_PATH.test(p));
    await this.fetchAll([WORLD_PATH, ...library]);
    this.info = this.readJson(WORLD_PATH);
    if (this.info.version !== 2) throw new Error(`this is a version ${this.info.version} world, and only version 2 worlds can be played`);
  }

  // A continent's platters (as [coords, bytes]), biomes, water, roads, cave layout and map pins.
  async continent(key) {
    const platters = [...this.paths].filter((p) => PLATTER_PATH.exec(p)?.[1] === key);
    await this.fetchAll([...platters, biomesPath(key), waterPath(key), roadsPath(key), layoutPath(key), mapPinsPath(key)].filter((p) => this.paths.has(p)));
    return {
      platters: platters.map((p) => {
        const [, , px, pz] = PLATTER_PATH.exec(p);
        return [[Number(px), Number(pz)], this.files.get(p)];
      }),
      biomes: this.readJson(biomesPath(key)),
      water: this.readJson(waterPath(key)),
      roads: this.readJson(roadsPath(key)),
      caveLayout: this.readJson(layoutPath(key)),
      mapPins: readMapPins(this.readJson(mapPinsPath(key))),
    };
  }

  // Plate (px, pz)'s plate, placed and caves files, each null where there's none.
  plate(continent, coords) {
    return this.file(platePath(continent, coords));
  }

  placed(continent, coords) {
    return this.file(placedPath(continent, coords));
  }

  caves(continent, coords) {
    return this.file(cavesPath(continent, coords));
  }

  // The plates on a continent that have a plate, placed or caves file, as [px, pz].
  plates(continent) {
    const out = new Map();
    for (const path of this.paths) {
      const m = PLATE_PATH.exec(path) ?? PLACED_PATH.exec(path) ?? CAVES_PATH.exec(path);
      if (m?.[1] === continent) out.set(`${m[2]},${m[3]}`, [Number(m[2]), Number(m[3])]);
    }
    return [...out.values()];
  }

  async fetchAll(paths) {
    const bytes = await pool(paths, FETCHES, (path) => this.bytes(path));
    paths.forEach((path, i) => this.files.set(path, bytes[i]));
  }
}
