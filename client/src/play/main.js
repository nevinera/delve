import "../errors/install.js";
import { setReportContext } from "../report/button.js";
import "./play.css";
import { graphicsPanel } from "../render/graphicsPanel.js";
import { setWorldIcons } from "./icons.js";
import { setWorldEffectSheets } from "../abilities/effectTextures.js";
import { SightLines } from "./sightLines.js";
import { RestPoints } from "./restPoints.js";
import { Leaving } from "./leaving.js";
import { offerSideways, turnSideways } from "./orientation.js";
import { builtObjects, images } from "../objects/collections.js";
import { prepareAnimations } from "../character/animations.js";
import { resolveRecipe } from "../character/recipe.js";
import { Caves } from "../create/caves.js";
import { Renditions } from "../create/ground.js";
import { Placed } from "../create/placed.js";
import { PLATE_FT } from "../v2/sizes.js";
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

// The play page: your character in a released version 2 world, where the game server puts it. The
// world comes from raw GitHub at the released commit: its continent's platters first, and plate,
// placed and caves files as you come near them. Others near you come and go as the game server says.

const $ = (id) => document.getElementById(id);
const config = JSON.parse($("playConfig").textContent); // { repo, sha, paths, look, game: { url, token } }
const status = (text) => ($("playStatus").textContent = text);
const STREAM_MS = 1000; // how often to look for placed files coming into reach
const PLACED_FT = 2 * PLATE_FT; // how near a plate's placed file is fetched
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

async function play() {
  const loader = new PlayWorld(config);
  // How long each step of loading takes, as play.load.<step>, each from where the last ended, so
  // together they add up to play.load.total. "enter" includes picking a class.
  const tags = { repo: config.repo };
  const nav = performance.getEntriesByType?.("navigation")[0];
  if (nav) metrics().timing("play.load.page", nav.responseEnd, tags); // asking for the page until it's here
  let last = performance.now();
  metrics().timing("play.load.code", last - (nav?.responseEnd ?? 0), tags); // until this code runs
  const mark = (name) => {
    const now = performance.now();
    metrics().timing(`play.load.${name}`, now - last, tags);
    last = now;
  };
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
  // Combat news before you're in the world isn't yours to see: it's about others.
  const fight = (method) => (message) => combat?.[method](message);
  // The server says these as you enter, before combat is ready.
  let firstBuild = null;
  let firstBars = null;
  let earlyAreas = [];
  let restPoints = null;
  let earlyCooldowns = [];
  let leaving = null;
  let firstRestPoints = null;
  const early = []; // what the server says before the view is ready, as [method, argument]
  const tell = (method, arg) => (others ? others[method](arg) : early.push([method, arg]));
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
    cooldown: (message) => (combat ? combat.cooldown(message) : earlyCooldowns.push(message)),
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
    area: (message) => (combat ? combat.area_(message) : earlyAreas.push(message)),
    areaGone: (message) => (combat ? combat.areaGone_(message) : (earlyAreas = earlyAreas.filter((a) => a.id !== message.id))),
    targetable: (message) => {
      unitStatuses.targetable(message);
      combat?.targetable_(message);
    },
    build: (message) => (combat ? combat.build_(message) : (firstBuild = message)),
    bars: (message) => (combat ? combat.bars_(message) : (firstBars = message)),
    statusChanged: (message) => {
      unitStatuses.changed(message);
      combat?.statusChanged_(message);
    },
    statusGone: (message) => {
      unitStatuses.gone(message);
      combat?.statusGone_(message);
    },
    restPoints: (message) => (restPoints ? restPoints.set(message) : (firstRestPoints = message)),
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
  mark("view");
  setReportContext(() => ({ camera: view.camera.position.toArray().map(Math.round), plates: renditions.decoded.size, unreadable: [...renditions.unreadable] }));
  const continent = await step("continent", loader.continent(you.continent));
  const renditions = new Renditions();
  for (const bytes of continent.platters) renditions.addPlatter(bytes);
  renditions.setBiomes(continent.biomes?.areas ?? [], false);
  renditions.setWater(continent.water ?? { bodies: [], courses: [] }, false);
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
  await step("ground", view.ready([you.at[0], you.at[2]]));
  await step("animations", prepareAnimations().catch((err) => console.warn(`Couldn't load animations: ${err.message}`)));
  // From when the page was asked for, so it includes fetching the page and its code.
  metrics().timing("play.load.total", performance.now(), tags);
  status("");
  const touch = isTouch();
  if (touch) view.setGraphics(PHONE_GRAPHICS);
  // Players get the settings that trade looks for speed, not the editor's switch for each part.
  showGraphics = graphicsPanel(menu.querySelector(".play-graphics"), view, {
    check: "play-check",
    range: "play-range",
    parts: { "far ring": "distant land" },
    solid: "simple tree crowns",
  });
  menu.querySelector('[data-open="playGraphics"]').disabled = false;
  others = new Others(view);
  for (const [method, arg] of early) others[method](arg);
  sightLines = new SightLines(view, others, connection);
  restPoints = new RestPoints(view, connection);
  if (firstRestPoints) restPoints.set(firstRestPoints);
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
  combat = new PlayCombat({ view, others, connection, loader, you, hud: $("playCombat"), unitStatuses });
  if (firstBuild) combat.build_(firstBuild);
  if (firstBars) combat.bars_(firstBars);
  earlyAreas.forEach((message) => combat.area_(message));
  earlyCooldowns.forEach((message) => combat.cooldown(message));
  // A handle for scripts and the browser's console.
  window.play = { view, connection, others, combat, renditions, placed, caves, sightLines, restPoints };
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
