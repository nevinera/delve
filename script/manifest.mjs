// Lists a world's files with each one's git blob sha and size, as JSON: { path: { sha, size } }.
//   node script/manifest.mjs <world directory or zip>
import { createHash } from "crypto";
import fs from "fs";
import path from "path";
import { unzipWorld } from "../client/src/editor/world.js";

const target = process.argv[2];
if (!target || !fs.existsSync(target)) {
  console.error("usage: node script/manifest.mjs <world directory or zip>");
  process.exit(2);
}

let files;
try {
  files = read(target);
} catch (err) {
  console.error(`Couldn't read ${target}: ${err.message}`);
  process.exit(2);
}

const blobSha = (bytes) => createHash("sha1").update(`blob ${bytes.length}\0`).update(bytes).digest("hex");
console.log(JSON.stringify(Object.fromEntries([...files.keys()].sort().map((at) => [at, { sha: blobSha(files.get(at)), size: files.get(at).length }]))));

// The world's files, from a directory (leaving out .git) or a zip.
function read(target) {
  if (!fs.statSync(target).isDirectory()) return unzipWorld(new Uint8Array(fs.readFileSync(target))).files;
  const files = new Map();
  for (const file of fs.readdirSync(target, { recursive: true })) {
    const rel = file.split(path.sep).join("/");
    if (rel === ".git" || rel.startsWith(".git/") || !fs.statSync(path.join(target, file)).isFile()) continue;
    files.set(rel, new Uint8Array(fs.readFileSync(path.join(target, file))));
  }
  return files;
}
