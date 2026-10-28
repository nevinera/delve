// Checks a stored world (client/src/world/validate.js), a directory or a zip of one, and prints
// what's wrong, one line each. Exits 1 when there are problems other than warnings. --json prints
// them as a JSON list of { path, message, warning } instead.
//
//   node script/validate.mjs [--json] <world directory or zip>
import fs from "fs";
import path from "path";
import { unzipWorld } from "../client/src/editor/world.js";
import { validateWorld } from "../client/src/world/validate.js";

const args = process.argv.slice(2);
const asJson = args.includes("--json");
const target = args.find((a) => !a.startsWith("--"));
if (!target || !fs.existsSync(target)) {
  console.error("usage: node script/validate.mjs [--json] <world directory or zip>");
  process.exit(2);
}

let files;
if (fs.statSync(target).isDirectory()) {
  files = new Map();
  for (const file of fs.readdirSync(target, { recursive: true })) {
    const rel = file.split(path.sep).join("/");
    if (rel === ".git" || rel.startsWith(".git/") || !fs.statSync(path.join(target, file)).isFile()) continue;
    files.set(rel, new Uint8Array(fs.readFileSync(path.join(target, file))));
  }
} else files = unzipWorld(new Uint8Array(fs.readFileSync(target))).files;

const found = validateWorld(files);
if (asJson) console.log(JSON.stringify(found, null, 2));
else for (const { path: at, message, warning } of found) console.log(`${warning ? "warning " : ""}${at}: ${message}`);
const errors = found.filter((p) => !p.warning).length;
if (!asJson) console.error(errors ? `${errors} problems, ${found.length - errors} warnings` : `ok, ${found.length} warnings`);
process.exit(errors ? 1 : 0);
