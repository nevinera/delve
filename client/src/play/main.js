import "../errors/install.js";
import { setReportContext } from "../report/button.js";
import "./play.css";
import { graphicsPanel } from "../render/graphicsPanel.js";
import { setWorldIcons } from "./icons.js";
import { setWorldEffectSheets } from "../abilities/effectTextures.js";
import { SightLines } from "./sightLines.js";
import { Waiting } from "./waiting.js";
import { RestPoints } from "./restPoints.js";
import { Leaving } from "./leaving.js";
import { offerSideways, turnSideways } from "./orientation.js";
import { builtObjects, images } from "../objects/collections.js";
import { prepareAnimations } from "../character/animations.js";
import { resolveRecipe } from "../character/recipe.js";
import { Caves } from "../create/caves.js";
import { Renditions } from "../create/renditions.js";
import { Placed } from "../create/placed.js";
import { PLATE_FT, PLATTER_FT } from "../v2/sizes.js";
import { setBuiltObjects } from "../world/objects.js";
import { classChoices, showClassPicker } from "./classPicker.js";
import { PlayCombat } from "./combat.js";
import { GameConnection } from "./game.js";
import { PlayWorld } from "./loader.js";
import { Others } from "./others.js";
import { TouchControls, isTouch } from "./touch.js";
import { PlayView } from "./view.js";
import { UnitStatuses } from "./unitStatuses.js";
import { metrics } from "../metrics/metrics.js";
import { Startup } from "../metrics/timing.js";
import { debugCommand } from "./debugCommand.js";

// The play page: your character in a released version 2 world, where the game server puts it. The
// world comes from raw GitHub at the released commit: its continent's platters first, and plate,
// placed and caves files as you come near them. Others near you come and go as the game server says.

const $ = (id) => document.getElementById(id);
const config = JSON.parse($("playConfig").textContent); // { repo, sha, paths, look, game: { url, token } }
const status = (text) => ($("playStatus").textContent = text);
const STREAM_MS = 1000; // how often to look for placed files coming into reach
const PLACED_FT = 2 * PLATE_FT; // how near a plate's placed file is fetched
const WATCH_MS = 30_000; // how long after you're in watchSettling waits for the land to settle
const READ_NOW_FT = PLATE_FT; // how near a platter is read before you're in; the rest wait for idle time
// Lighter graphics for phones: no extra pixel density, 30 frames a second to save the battery, less
// ground clutter, and simple tree crowns.
const PHONE_GRAPHICS = { resolution: 1, maxFps: 30, clutterRadiusFt: 120, clutterDensity: 0.5, solidCanopies: true };

// Enters the game server, and resolves with the welcome: where it puts you. A character new to the
// world chooses a class first, if the server asks it to.
function enter(on, loader) {
  return new Promise((resolve, reject) => {
    let welcomed = false;
    const connection = new GameConnection(config.game, {
      ...on,
      pickClass: async ({ classes }) => {
        connection.waitToPick();
        const choices = await classChoices(classes, (path) => loader.file(path));
        status("");
        showClassPicker($("playClasses"), choices, (id) => {
          status("Entering...");
          connection.pick(id);
        });
      },
      welcome: (message) => ((welcomed = true), resolve({ connection, you: message.you })),
      error: (message) => (welcomed ? status(message.message) : reject(new Error(message.message))),
      closed: () => (welcomed ? on.closed() : reject(new Error("the game server isn't answering"))),
    });
  });
}

// The menu: its buttons open pages in its place, and each page's back button returns.
// A phone turns sideways for play, where it can.
if (isTouch()) {
  turnSideways();
  offerSideways($("playSideways"));
}
const menu = $("playMenu");
const main = menu.querySelector(".play-menu-main");
const showPage = (page) => {
  for (const el of menu.querySelectorAll(".play-menu-page")) el.hidden = el !== page;
  main.hidden = Boolean(page);
};
for (const button of menu.querySelectorAll("[data-open]")) button.addEventListener("click", () => showPage($(button.dataset.open)));
menu.querySelector("[data-build]").addEventListener("click", () => {
  menu.hidePopover();
  window.play?.combat?.openBuild();
});
for (const button of menu.querySelectorAll("[data-back]")) button.addEventListener("click", () => showPage(null));
menu.addEventListener("toggle", (e) => {
  if (e.newState === "closed") showPage(null);
  window.play?.combat?.menuSound(e.newState === "closed" ? "ui-close" : "ui-open");
});
menu.querySelector('[data-open="playGraphics"]').disabled = true; // until there's a view

// Reads the platters play held back, one at a time when the page has nothing else to do.
// Shows frames a second in the corner, from when there's a view.
function showFps(view) {
  const label = $("playFps");
  setInterval(() => {
    const fps = view.fps();
    label.textContent = fps === null ? "" : `${Math.round(fps)} fps`;
  }, 500);
}

// Records how long after you're in the land's done being built (play.load.after.built) and moving
// is smooth (play.load.after.smooth). Where one isn't by WATCH_MS, plates_left and fps say how far
// off it was.
function watchSettling(view, tags) {
  const start = performance.now();
  const first = {};
  const timer = setInterval(() => {
    const ms = performance.now() - start;
    if (view.built()) first.built ??= ms;
    if (view.smooth()) first.smooth ??= ms;
    if ((first.built !== undefined && first.smooth !== undefined) || ms >= WATCH_MS) {
      clearInterval(timer);
      for (const [part, at] of Object.entries(first)) metrics().timing(`play.load.after.${part}`, at, tags);
      if (first.built === undefined) metrics().gauge("play.load.after.plates_left", view.ground.pending.length, tags);
      if (first.smooth === undefined) metrics().gauge("play.load.after.fps", view.fps() ?? 0, tags);
    }
  }, 100);
}

function readHeldPlatters(renditions) {
  const later = globalThis.requestIdleCallback ?? ((then) => setTimeout(then, 50));
  const next = () => renditions.readHeld() && later(next);
  later(next);
}

async function play() {
  const loader = new PlayWorld(config);
  // How long each step of loading takes, as play.load.<step>, each from where the last ended, so
  // together they add up to play.load.total. "enter" includes picking a class.
  const tags = { repo: config.repo };
  const nav = performance.getEntriesByType?.("navigation")[0];
  if (nav) metrics().timing("play.load.page", nav.responseEnd, tags); // asking for the page until it's here
  // The steps go on the browser's performance timeline too, and with ?debug=perf, in the console.
  const startup = new Startup("play");
  const { at: codeAt } = startup.step("code");
  metrics().timing("play.load.code", codeAt - (nav?.responseEnd ?? 0), tags); // until this code runs
  const mark = (name) => metrics().timing(`play.load.${name}`, startup.step(name).ms, tags);
  const step = async (name, promise) => {
    const result = await promise;
    mark(name);
    return result;
  };
  status("Loading the world...");
  await step("open", loader.open());
  setBuiltObjects(builtObjects(loader), images(loader));
  setWorldIcons(loader.files);
  setWorldEffectSheets(loader.files);

  let others = null;
  let transformed = false;
  let combat = null;
  let sightLines = null;
  // What the server says before the parts it's for are ready. Combat news before you're in the
  // world isn't yours to see, as it's about others, but your build, bars, cooldowns and the areas
  // on the ground are.
  const forCombat = new Waiting();
  const fight = (method) => forCombat.to(method, "none");
  const forOthers = new Waiting();
  const tell = (method, arg) => forOthers.send(method, arg);
  const forRestPoints = new Waiting();
  let restPoints = null;
  let leaving = null;
  const unitStatuses = new UnitStatuses();
  const appear = (character) => {
    unitStatuses.seen(character);
    tell("appear", character);
  };
  status("Entering...");
  const { connection, you } = await step("enter", enter({
    snapshot: ({ characters }) => characters.forEach(appear),
    appear: ({ character }) => appear(character),
    vanish: ({ id }) => {
      unitStatuses.vanish(id);
      tell("vanish", id);
    },
    statusOn: (message) => unitStatuses.on(message),
    absorb: (message) => unitStatuses.absorb(message),
    moved: (message) => tell("moved", message),
    look: (message) => {
      if (message.id !== you.id) return tell("look", message);
      transformed = Boolean(message.look);
      if (others) others.view.walker?.setLook(resolveRecipe(message.look ?? you.look));
    },
    gear: (message) => {
      if (message.id !== you.id) return tell("gear", message);
      you.look = message.look;
      if (others && !transformed) others.view.walker?.setLook(resolveRecipe(you.look));
    },
    forced: (message) => (message.id === you.id ? connection.forced(message) : tell("forced", message)),
    used: fight("used"),
    stopped: fight("stopped"),
    refused: fight("refused"),
    cooldown: forCombat.to("cooldown"),
    loggingOff: (message) => leaving?.started(message),
    logOffStopped: (message) => {
      leaving?.stopped();
      status(`You stopped logging off: ${message.why}.`);
      setTimeout(() => status(""), 3000);
    },
    loggedOff: () => leaving?.done(),
    lockout: fight("lockout"),
    hit: fight("hit"),
    resources: fight("resources_"),
    health: fight("health_"),
    level: fight("level_"),
    log: fight("logged"),
    speed: fight("speed_"),
    controls: fight("controls_"),
    area: forCombat.to("area_"),
    areaGone: forCombat.to("areaGone_"),
    targetable: (message) => {
      unitStatuses.targetable(message);
      combat?.targetable_(message);
    },
    build: forCombat.to("build_", "last"),
    bars: forCombat.to("bars_", "last"),
    statusChanged: (message) => {
      unitStatuses.changed(message);
      combat?.statusChanged_(message);
    },
    statusGone: (message) => {
      unitStatuses.gone(message);
      combat?.statusGone_(message);
    },
    restPoints: forRestPoints.to("set", "last"),
    home: (message) => restPoints?.home_(message),
    swung: fight("swung"),
    sees: (message) => sightLines?.answer(message),
    attacking: fight("attacking_"),
    // Another continent's land isn't loaded, so the page comes back up there.
    teleport: (message) => (message.continent === you.continent ? connection.correct(message) : window.location.reload()),
    closed: () => {
      status("You've left the game. Reload the page to enter again.");
      others?.clear();
    },
  }, loader));
  leaving = new Leaving({ connection, panel: $("playLeaving"), button: menu.querySelector("[data-log-off]") });

  status("Loading the land around you...");
  let showGraphics = null;
  const view = new PlayView($("scene"), { onGraphics: (graphics) => showGraphics?.(graphics) });
  const touch = isTouch();
  showFps(view);
  // Before the first frame, so the land isn't built twice.
  if (touch) view.setGraphics(PHONE_GRAPHICS);
  mark("view");
  setReportContext(() => ({ camera: view.camera.position.toArray().map(Math.round), plates: renditions.decoded.size, unreadable: [...renditions.unreadable] }));
  const continent = await step("continent", loader.continent(you.continent));
  const renditions = new Renditions();
  for (const [coords, bytes] of continent.platters) {
    const near = coords.map((c, i) => Math.max(c * PLATTER_FT, Math.min(you.at[i * 2], (c + 1) * PLATTER_FT)) - you.at[i * 2]);
    if (Math.hypot(...near) <= READ_NOW_FT) renditions.addPlatter(bytes);
    else renditions.holdPlatter(coords, bytes);
  }
  renditions.setBiomes(continent.biomes?.areas ?? [], false);
  renditions.setWater(continent.water ?? { bodies: [], courses: [] }, false);
  renditions.setRoads(continent.roads ?? { roads: [] }, false);
  renditions.fetchPlate = (coords) => loader.plate(you.continent, coords);
  mark("platters");
  // Placed and caves files for the plates near you, once each.
  const placed = new Placed();
  const caves = new Caves(view.scene, renditions);
  const fetched = new Set();
  const placedNear = (x, z) =>
    Promise.all(
      loader
        .plates(you.continent)
        .filter(([px, pz]) => !fetched.has(`${px},${pz}`) && Math.hypot(x - Math.max(px * PLATE_FT, Math.min(x, (px + 1) * PLATE_FT)), z - Math.max(pz * PLATE_FT, Math.min(z, (pz + 1) * PLATE_FT))) <= PLACED_FT)
        .map(async (coords) => {
          fetched.add(coords.join(","));
          const [bytes, caveBytes] = await Promise.all([loader.placed(you.continent, coords), loader.caves(you.continent, coords)]).catch((err) => (fetched.delete(coords.join(",")), Promise.reject(err)));
          if (bytes) placed.load(coords, bytes);
          if (caveBytes) caves.load(caveBytes, coords);
        }),
    );
  await step("placed", placedNear(you.at[0], you.at[2]));

  view.show(renditions, placed, caves, continent.caveLayout);
  mark("show");
  // Within ground: fetching and reading your plate's file, and drawing while that happens.
  const ground = await step("ground", view.ready([you.at[0], you.at[2]]));
  for (const [part, ms] of Object.entries(ground)) {
    if (part === "frames") metrics().count("play.load.ground.frames", ms, tags);
    else metrics().timing(`play.load.ground.${part.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`)}`, ms, tags);
  }
  await step("animations", prepareAnimations().catch((err) => console.warn(`Couldn't load animations: ${err.message}`)));
  // Players get the settings that trade looks for speed, not the editor's switch for each part.
  showGraphics = graphicsPanel(menu.querySelector(".play-graphics"), view, {
    check: "play-check",
    range: "play-range",
    parts: { "far ring": "distant land" },
    solid: "simple tree crowns",
  });
  menu.querySelector('[data-open="playGraphics"]').disabled = false;
  others = new Others(view);
  forOthers.arrive(others);
  sightLines = new SightLines(view, others, connection);
  restPoints = new RestPoints(view, connection);
  forRestPoints.arrive(restPoints);
  sightLines.addOption(menu.querySelector(".play-graphics"));
  view.onWalkFrame = (dt) => {
    others.frame(dt);
    combat?.frame(dt);
    sightLines.frame(dt);
    restPoints.frame();
  };
  view.onWalkPlaced = () => combat?.placed();
  const paused = () => ($("playPaused").hidden = false);
  view.startWalk(paused, [you.at[0], you.at[2]], resolveRecipe(you.look));
  view.walker.yaw = you.yaw;
  connection.report(view);
  unitStatuses.seen(you);
  combat = new PlayCombat({ view, others, connection, loader, you, hud: $("playCombat"), unitStatuses, commands: { debug: (args) => debugCommand(args, view) } });
  forCombat.arrive(combat);
  // A handle for scripts and the browser's console.
  window.play = { view, connection, others, combat, renditions, placed, caves, sightLines, restPoints };
  // From when the page was asked for, so it includes fetching the page and its code.
  metrics().timing("play.load.total", performance.now(), tags);
  status("");
  $("playLoading").hidden = true;
  readHeldPlatters(renditions);
  watchSettling(view, tags);
  if (touch) new TouchControls(view, document.body);
  $("playResume").addEventListener("click", () => {
    $("playPaused").hidden = true;
    view.startWalk(paused, [view.walker.pos.x, view.walker.pos.z]);
  });

  // Placed and caves files come in as you get near their plates; plate files as the ground wants
  // them.
  let fetching = false;
  setInterval(async () => {
    if (fetching || !view.walker?.pos) return;
    fetching = true;
    try {
      await placedNear(view.walker.pos.x, view.walker.pos.z);
    } catch (err) {
      status(`Couldn't load what's built or dug nearby: ${err.message}`);
    } finally {
      fetching = false;
    }
  }, STREAM_MS);
}

play().catch((err) => {
  $("playClasses").hidden = true;
  status(`Couldn't enter the world: ${err.message}`);
});
