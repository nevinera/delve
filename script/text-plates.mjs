// Rewrites a version 2 world's plate and platter files as text (v2/plate.js, v2/platter.js), from
// the gzipped binary they were kept as before, leaving the rest of the world as it was. Says how
// big they were and are, and how long reading them takes.
//
//   node script/text-plates.mjs <world.zip> <out.zip>

import fs from "node:fs";
import { gzipSync, unzipSync, zipSync } from "fflate";
import { PLATE_PATH, decodePlate, encodePlate } from "../client/src/v2/plate.js";
import { PLATTER_PATH, decodePlatter, encodePlatter } from "../client/src/v2/platter.js";
import { loadZipper } from "../client/src/v2/zstd.js";

const [from, to] = process.argv.slice(2);
if (!from || !to) {
  console.error("usage: node script/text-plates.mjs <world.zip> <out.zip>");
  process.exit(1);
}
await loadZipper();
const files = new Map(Object.entries(unzipSync(new Uint8Array(fs.readFileSync(from)))).filter(([path]) => !path.endsWith("/")));
const sizes = { plate: { files: 0, before: 0, after: 0, gzipped: 0, readMs: 0 }, platter: { files: 0, before: 0, after: 0, gzipped: 0, readMs: 0 } };
for (const [path, bytes] of files) {
  const kind = PLATE_PATH.test(path) ? "plate" : PLATTER_PATH.test(path) ? "platter" : null;
  if (!kind) continue;
  const [decode, encode] = kind === "plate" ? [decodePlate, encodePlate] : [decodePlatter, encodePlatter];
  const text = encode(decode(bytes));
  const started = performance.now();
  decode(text);
  const size = sizes[kind];
  size.readMs += performance.now() - started;
  size.files++;
  size.before += bytes.length;
  size.after += text.length;
  size.gzipped += gzipSync(text, { level: 6 }).length;
  files.set(path, text);
}
const mb = (n) => `${(n / 2 ** 20).toFixed(1)} MB`;
for (const [kind, s] of Object.entries(sizes)) {
  if (!s.files) continue;
  console.log(`${s.files} ${kind}s: ${mb(s.before)} before, ${mb(s.after)} as text (${mb(s.gzipped)} gzipped, as GitHub sends text), read in ${(s.readMs / s.files).toFixed(1)} ms each`);
}
fs.writeFileSync(to, zipSync(Object.fromEntries([...files].map(([path, bytes]) => [path, [bytes, { level: bytes[0] === 0x1f && bytes[1] === 0x8b ? 0 : 6 }]]))));
