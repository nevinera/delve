// A world's file sizes by kind, read times for the text formats, and any files that don't decode.
//   node .agents/skills/measure-world/measure.mjs <world.zip or folder>
import fs from "node:fs";
import path from "node:path";
import { unzipSync } from "fflate";
import { decodeCaves } from "../../../client/src/v2/caves.js";
import { decodePlate } from "../../../client/src/v2/plate.js";
import { decodePlatter } from "../../../client/src/v2/platter.js";

const target = process.argv[2];
if (!target || !fs.existsSync(target)) {
  console.error("usage: node measure.mjs <world.zip or folder>");
  process.exit(2);
}

function read(root) {
  if (!fs.statSync(root).isDirectory()) return Object.entries(unzipSync(fs.readFileSync(root)));
  return fs
    .readdirSync(root, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile() && !path.join(entry.parentPath, entry.name).includes(`${path.sep}.git${path.sep}`))
    .map((entry) => {
      const file = path.join(entry.parentPath, entry.name);
      return [path.relative(root, file), fs.readFileSync(file)];
    });
}

const DECODERS = { ".plate": decodePlate, ".platter": decodePlatter, ".caves": decodeCaves };
const kinds = new Map();
const failed = [];
for (const [name, bytes] of read(target)) {
  if (name.endsWith("/")) continue;
  const ext = path.extname(name);
  const kind = kinds.get(ext) ?? { count: 0, bytes: 0, largest: 0, ms: null };
  kinds.set(ext, kind);
  kind.count += 1;
  kind.bytes += bytes.length;
  kind.largest = Math.max(kind.largest, bytes.length);
  const decode = DECODERS[ext];
  if (!decode) continue;
  const start = performance.now();
  try {
    decode(bytes);
  } catch (e) {
    failed.push(`${name}: ${e.message}`);
  }
  kind.ms = (kind.ms ?? 0) + performance.now() - start;
}

const kb = (n) => (n / 1024).toFixed(1).padStart(10);
console.log(`${"kind".padEnd(10)}${"files".padStart(8)}${"total KB".padStart(12)}${"largest KB".padStart(12)}${"read ms".padStart(10)}`);
for (const [ext, k] of [...kinds].sort((a, b) => b[1].bytes - a[1].bytes)) {
  const ms = k.ms === null ? "" : k.ms.toFixed(0);
  console.log(`${(ext || "(none)").padEnd(10)}${String(k.count).padStart(8)}  ${kb(k.bytes)}  ${kb(k.largest)}${ms.padStart(10)}`);
}
if (failed.length) {
  console.log(`\nFailed to decode:\n${failed.join("\n")}`);
  process.exit(1);
}
