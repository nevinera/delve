// For now, while worlds are moving over: rewrites a version 2 world's plate and platter files as
// text (v2/plate.js, v2/platter.js), from the gzipped binary they were kept as before, leaving the
// rest of the world as it was. Files that are text already are left alone, and so are any that
// can't be read, which it lists. Says how big they were and are, and how long reading them takes.
//
//   node script/text-plates.mjs <world.zip> <out.zip>
//   node script/text-plates.mjs <world folder>        rewrites a checkout's files where they are

import fs from "node:fs";
import path from "node:path";
import { gzipSync, unzipSync, zipSync } from "fflate";
import { PLATE_PATH, decodePlate, encodePlate } from "../client/src/v2/plate.js";
import { PLATTER_PATH, decodePlatter, encodePlatter } from "../client/src/v2/platter.js";
import { loadZipper } from "../client/src/v2/zstd.js";

const [from, to] = process.argv.slice(2);
const folder = from && fs.existsSync(from) && fs.statSync(from).isDirectory();
if (!from || (!folder && !to)) {
  console.error("usage: node script/text-plates.mjs <world.zip> <out.zip>\n       node script/text-plates.mjs <world folder>");
  process.exit(1);
}
await loadZipper();

// The world's files, path -> bytes, paths as in the world (a folder's relative to it).
const files = new Map();
if (folder) {
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory() && entry.name !== ".git") walk(full);
      else if (entry.isFile()) {
        const relative = path.relative(from, full).split(path.sep).join("/");
        if (PLATE_PATH.test(relative) || PLATTER_PATH.test(relative)) files.set(relative, new Uint8Array(fs.readFileSync(full)));
      }
    }
  };
  walk(from);
} else {
  for (const [name, bytes] of Object.entries(unzipSync(new Uint8Array(fs.readFileSync(from))))) if (!name.endsWith("/")) files.set(name, bytes);
}

const sizes = { plate: { files: 0, skipped: 0, before: 0, after: 0, gzipped: 0, readMs: 0 }, platter: { files: 0, skipped: 0, before: 0, after: 0, gzipped: 0, readMs: 0 } };
const changed = new Map();
const failed = []; // files that couldn't be read, left as they were
for (const [name, bytes] of files) {
  const kind = PLATE_PATH.test(name) ? "plate" : PLATTER_PATH.test(name) ? "platter" : null;
  if (!kind) continue;
  const size = sizes[kind];
  if (!(bytes[0] === 0x1f && bytes[1] === 0x8b)) {
    size.skipped++;
    continue;
  }
  const [decode, encode] = kind === "plate" ? [decodePlate, encodePlate] : [decodePlatter, encodePlatter];
  let text;
  try {
    text = encode(decode(bytes));
  } catch (e) {
    failed.push(`${name}: ${e.message}`);
    continue;
  }
  const started = performance.now();
  decode(text);
  size.readMs += performance.now() - started;
  size.files++;
  size.before += bytes.length;
  size.after += text.length;
  size.gzipped += gzipSync(text, { level: 6 }).length;
  changed.set(name, text);
}

const mb = (n) => `${(n / 2 ** 20).toFixed(1)} MB`;
for (const [kind, s] of Object.entries(sizes)) {
  if (s.skipped) console.log(`${s.skipped} ${kind}s were text already`);
  if (!s.files) continue;
  console.log(`${s.files} ${kind}s: ${mb(s.before)} before, ${mb(s.after)} as text (${mb(s.gzipped)} gzipped, as GitHub sends text), read in ${(s.readMs / s.files).toFixed(1)} ms each`);
}

if (folder) {
  for (const [name, text] of changed) fs.writeFileSync(path.join(from, ...name.split("/")), text);
  console.log(`rewrote ${changed.size} files in ${from}`);
} else {
  for (const [name, text] of changed) files.set(name, text);
  fs.writeFileSync(to, zipSync(Object.fromEntries([...files].map(([name, bytes]) => [name, [bytes, { level: bytes[0] === 0x1f && bytes[1] === 0x8b ? 0 : 6 }]]))));
  console.log(`wrote ${to}`);
}
if (failed.length) {
  console.error(`${failed.length} files couldn't be read, and were left as they were:\n${failed.join("\n")}`);
  process.exitCode = 1;
}
