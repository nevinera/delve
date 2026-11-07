#!/usr/bin/env node
// Names each sound in public/sounds by a hash of what's in it, as <name>-<n>.<hash>.mp3, and lists
// them in client/src/abilities/soundFiles.json. A changed sound gets a new name, so browsers
// holding the old one fetch it again. Run it after adding or changing a sound; bake_sounds.py runs
// it itself. A file without a hash is the newest of its name, and replaces one with.
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const dir = path.join(root, "public", "sounds");
const list = path.join(root, "client", "src", "abilities", "soundFiles.json");
const NAMED = /^(.+-\d+)(\.[0-9a-f]{8})?\.mp3$/;

const byBase = new Map(); // name-n -> its files, unhashed first
for (const file of fs.readdirSync(dir).sort()) {
  const match = NAMED.exec(file);
  if (!match) continue;
  const files = byBase.get(match[1]) ?? [];
  if (match[2]) files.push(file);
  else files.unshift(file);
  byBase.set(match[1], files);
}

const named = {};
for (const [base, [keep, ...old]] of [...byBase].sort(([a], [b]) => (a < b ? -1 : 1))) {
  for (const file of old) fs.rmSync(path.join(dir, file));
  const hash = createHash("sha256").update(fs.readFileSync(path.join(dir, keep))).digest("hex").slice(0, 8);
  const file = `${base}.${hash}.mp3`;
  if (file !== keep) fs.renameSync(path.join(dir, keep), path.join(dir, file));
  named[base] = file;
}
fs.writeFileSync(list, `${JSON.stringify(named, null, 2)}\n`);
console.log(`${Object.keys(named).length} sounds listed in ${path.relative(root, list)}`);
