// Runs and draws "bones" files (client/src/editor/bones.js): the land's shape written as a list of
// operations, which an agent or a person can write, run, look at and adjust.
//
//   node script/bones.mjs run <bones.json> [--png land.png] [--world in.zip] [--out world.zip] [--continent main]
//   node script/bones.mjs render <bones.json | land.png> [options]
//   node script/bones.mjs ops
//
// run builds the land and writes it as a heightmap PNG (the editor's "import png" takes it), into a
// world zip (a new world unless --world gives one to add to), or both. ops lists every op and what
// it takes.
//
// render draws the land from a bones file, or from a heightmap PNG that run wrote (quicker to draw
// again and again). Options:
//   --out <file.png>        where to write it (view.png by default)
//   --map                   from straight above, north up, with grid lines labelled in thousands of ft
//   --from <n|ne|e|...|nw>  looking from that side, down at --tilt degrees (35 by default)
//   --at <x,z> --radius <ft>  what to frame (all the land by default)
//   --eye <x,y,z> --look <x,y,z>  a camera placed by hand instead
//   --set                   a map and views from the four sides, as <out>-map.png, <out>-n.png, ...
//   --size <WxH>            pixels (1200x800 by default; a map keeps the land's proportions)
//   --colors <earth|heat>   heights as natural colours, or as the editor's heat map
//   --exaggerate <n>        heights drawn n times as tall (1 by default)
//   --contours <ft>         height lines on a map
//   --grid <ft>             a map's grid line spacing (5000 by default; 0 for none)
//   --fov <degrees>         field of view (50 by default)
import fs from "fs";
import { OPS, runBones } from "../client/src/editor/bones.js";
import { encodeRgbPng, exportHeightmap, importHeightmap } from "../client/src/editor/heightmap.js";
import { paddedBounds, renderMap, renderView } from "../client/src/editor/landRender.js";
import { World } from "../client/src/editor/world.js";
import { saveLand } from "../client/src/world/landGrid.js";

const SIDES = { n: [0, -1], ne: [1, -1], e: [1, 0], se: [1, 1], s: [0, 1], sw: [-1, 1], w: [-1, 0], nw: [-1, -1] };

function options(args) {
  const out = { _: [] };
  for (let i = 0; i < args.length; i++) {
    if (!args[i].startsWith("--")) out._.push(args[i]);
    else if (["map", "set"].includes(args[i].slice(2))) out[args[i].slice(2)] = true;
    else out[args[i].slice(2)] = args[++i];
  }
  return out;
}

const numbers = (text) => text.split(",").map(Number);

function load(file) {
  const bytes = fs.readFileSync(file);
  if (file.endsWith(".png")) return importHeightmap(new Uint8Array(bytes), { range: [-50, 1000], centre: [0, 0] });
  const started = Date.now();
  const land = runBones(JSON.parse(bytes.toString("utf8")));
  console.error(`ran ${file} in ${((Date.now() - started) / 1000).toFixed(1)}s`);
  return land;
}

function writePng(file, picture) {
  fs.writeFileSync(file, encodeRgbPng(picture.width, picture.height, picture.rgb));
  console.log(`wrote ${file} (${picture.width}x${picture.height})`);
}

// A camera looking at the land (or at --at, within --radius) from a side.
function sideView(land, side, o) {
  const bounds = paddedBounds(land);
  const at = o.at ? numbers(o.at) : [(bounds[0] + bounds[2]) / 2, (bounds[1] + bounds[3]) / 2];
  const radius = o.radius ? Number(o.radius) : Math.hypot(bounds[2] - bounds[0], bounds[3] - bounds[1]) / 2;
  const [dx, dz] = SIDES[side] ?? fail(`--from takes ${Object.keys(SIDES).join(", ")}`);
  const tilt = ((o.tilt ? Number(o.tilt) : 35) * Math.PI) / 180;
  const fov = o.fov ? Number(o.fov) : 50;
  // Near enough that the land fills the picture across; it's wider than it's deep, seen tilted.
  const distance = (radius / Math.tan((fov * Math.PI) / 360)) * 0.6;
  const length = Math.hypot(dx, dz);
  const ground = land.heightAt(at[0], at[1]);
  const look = [at[0], Math.max(0, ground), at[1]];
  const eye = [at[0] + (dx / length) * distance * Math.cos(tilt), look[1] + distance * Math.sin(tilt), at[1] + (dz / length) * distance * Math.cos(tilt)];
  return { eye, at: look, fov };
}

function render(land, o, out) {
  const [width, height] = (o.size ?? "1200x800").split("x").map(Number);
  const common = { colors: o.colors ?? "earth" };
  if (o.map) {
    let bounds;
    if (o.at) {
      const [x, z] = numbers(o.at);
      const r = Number(o.radius ?? 5000);
      bounds = [x - r, z - r, x + r, z + r];
    }
    return writePng(out, renderMap(land, { ...common, bounds, width, contourFt: Number(o.contours ?? 0), gridFt: Number(o.grid ?? 5000) }));
  }
  const camera = o.eye ? { eye: numbers(o.eye), at: numbers(o.look ?? fail("--eye needs --look")), fov: Number(o.fov ?? 50) } : sideView(land, o.from ?? "s", o);
  console.error(`camera at ${camera.eye.map(Math.round)} looking at ${camera.at.map(Math.round)}`);
  writePng(out, renderView(land, { ...common, ...camera, width, height, exaggerate: Number(o.exaggerate ?? 1), stride: Number(o.stride ?? 1) }));
}

function fail(message) {
  console.error(message);
  process.exit(1);
}

const [command, ...rest] = process.argv.slice(2);
const o = options(rest);

if (command === "ops") {
  for (const [name, op] of Object.entries(OPS)) {
    console.log(`${name}: needs ${op.needs.join(", ") || "nothing"}${op.area ? " (and an area: outline, or at and radius, with feather)" : ""}; takes ${JSON.stringify(op.takes)}`);
  }
} else if (command === "run") {
  const [file] = o._;
  if (!file) fail("run needs a bones file");
  const land = load(file);
  if (!o.png && !o.out) o.png = file.replace(/\.json$/, "") + ".png";
  if (o.png) {
    fs.writeFileSync(o.png, exportHeightmap(land).bytes);
    console.log(`wrote ${o.png}`);
  }
  if (o.out) {
    const world = o.world ? World.fromZip(new Uint8Array(fs.readFileSync(o.world))) : World.empty();
    saveLand(world.files, o.continent ?? "main", land);
    fs.writeFileSync(o.out, world.toZip());
    console.log(`wrote ${o.out}`);
  }
} else if (command === "render") {
  const [file] = o._;
  if (!file) fail("render needs a bones file or a heightmap png");
  const land = load(file);
  const out = o.out ?? "view.png";
  if (o.set) {
    const base = out.replace(/\.png$/, "");
    render(land, { ...o, map: true, size: o.size?.split("x")[0] ?? "1200" }, `${base}-map.png`);
    for (const side of ["n", "e", "s", "w"]) render(land, { ...o, map: false, from: side }, `${base}-${side}.png`);
  } else render(land, o, out);
} else {
  fail(fs.readFileSync(new URL(import.meta.url), "utf8").split("\n").filter((l) => l.startsWith("//")).map((l) => l.slice(3)).join("\n"));
}
