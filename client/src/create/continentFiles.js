import { strFromU8, strToU8 } from "fflate";

// The JSON files /create keeps for a continent beside its plates, such as the planning, biomes,
// water and roads files. Each is read once as the world opens, written into the changes when its
// version moves on, and baked into the ground when its version moves on and it's not being
// dragged or drawn.
//
// A file is { path, load(json), toJSON(), version(), keep(had), bake(), busy() }:
// - load, when it has one, takes the file's JSON as the world has it.
// - version gives anything that changes when the file would.
// - keep says whether to write it, `had` whether the world had it; absent, it's always written.
// - bake(opening), when it has one, puts it into the ground, as the world opens too, and busy says to
//   wait for that.
export class ContinentFiles {
  constructor(worldFiles, changes) {
    Object.assign(this, { worldFiles, changes });
    this.files = [];
  }

  // Adds `file`, reading it from the world and baking it in. `saved` is the version that counts as
  // written already.
  add(file, saved) {
    const bytes = this.worldFiles.get(file.path);
    if (bytes && file.load) file.load(JSON.parse(strFromU8(bytes)));
    file.bake?.(true);
    this.files.push({ ...file, had: Boolean(bytes), saved, baked: file.version() });
  }

  // Whether any has changed since it was last written.
  unsaved() {
    return this.files.some((file) => file.version() !== file.saved);
  }

  // Writes each into `changes` that has something to keep, and gives a function to call once
  // they're stored, which counts them saved as of now.
  write() {
    const versions = this.files.map((file) => file.version());
    for (const file of this.files) {
      if (!file.keep || file.keep(file.had || this.changes.has(file.path))) this.changes.set(file.path, strToU8(`${JSON.stringify(file.toJSON())}\n`));
    }
    return () => this.files.forEach((file, k) => (file.saved = versions[k]));
  }

  // Bakes each in whose version has moved on since, and isn't busy.
  bake() {
    for (const file of this.files) {
      if (!file.bake || file.version() === file.baked || file.busy?.()) continue;
      file.bake(false);
      file.baked = file.version();
    }
  }
}
