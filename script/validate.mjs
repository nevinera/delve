// Checks a stored world (client/src/world/validate.js), a directory or a zip of one, and prints
// what's wrong, one line each. Exits 1 when there are problems other than warnings, and 2 when it
// can't read the world. --json prints them as a JSON list of { path, message, warning } instead;
// --manifest prints { problems, files }, files giving each file's git blob sha and size.
//
//   node script/validate.mjs [--json | --manifest] <world directory or zip>
import { createHash } from "crypto";
import fs from "fs";
import path from "path";
import { unzipWorld } from "../client/src/editor/world.js";
import { validateWorld } from "../client/src/world/validate.js";

const args = process.argv.slice(2);
const asJson = args.includes("--json");
const manifest = args.includes("--manifest");
const target = args.find((a) => !a.startsWith("--"));
if (!target || !fs.existsSync(target)) {
  console.error("usage: node script/validate.mjs [--json | --manifest] <world directory or zip>");
  process.exit(2);
}

let files;
try {
  files = read(target);
} catch (err) {
  console.error(`Couldn't read ${target}: ${err.message}`);
  process.exit(2);
}

const found = validateWorld(files);
if (manifest) {
  const blobSha = (bytes) => createHash("sha1").update(`blob ${bytes.length}\0`).update(bytes).digest("hex");
  const listed = Object.fromEntries([...files.keys()].sort().map((at) => [at, { sha: blobSha(files.get(at)), size: files.get(at).length }]));
  console.log(JSON.stringify({ problems: found, files: listed }));
} else if (asJson) console.log(JSON.stringify(found, null, 2));
else for (const { path: at, message, warning } of found) console.log(`${warning ? "warning " : ""}${at}: ${message}`);
const errors = found.filter((p) => !p.warning).length;
if (!asJson && !manifest) console.error(errors ? `${errors} problems, ${found.length - errors} warnings` : `ok, ${found.length} warnings`);
process.exit(errors ? 1 : 0);

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
