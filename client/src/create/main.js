import "../errors/install.js";
import { setReportContext } from "../report/button.js";
import "./create.css";
import * as THREE from "three";
import { alert } from "./alerts.js";
import { strFromU8, strToU8, unzipSync, zip, zipSync } from "fflate";
import { PLATE_PATH, decodePlate } from "../v2/plate.js";
import { PLATTER_PATH } from "../v2/platter.js";
import { SEA_LEVEL_FT, TILE_FT } from "../v2/sizes.js";
import { BIOME_NAMES } from "../v2/biomes.js";
import { waterPath } from "../v2/water.js";
import { mapPinsPath } from "../v2/mapPins.js";
import { spawnsPath } from "../world/paths.js";
import { moveRestAreas, regionsPath } from "../v2/regions.js";
import { roadsPath } from "../v2/roads.js";
import { allEdges, wetIn } from "../v2/roadEdges.js";
import { crossingThings } from "../v2/roadCrossings.js";
import { ContinentFiles } from "./continentFiles.js";
import { BIOMES, biomesPath } from "./biomes.js";
import { Builder } from "./builder.js";
import { Compass } from "./compass.js";
import { EMPTY_FT, FINE, Ground, REACH_FT } from "./ground.js";
import { Renditions } from "./renditions.js";
import { grid } from "./grid.js";
import { planningPath } from "./marks.js";
import { Clutter } from "./clutter.js";
import { clutterMeshes } from "../render/clutterMeshes.js";
import { Falls } from "./falls.js";
import { Scatter } from "./scatter.js";
import { Sea } from "./sea.js";
import { WaterSurfaces } from "./waterSurface.js";
import { Tools } from "./tools.js";
import { Library } from "./library.js";
import { PLACED_PATH, Placed } from "./placed.js";
import { pressesOver } from "./press.js";
import { onSourceSaved } from "./keptSave.js";
import { readLibrary, store, writeLibrary } from "./store.js";
import { LibrarySync } from "../objects/libraryStore.js";
import { Things } from "./things.js";
import { GithubAuthError, GithubClient } from "../github/github.js";
import { openRepoKept } from "./keptOpen.js";
import { BranchMoved, fromRepo, nextVersion, repoChanges, saveRepo } from "./repo.js";
import { CAVES_PATH, Caves } from "./caves.js";
import { Layout, layoutPath } from "./caveLayout.js";
import { Atmosphere } from "./atmosphere.js";
import { DebugPanel } from "./debugPanel.js";
import { InfoBar, feet } from "./infoBar.js";
import { FrameParts, Startup, debugLog, debugging } from "../metrics/timing.js";

// /create: the new editor, so far a builder walking and flying over a version 2 world's ground.
// The world comes from a zip you upload (script/convert-v2.mjs makes one from a v1 world) or a
// GitHub repo (`?from=github/owner/repo`, repo.js), kept in this browser so a reload opens it
// again, with the builder where they were. Opening another replaces it. Downloading it gives a zip of it with the ground as it's been moved. A new world has
// nothing in it: no tiles, all sea.

const $ = (id) => document.getElementById(id);
// The steps of opening the page, shown in the debug pane and, with ?debug=perf, logged.
const startup = new Startup("create");
startup.step("code");
const SAVE_EVERY_MS = 2000;
const SEA_BELOW_FT = 2;
const HUD_EVERY_MS = 250;
const BUILDER_RADIUS_FT = 1; // how much room the builder takes, walking among trees and objects
const STEP_FT = 2.5; // how far up the builder steps onto a slab, or a cave's floor
const HEAD_FT = 6; // how tall the builder is, for cave rock in the way
const MID_FT = 3; // how far up the builder they're in the earth where it's rock

// The world's kept in IndexedDB (store.js): the zip opened last, or the files of the repo's commit
// opened or saved last, with that commit ("source"), and the files changed since, saved a little
// after each change, so a reload opens the world as it was left.
const SAVE_CHANGES_MS = 3000;

// A v2 world's name, its files (path -> bytes) and its first continent's renditions, from the zip's
// bytes or its files, with `changes` (path -> bytes) in place of its own files.
function readWorld(base, changes = new Map()) {
  let files = base instanceof Map ? [...base] : Object.entries(unzipSync(base));
  if (!(base instanceof Map) && !files.some(([path]) => path === "world.json")) {
    const top = files[0][0].split("/")[0];
    files = files.map(([path, b]) => [path.slice(top.length + 1), b]);
  }
  // A change of null is a file taken away.
  files = [...new Map([...files, ...changes])].filter(([, b]) => b);
  const info = JSON.parse(strFromU8(Object.fromEntries(files)["world.json"]));
  if (info.version !== 2) throw new Error(`this is a version ${info.version} world: convert it with script/convert-v2.mjs first`);
  const continent = info.continents[0].key;
  const renditions = new Renditions();
  for (const [path, b] of files) {
    if (PLATTER_PATH.exec(path)?.[1] === continent) renditions.addPlatter(b);
    const plate = PLATE_PATH.exec(path);
    if (plate?.[1] === continent) renditions.addPlate([Number(plate[2]), Number(plate[3])], b);
  }
  // Plate files are read as you come near them, so check one now, to say straight away when
  // they're from an older converter.
  const first = renditions.plateFiles.values().next().value;
  if (!first && renditions.platters.size) throw new Error("this world has no plate files: convert it again with script/convert-v2.mjs");
  try {
    if (first) decodePlate(first);
  } catch (e) {
    throw new Error(`this world's plate files can't be read (${e.message}): convert it again with script/convert-v2.mjs`);
  }
  return { name: info.name, files: new Map(files), continent, renditions };
}

// The world's files with `changes` (path -> bytes, null for gone) in place of its own.
function withChanges(files, changes) {
  const out = new Map(files);
  for (const [path, bytes] of changes) {
    if (bytes) out.set(path, bytes);
    else out.delete(path);
  }
  return out;
}

// Saves the world as a zip, with the files changed since it was opened, `changes`, saved first by
// save(). Files gzipped already are stored as they are, and the rest (text plates and platters
// among them) deflated, zipped off the page's thread.
async function download({ name, files }, changes, save) {
  await save();
  const out = withChanges(files, changes);
  const zipped = await new Promise((resolve, reject) => zip(Object.fromEntries([...out].map(([path, bytes]) => [path, [bytes, { level: bytes[0] === 0x1f && bytes[1] === 0x8b ? 0 : 6 }]])), (error, bytes) => (error ? reject(error) : resolve(bytes))));
  const link = document.createElement("a");
  link.href = URL.createObjectURL(new Blob([zipped], { type: "application/zip" }));
  link.download = `${name.replace(/[^\w-]+/g, "-").toLowerCase() || "world"}.zip`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(link.href), 10000);
}

function start(world, changes, fresh) {
  const { name, continent, renditions } = world;
  // Rest points that hold their own polygon get areas in regions.json, as script/rest-areas.mjs
  // does, kept as changes.
  const converting = new Map(world.files);
  if (moveRestAreas(converting)) {
    for (const [path, bytes] of converting) {
      if (world.files.get(path) === bytes) continue;
      world.files.set(path, bytes);
      changes.set(path, bytes);
    }
  }
  $("open").hidden = true;
  $("worldName").textContent = name;
  const canvas = $("view");
  // A logarithmic depth buffer, so ground miles off doesn't flicker where faces nearly meet.
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, logarithmicDepthBuffer: true });
  // A pixel a CSS pixel, even on high-density screens: the editor needn't be crisp.
  renderer.setPixelRatio(1);
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(60, 1, 0.5, REACH_FT * 4);
  setReportContext(() => ({ world: name, camera: camera.position.toArray().map(Math.round), plates: renditions.decoded.size, reading: renditions.reading.size, unreadable: [...renditions.unreadable] }));
  // The ground draws the water of tiles drawn from renditions, the surfaces that of nearer tiles,
  // and the sea's plane the rest.
  const ground = new Ground(scene, renditions, renderer);
  const surfaces = new WaterSurfaces(scene, renditions, renderer, ground);
  const sea = new Sea(scene, REACH_FT * 6, renditions, surfaces);
  // Trees and objects in the tiles' slots round the builder.
  const scatter = new Scatter(scene, renditions);
  // Reeds, pebbles and the like by the water near the builder.
  const clutter = new Clutter(scene, renditions);
  // Courses' falls near the builder.
  const falls = new Falls(scene, renditions, renderer);
  // The builder stands on the ground, and swims in deep water.
  const groundAt = (x, z) => renditions.heightAt(x, z) ?? EMPTY_FT;
  const waterAt = (x, z) => renditions.waterAt(x, z);
  startup.step("scene");
  // The world's objects and templates, and the objects and slabs placed by hand.
  const library = new Library(world.files, name);
  // What was copied last is kept in this browser for each world, not in its files.
  const clipboardKey = `clipboard:${name}`;
  library.keepClipboard = (template) => store.set(clipboardKey, template).catch(() => {});
  // The library's kept in this browser apart from the rest of the world, where the objects page
  // changes it too (objects/libraryStore.js): a world opened anew puts its library there, and one
  // opened again takes what's there. Changes go there, and come from there.
  const sync = new LibrarySync(
    library,
    () => {
      library.register();
      tools.build.showRecent();
      // What's placed draws as what it is now, and its kind can have gone or come back.
      placed.version++;
      sayMissing();
    },
    { read: readLibrary, write: writeLibrary, channel: "delve3d-create-library" },
  );
  let pushing = null;
  library.onChange = () => {
    pushing ??= Promise.resolve().then(() => {
      pushing = null;
      return sync.push().catch(() => {});
    });
  };
  startup.step("library");
  const placed = new Placed();
  const sayMissing = () => {
    const count = placed.missingCount();
    if (count) alert(`${count} placed object${count === 1 ? " is a kind" : "s are kinds"} this world doesn't have. ${count === 1 ? "It shows" : "They show"} as a pink box and stay${count === 1 ? "s" : ""} in the world until you delete ${count === 1 ? "it" : "them"}.`);
  };
  for (const [path, bytes] of world.files) {
    const match = PLACED_PATH.exec(path);
    if (match?.[1] === continent) placed.load([Number(match[2]), Number(match[3])], bytes);
  }
  // The caves dug by hand: the builder stands on their floors, and the ground at their mouths is
  // theirs to draw.
  const caves = new Caves(scene, renditions);
  for (const [path, bytes] of world.files) {
    const match = CAVES_PATH.exec(path);
    if (match?.[1] === continent) caves.load(bytes, [Number(match[2]), Number(match[3])]);
  }
  // The cave networks laid out, to carve (caveLayout.js).
  const layoutBytes = world.files.get(layoutPath(continent));
  const layout = new Layout(layoutBytes ? JSON.parse(strFromU8(layoutBytes)) : null);
  // Clutter round cave mouths goes by their entrances, and the biome round them.
  caves.entrances = () => [...layout.entrances.values()];
  caves.biomeAt = (x, z) => BIOME_NAMES[renditions.biomes.at(x, z)];
  caves.clutterMeshes = clutterMeshes;
  ground.holes = (tx, tz) => caves.holes(tx, tz);
  // Where caves open through the ground depends on its height, which is finer once a plate's read.
  const groundRead = renditions.onRead;
  renditions.onRead = (key) => {
    groundRead(key);
    caves.groundRead(key);
    debugLog("ground", `plate ${key} read, at ${Math.round(performance.now())} ms; ${renditions.reading.size} reading`);
  };
  caves.onMouths = (plates) => ground.refresh(plates);
  caves.groundMaterial = (tx, tz) => ground.fullMesh(tx, tz)?.material ?? null;
  const things = new Things(scene, placed, (x, z, under) => caves.groundAt(x, z, under), { showMissing: true });
  sayMissing();
  startup.step("placed, caves");
  // Level slabs press the ground down under them (press.js).
  renditions.pressesOver = (tx, tz) => pressesOver(placed.near((tx + 0.5) * TILE_FT, (tz + 0.5) * TILE_FT, TILE_FT).slabs, tx, tz);
  let pressedVersion = placed.version;
  const placeKey = `create:${name}:${continent}`;
  let saved = null;
  try {
    saved = JSON.parse(localStorage.getItem(placeKey));
  } catch {}
  // 1 to 4 show or hide each kind of ground, finest first.
  const KINDS = ["full", "fine", "tile", "plate"];
  window.addEventListener("keydown", (e) => {
    if (e.target.matches?.("input, textarea, select") || e.ctrlKey || e.metaKey || e.altKey || e.repeat) return;
    const kind = KINDS[Number(e.key) - 1];
    if (kind) ground.toggle(kind);
  });
  // The builder stands on slabs as well as the ground, and walls and objects are in their way.
  let builder = null;
  const feetY = () => builder?.state.y ?? saved?.y ?? 0;
  const walkAt = (x, z) => things.standAt(x, z, feetY() + STEP_FT);
  // How steep the face walkAt stands on is: a slab's tops are never too steep to walk.
  const walkSlopeAt = (x, z) => {
    const under = feetY() + STEP_FT;
    return things.standAt(x, z, under) > caves.groundAt(x, z, under) ? 0 : caves.slopeAt(x, z, under);
  };
  // Cave rock's in the way where it's between a step up and the builder's head, going only across
  // or only along where it's in the way of both.
  const rockAt = (x, z, y = feetY()) =>
    [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dz]) => caves.inRock(x + dx * BUILDER_RADIUS_FT, z + dz * BUILDER_RADIUS_FT, y + STEP_FT, y + HEAD_FT));
  const push = (x, z) => {
    const [a, b] = things.pushOut(...scatter.pushOut(x, z, BUILDER_RADIUS_FT), feetY(), BUILDER_RADIUS_FT);
    if (!builder || !rockAt(a, b)) return [a, b];
    const { x: x0, z: z0 } = builder.state;
    return [[a, z0], [x0, b]].find(([u, v]) => !rockAt(u, v)) ?? [x0, z0];
  };
  const clear = (head, at) => caves.clear(head, at);
  let tools = null;
  // They're a ghost in the earth: in rock under the ground, not in a cave's air.
  const ghost = () => {
    const { x, y, z } = builder.state;
    return caves.solid(x, y + MID_FT, z);
  };
  // Flying, cave rock's in the way too, sliding along it where it can, unless they're a ghost,
  // already in it, or soaring up (space double-tapped), which goes on up through it.
  const keep = (was, now, { soaring = false } = {}) => {
    const stuck = (s) => rockAt(s.x, s.z, s.y);
    if (!now.flying || ghost() || !stuck(now) || stuck(was) || (soaring && now.y > was.y)) return now;
    const tries = [{ y: was.y }, { x: was.x, y: was.y }, { z: was.z, y: was.y }, { x: was.x, z: was.z }, { x: was.x, y: was.y, z: was.z }];
    return tries.map((t) => ({ ...now, ...t })).find((s) => !stuck(s)) ?? { ...now, x: was.x, y: was.y, z: was.z };
  };
  const inCave = (p) => p.y < groundAt(p.x, p.z) && caves.near(p.x, p.z) && !caves.solid(p.x, p.y, p.z);
  builder = new Builder({ scene, camera, canvas, groundAt: walkAt, slopeAt: walkSlopeAt, landAt: groundAt, waterAt, at: renditions.middle(), state: saved ?? undefined, push, clear, inCave, keep, ghost });
  tools = new Tools({ scene, camera, canvas, builder, renditions, ground, placed, things, library, caves, layout, inEarth: ghost });
  startup.step("tools");
  const parts = new FrameParts();
  const atmosphere = new Atmosphere({ scene, camera, renditions, groundAt, waterAt, ghost, parts, shown: { ground, caves, sea, falls, things, scatter, clutter, surfaces } });
  const debug = new DebugPanel({ renderer, ground, builder, startup, kinds: KINDS, feet });
  const info = new InfoBar({ tools, builder, renditions });
  // The bottom bar's display toggles.
  $("showGrid").checked = grid.value === 1;
  $("showGrid").addEventListener("change", () => (grid.value = $("showGrid").checked ? 1 : 0));
  // Curtains are a way of showing lines, so only when they're shown.
  const showLines = () => {
    $("showCurtains").disabled = !$("showLines").checked;
    tools.marks.showAs($("showLines").checked, $("showCurtains").checked);
  };
  $("showLines").addEventListener("change", showLines);
  $("showCurtains").addEventListener("change", showLines);
  // Showing biomes outlines their areas and tints the ground but that drawn in full.
  const TINT = BIOME_NAMES.map((name) => new THREE.Color(BIOMES[name]).toArray());
  $("showBiomes").addEventListener("change", () => {
    tools.showBiomes($("showBiomes").checked);
    ground.setTint($("showBiomes").checked ? TINT : null);
  });
  $("showPins").addEventListener("change", () => tools.marks.pins.setShown($("showPins").checked));
  showLines();
  // Let go of the toggle clicked, so keys go back to flying and the tools.
  $("bottom").addEventListener("change", (e) => e.target.blur());
  // What the water file has: the bodies and courses.
  const waterFile = () => ({ version: 1, bodies: tools.water.toJSON().bodies, courses: tools.courses.toJSON().courses, ripple: tools.courses.ripple });
  // What lines the roads, in the placed files, worked out again as they or the water change.
  const lineRoads = () => {
    const roads = tools.roads.toJSON().roads;
    return placed.setRoadThings([...allEdges(roads, wetIn(waterFile())), ...crossingThings(roads, waterFile())]);
  };
  // The continent's own files. Plate files are baked with the biomes, the water and the roads,
  // again where they change.
  const ownFiles = new ContinentFiles(world.files, changes);
  const json = (tool) => ({ toJSON: () => tool.toJSON(), version: () => tool.version });
  ownFiles.add({ path: planningPath(continent), load: (j) => tools.marks.load(j), ...json(tools.marks) }, 0);
  ownFiles.add(
    {
      path: biomesPath(continent),
      load: (j) => tools.biomes.load(j),
      ...json(tools.biomes),
      bake: (opening) => {
        renditions.setBiomes(tools.biomes.toJSON().areas, !opening);
        if (!opening) ground.retint();
      },
      busy: () => tools.biomes.dragging,
    },
    0,
  );
  ownFiles.add(
    {
      path: waterPath(continent),
      load: (j) => [tools.water, tools.courses].forEach((tool) => tool.load(j)),
      toJSON: waterFile,
      version: () => `${tools.water.version},${tools.courses.version}`,
      bake: (opening) => {
        if (opening) return renditions.setWater(waterFile(), false);
        ground.refresh(renditions.setWater(waterFile()));
        lineRoads();
      },
      busy: () => tools.water.dragging || tools.courses.dragging || tools.courses.draft,
    },
    "0,0",
  );
  // A world with no roads gets no roads file, unless it had one.
  ownFiles.add(
    {
      path: roadsPath(continent),
      load: (j) => tools.roads.load(j),
      ...json(tools.roads),
      keep: (had) => had || tools.roads.areas.length > 0,
      bake: (opening) => {
        if (opening) return renditions.setRoads(tools.roads.toJSON(), false);
        ground.refresh(renditions.setRoads(tools.roads.toJSON()));
        lineRoads();
      },
      busy: () => tools.roads.dragging || tools.roads.draft,
    },
    0,
  );
  // A world with no map pins gets no map file, unless it had one.
  ownFiles.add({ path: mapPinsPath(continent), load: (j) => tools.pinStore.load(j), ...json(tools.pinStore), keep: (had) => had || tools.pinStore.pins.length > 0 }, 0);
  // The continent's areas, which rest points point at. A world with none gets no regions file,
  // unless it had one.
  ownFiles.add({ path: regionsPath(continent), load: (j) => tools.areas.load(j), ...json(tools.areas), keep: (had) => had || tools.areas.areas.length > 0 }, 0);
  // Mobs placed by hand, in spawns.json beside the regions and NPCs. A world with none gets no
  // spawns file, unless it had one.
  ownFiles.add({ path: spawnsPath(continent), load: (j) => tools.units.loadSpawns(j), toJSON: () => tools.units.spawnsJSON(), version: () => tools.units.mobVersion, keep: (had) => had || tools.units.mobs().length > 0 }, 0);
  ownFiles.add({ path: layoutPath(continent), ...json(layout), keep: (had) => had || layout.networks.size > 0 || layout.carved.size > 0 }, layout.dropped ? -1 : layout.version);
  lineRoads();
  startup.step("files");

  const resize = () => {
    const { clientWidth: w, clientHeight: h } = canvas;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  };
  new ResizeObserver(resize).observe(canvas);
  resize();

  let last = null;
  const FPS = 30;
  let lastSave = 0;
  let lastHud = 0;
  let [saving, lastChangeSave] = [null, 0];
  const unsaved = () => renditions.unsaved.size || placed.changed.size || library.dirty.size || caves.changed.size || ownFiles.unsaved();
  // Saves what's changed into `changes`, writing files on the worker: once what's being saved is,
  // where something is.
  let dropped = false; // its changes are being thrown away, so it keeps no more
  const save = async () => {
    while (saving) await saving;
    if (dropped || !unsaved()) return;
    saving = renditions
      .unsavedFiles(continent)
      .then(async (files) => {
        for (const [path, bytes] of [...files, ...placed.unsavedFiles(continent), ...caves.unsavedFiles(continent), ...library.unsavedFiles()]) changes.set(path, bytes);
        const written = ownFiles.write();
        await store.set("changes", changes);
        written();
      })
      .catch((e) => console.error("couldn't save the changes", e))
      .finally(() => {
        saving = null;
        lastChangeSave = performance.now();
      });
    await saving;
  };
  const downloadButton = $("downloadWorld");
  downloadButton.addEventListener("click", async () => {
    if (downloadButton.disabled) return;
    [downloadButton.disabled, downloadButton.textContent] = [true, "downloading…"];
    try {
      await download(world, changes, save);
    } catch (e) {
      console.error("couldn't download the world", e);
    } finally {
      [downloadButton.disabled, downloadButton.textContent] = [false, "download world"];
    }
  });
  repoTools(world, changes, save, async () => {
    dropped = true;
    while (saving) await saving;
  });
  const compass = new Compass($("stage"), document.querySelector(".create-bar"));
  const toward = (ft, ahead, back) => `${feet(Math.abs(ft))} ${ft < 0 ? back : ahead}`;
  // The spawn point, kept in world.json: where characters new to the world start.
  const worldInfo = () => JSON.parse(strFromU8(changes.get("world.json") ?? world.files.get("world.json")));
  tools.spawnPins = () => {
    const { spawn } = worldInfo();
    return spawn ? [{ label: "Spawn", x: spawn.at[0], z: spawn.at[1] }] : [];
  };
  const showSpawn = () => {
    const { spawn } = worldInfo();
    $("spawnAt").textContent = spawn ? `${toward(spawn.at[0], "east", "west")}, ${toward(spawn.at[1], "south", "north")}` : "none yet: the game won't take the world without one";
    $("spawnGo").disabled = !spawn;
  };
  // Training dummies, kept in world.json too: the game server puts them up to hit. Both are set
  // with the units and planning tools (units.js).
  const showDummies = () => {
    const count = (list, one, many) => {
      const here = (list ?? []).filter((d) => d.continent === continent).length;
      return `${here || "no"} ${here === 1 ? one : many} on this continent`;
    };
    $("dummyCount").textContent = count(worldInfo().dummies, "dummy", "dummies");
    $("restCount").textContent = count(worldInfo().restPoints, "rest point", "rest points");
  };
  let restAreaIds = new Set((worldInfo().restPoints ?? []).filter((r) => r.continent === continent && r.area).map((r) => r.area));
  const keepUnits = async ({ spawn, dummies, restPoints }) => {
    const info = worldInfo();
    if (spawn) info.spawn = spawn;
    info.dummies = dummies;
    if (!dummies.length) delete info.dummies;
    info.restPoints = restPoints;
    if (!restPoints.length) delete info.restPoints;
    // An area a rest point stops pointing at, when it's taken away or given another, goes too.
    const pointed = new Set(restPoints.filter((r) => r.continent === continent && r.area).map((r) => r.area));
    for (const id of restAreaIds) {
      const area = !pointed.has(id) && tools.areas.byId(id);
      if (area) tools.areas.removeArea(area);
    }
    restAreaIds = pointed;
    tools.areas.recolor();
    changes.set("world.json", strToU8(`${JSON.stringify(info, null, 2)}\n`));
    await store.set("changes", changes).catch(() => {});
    showSpawn();
    showDummies();
  };
  // A rest point picked with select can be named.
  const restName = $("restName");
  // The world's creatures, which the mob tool places, and its settings or a picked mob's.
  const creatures = [...world.files]
    .filter(([path]) => /^creatures\/[^/]+\.json$/.test(path))
    .flatMap(([path, bytes]) => {
      try {
        return [JSON.parse(strFromU8(bytes))];
      } catch {
        console.warn(`skipping ${path}: it isn't JSON`);
        return [];
      }
    })
    .filter((c) => c?.id)
    .sort((a, b) => (a.name ?? a.id).localeCompare(b.name ?? b.id));
  tools.units.setCreatures(creatures);
  const mobInputs = { creature: $("mobCreature"), min: $("mobLevelMin"), max: $("mobLevelMax"), respawn: $("mobRespawn"), yaw: $("mobYaw"), wander: $("mobWander") };
  const creatureOptions = () => creatures.map((c) => new Option(`${c.name ?? c.id} (${c.id})`, c.id));
  const showMob = (picked) => {
    const mob = tools.units.isMob(picked) ? picked : tools.units.tool === "mob" ? tools.units.mobSettings : null;
    $("mobFields").hidden = !mob;
    if (!mob) return;
    $("mobNone").hidden = creatures.length > 0;
    mobInputs.creature.replaceChildren(...creatureOptions());
    if (mob.creature && !creatures.some((c) => c.id === mob.creature)) mobInputs.creature.append(new Option(`${mob.creature} (not in this world)`, mob.creature));
    mobInputs.creature.value = mob.creature ?? "";
    const [min, max] = Array.isArray(mob.levels) ? mob.levels : [mob.levels ?? 1, mob.levels ?? 1];
    mobInputs.min.value = min;
    mobInputs.max.value = max;
    mobInputs.respawn.value = mob.respawn ?? "";
    mobInputs.yaw.value = mob.yaw ?? 0;
    mobInputs.wander.value = mob.wander ?? "";
  };
  const readMob = () => {
    const number = (input, fallback) => (input.value === "" || !Number.isFinite(Number(input.value)) ? fallback : Number(input.value));
    const min = Math.max(1, Math.round(number(mobInputs.min, 1)));
    const max = Math.max(min, Math.round(number(mobInputs.max, min)));
    const wander = number(mobInputs.wander, null);
    return {
      creature: mobInputs.creature.value || null,
      levels: min === max ? min : [min, max],
      respawn: Math.max(1, number(mobInputs.respawn, 300)),
      yaw: ((number(mobInputs.yaw, 0) % 360) + 360) % 360,
      wander: wander === null ? null : Math.max(0, wander),
    };
  };
  for (const input of Object.values(mobInputs)) input.addEventListener("change", () => tools.units.setMob(readMob()));
  const showMobCount = () => {
    const here = tools.units.mobs().length;
    $("mobCount").textContent = `${here || "no"} ${here === 1 ? "mob" : "mobs"} placed on this continent`;
  };
  tools.units.onMobs = showMobCount;
  tools.units.onPick = (picked) => {
    const named = picked?.id && !tools.units.isMob(picked);
    restName.hidden = !named;
    if (named) restName.querySelector("input").value = picked.name ?? "";
    showMob(picked);
  };
  showMobCount();
  restName.querySelector("input").addEventListener("input", (e) => tools.units.rename(e.target.value.trim()));
  tools.units.load({ continent, spawn: worldInfo().spawn, dummies: worldInfo().dummies, restPoints: worldInfo().restPoints });
  tools.units.onChange = keepUnits;
  // The resting area tool gives a rest point the area it draws, and a rest point whose area is
  // taken away has none.
  tools.areas.recolor();
  tools.areas.onRest = (rest, id) => (rest.area = id);
  tools.areas.onChange = () => {
    for (const rest of tools.units.here(tools.units.restPoints)) if (rest.area && !tools.areas.byId(rest.area)) delete rest.area;
    tools.units.changed();
  };
  showSpawn();
  showDummies();
  $("spawnGo").addEventListener("click", () => {
    const [x, z] = worldInfo().spawn.at;
    builder.state = { ...builder.state, x, z, y: walkAt(x, z), flying: false, falling: 0 };
  });
  let problem = null; // why the ground couldn't be drawn, shown in the HUD
  const timed = (part, fn) => parts.time(part, fn);
  // A frame slower than this is logged with ?debug=perf, with what it spent its time on.
  const SLOW_FRAME_MS = 100;
  let groundWanted = false;
  // A handle for measuring from the browser's console or a script; paused stops the frames.
  store
    .get(clipboardKey)
    .then((template) => template && !library.clipboard && tools.build.setClipboard(template, false))
    .catch(() => {});
  (fresh ? sync.replace(library) : sync.pull().then((changed) => changed && (library.register(), tools.build.showRecent()))).catch(() => {});
  window.create = { placed, things, library, caves, ground, scatter, clutter, falls, surfaces, builder, tools, renderer, scene, camera, paused: false };
  const frame = (now) => {
    if (window.create.paused) return requestAnimationFrame(frame);
    // At most FPS frames a second, with a little slack so a 60 Hz screen draws every other frame.
    if (last !== null && now - last < 1000 / FPS - 2) return requestAnimationFrame(frame);
    const dt = last === null ? 0 : Math.min(0.05, (now - last) / 1000);
    const gap = last === null ? 0 : now - last;
    last = now;
    const began = performance.now();
    timed("move", () => builder.tick(dt));
    timed("tools", () => tools.tick(dt));
    const { x, y, z } = builder.state;
    timed("ground", () => {
      try {
        ground.update(x, y, z);
        problem = null;
      } catch (e) {
        problem = e.message;
        console.error(e);
      }
    });
    sea.tick(x, SEA_LEVEL_FT - SEA_BELOW_FT, z);
    timed("scatter", () => scatter.tick(dt, x, z, ground.finest <= FINE));
    timed("clutter", () => clutter.tick(dt, x, z, ground.finest <= FINE));
    timed("falls", () => falls.tick(dt, x, z));
    if (placed.version !== pressedVersion) {
      pressedVersion = placed.version;
      timed("ground", () => ground.refresh(renditions.repress()));
    }
    timed("things", () => things.tick(x, z));
    timed("caves", () => caves.tick(x, z));
    timed("water", () => surfaces.tick(dt, x, z, ground.finest <= FINE));
    atmosphere.tick(now, x, z);
    compass.tick(camera);
    timed("render", () => renderer.render(scene, camera));
    // The ground under units moves as it's shaped and as it's read in.
    if (timed("info", () => info.tick(now))) tools.units.restand();
    if (now - lastHud > HUD_EVERY_MS) {
      $("hud").classList.toggle("problem", Boolean(problem));
      $("hud").textContent = problem ? `can't draw the ground: ${problem}` : "";
    }
    timed("files", () => ownFiles.bake());
    // Saves what's changed once there's been time to finish the stroke.
    if (!saving && !tools.busy() && now - lastChangeSave > SAVE_CHANGES_MS && unsaved()) save();
    if (now - lastSave > SAVE_EVERY_MS) {
      try {
        localStorage.setItem(placeKey, JSON.stringify(builder.state));
      } catch {}
      lastSave = now;
    }
    const times = parts.frame(gap);
    const took = performance.now() - began;
    if (took > SLOW_FRAME_MS && debugging("perf")) {
      const spent = Object.entries(times).filter(([, ms]) => ms >= 1).sort((a, b) => b[1] - a[1]);
      debugLog("perf", `a slow frame, ${Math.round(took)} ms: ${spent.map(([name, ms]) => `${name} ${Math.round(ms)}`).join(", ")}`);
    }
    startup.once("first frame");
    // The ground's drawn once the plates it wanted at first are read and built.
    const busy = ground.pending.length || renditions.reading.size;
    if (busy) groundWanted = true;
    else if (groundWanted) startup.once("ground drawn");
    if (now - lastHud > HUD_EVERY_MS) {
      debug.show(parts.take(), now - lastHud);
      lastHud = now;
    }
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
}

async function open(base, changes = new Map(), fresh = false) {
  try {
    const world = readWorld(base, changes);
    startup.step("world read");
    start(world, changes, fresh);
    showing = true;
    return true;
  } catch (e) {
    $("openError").textContent = e.message;
    return false;
  }
}

// GitHub, in the manage tools: the repo the world came from, saving to it as one commit, and
// publishing that commit as the next version.
function repoTools(world, changes, save, stopKeeping) {
  const status = (text) => ($("repoStatus").textContent = text);
  $("repoDrop").textContent = source ? "drop local changes and reload" : "drop local changes";
  $("repoDrop").addEventListener("click", async () => {
    const what = source ? `reload ${source.repo} from GitHub` : "go back to the world as you uploaded it";
    if (!window.confirm(`Drop every change you haven't saved, and ${what}? This can't be undone.`)) return;
    await stopKeeping();
    await store.delete("changes");
    await store.set("fresh", true);
    // Its address opens the head of the repo, downloading only what's changed.
    if (source) window.location.search = `?from=github/${source.repo}`;
    else window.location.reload();
  });
  const buttons = [$("repoSave"), $("repoPublish")];
  let busy = false;
  const show = () => {
    $("repoSource").textContent = source ? `${source.repo}, ${source.branch} at ${source.commitSha?.slice(0, 7) ?? "no commits yet"}` : "not kept in a repo";
    for (const button of buttons) button.disabled = busy || !source;
  };
  show();
  // Another page saved its files to the repo, so what it committed is the world's source now.
  onSourceSaved((saved) => {
    if (saved) source = saved;
    show();
  });
  const run = async (doing, act) => {
    if (busy || !source) return;
    busy = true;
    show();
    try {
      await save();
      await act(new GithubClient(source.repo));
    } catch (e) {
      console.error(`couldn't ${doing}`, e);
      if (e instanceof BranchMoved) status(`${e.message}: download the world to keep your changes, then open the repo again.`);
      else if (e instanceof GithubAuthError) status("Connect GitHub first, from your worlds page.");
      else status(`Couldn't ${doing}: ${e.message}`);
    } finally {
      busy = false;
      show();
    }
  };
  $("repoSave").addEventListener("click", () =>
    run("save", async (client) => {
      const files = withChanges(world.files, changes);
      const message = $("repoMessage").value.trim() || "Save from /create";
      const next = await saveRepo(client, files, source, { message, log: status, onProgress: ({ done, total }) => status(`Sending ${done} of ${total} files…`) });
      if (!next) return status("Nothing's changed since the last save.");
      // What was committed is the world's files now; what changed meanwhile stays a change.
      for (const [path, bytes] of [...changes]) if (bytes === null ? !files.has(path) : files.get(path) === bytes) changes.delete(path);
      for (const path of [...world.files.keys()]) if (!files.has(path)) world.files.delete(path);
      for (const [path, bytes] of files) world.files.set(path, bytes);
      source = next;
      await store.set("world", files);
      await store.set("changes", changes);
      await store.set("source", source);
      $("repoMessage").value = "";
      status(`Saved ${next.commitSha.slice(0, 7)}.`);
    }),
  );
  $("repoPublish").addEventListener("click", () =>
    run("publish", async (client) => {
      if (!source.commitSha || Object.keys((await repoChanges(withChanges(world.files, changes), source)).changes).length) return status("Save to GitHub first: publishing tags the saved commit.");
      const tags = await client.tags();
      const already = tags.find((tag) => tag.sha === source.commitSha);
      if (already) return status(`${source.commitSha.slice(0, 7)} is published already, as ${already.name}.`);
      const name = nextVersion(tags);
      if (!window.confirm(`Publish ${source.commitSha.slice(0, 7)} as ${name}?`)) return;
      await client.createTag(name, source.commitSha);
      status(`Published ${name}.`);
    }),
  );
}

// Opening a repo, from the manage tools or the open screen, goes to its address, which opens it.
for (const form of [$("repoOpen"), $("openRepo")]) {
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const repo = form.querySelector("input").value.trim().replace(/^https:\/\/github\.com\//, "").replace(/\.git$|\/$/g, "");
    if (fromRepo(`github/${repo}`)) window.location.search = `?from=github/${repo}`;
    else $(form.id === "openRepo" ? "openError" : "repoStatus").textContent = "Give the repo as owner/name.";
  });
}

// The files at the head of `repo`, kept in place of the world kept here, or null when that's the
// one to open: it's that commit already, or you'd rather keep its changes. Throws when it can't.
async function openRepo(repo) {
  $("open").hidden = false;
  $("openError").textContent = `Opening ${repo}…`;
  const loaded = await openRepoKept(repo, {
    confirm: (message) => window.confirm(message),
    onProgress: ({ done, total }) => ($("openError").textContent = `Downloading ${done} of ${total} files…`),
  });
  if (!loaded) return null;
  source = loaded.source;
  return loaded.files;
}

// A world opened while another's showing replaces it: kept, then the page loads again with it,
// at /create alone, not a repo's address.
let showing = false;
const openKept = () => window.location.assign(window.location.pathname);
$("openFile").addEventListener("change", async () => {
  const file = $("openFile").files[0];
  if (!file) return;
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (showing || source) {
    if (!window.confirm(`Open ${file.name}? It replaces the world kept in this browser, which is lost unless you've downloaded or saved it.`)) return;
    try {
      readWorld(bytes);
    } catch (e) {
      $("openError").textContent = e.message;
      return;
    }
    await keepNew(bytes, true);
    openKept();
    return;
  }
  if (await open(bytes, new Map(), true)) await keepNew(bytes);
});
// Starts an empty world in place of the one showing, after asking, since that's lost unless it's
// been downloaded or saved.
$("newWorld").addEventListener("click", async () => {
  if (showing && !window.confirm("Start a new, empty world? This one's lost unless you've downloaded or saved it.")) return;
  const info = { version: 2, name: "New world", continents: [{ key: "main", name: "Main" }], dungeons: [] };
  const bytes = zipSync({ "world.json": strToU8(`${JSON.stringify(info, null, 2)}\n`) });
  try {
    localStorage.removeItem(`create:${info.name}:main`);
  } catch {}
  if (showing) {
    await keepNew(bytes, true);
    openKept();
  } else if (await open(bytes, new Map(), true)) await keepNew(bytes);
});
$("openWorld").addEventListener("click", () => {
  $("openError").textContent = "";
  $("openFile").value = "";
  $("openFile").click();
});

// Keeps a world just opened or made, in place of the one kept: a zip's bytes, or a repo's files
// with their source. `fresh` is for opening it on the reload to come.
async function keepNew(base, fresh = false, from = null) {
  await store.set("world", base).catch(() => {});
  await store.delete("changes");
  if (from) await store.set("source", from).catch(() => {});
  else await store.delete("source");
  if (fresh) await store.set("fresh", true).catch(() => {});
}

const kept = await store.get("world").catch(() => null);
const changes = await store.get("changes").catch(() => null);
let source = await store.get("source").catch(() => null);
const fresh = !!(await store.get("fresh").catch(() => null));
await store.delete("fresh");
const repo = fromRepo(new URLSearchParams(window.location.search).get("from"));
let [opened, failed] = [null, false];
try {
  opened = repo && (await openRepo(repo));
  $("openError").textContent = "";
} catch (e) {
  failed = true;
  console.error(`couldn't open ${repo}`, e);
  $("openError").textContent = e instanceof GithubAuthError ? "Connect GitHub first, from your worlds page." : `Couldn't open ${repo}: ${e.message}`;
  $("openKept").hidden = !kept;
}
startup.step(repo ? "repo opened" : "kept world");
if (opened) await open(opened, new Map(), true);
else if (!failed && (!kept || !(await open(kept, changes ?? new Map(), fresh)))) $("open").hidden = false;
