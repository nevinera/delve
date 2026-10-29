import "./play.css";
import { graphicsPanel } from "../editor/graphicsPanel.js";
import { RenderView, SIGHT } from "../editor/renderView.js";
import { builtObjects, builtStructures, images } from "../objects/collections.js";
import { resolveRecipe } from "../character/recipe.js";
import { TILE_FT } from "../world/constants.js";
import { setBuiltObjects } from "../world/objects.js";
import { GameConnection } from "./game.js";
import { PlayWorld } from "./loader.js";
import { PlateCache, openStore } from "./plateCache.js";
import { Others } from "./others.js";
import { TouchControls, isTouch } from "./touch.js";

// The play page: your character in a released world, where the game server puts it. Tiles come
// from the world's plates on raw GitHub, at the released commit, fetched as you walk toward them.
// Others near you come and go as the game server says.

const $ = (id) => document.getElementById(id);
const config = JSON.parse($("playConfig").textContent); // { repo, sha, paths, look, game: { url, token } }
const status = (text) => ($("playStatus").textContent = text);
const STREAM_MS = 1000; // how often to look for plates coming into reach
// Lighter graphics for phones: no extra pixel density, less ground clutter, and simple tree crowns.
const PHONE_GRAPHICS = { resolution: 1, clutterRadiusFt: 120, clutterDensity: 0.5, solidCanopies: true };

// Enters the game server, and resolves with the welcome: where it puts you.
function enter(on) {
  return new Promise((resolve, reject) => {
    let welcomed = false;
    const connection = new GameConnection(config.game, {
      ...on,
      welcome: (message) => ((welcomed = true), resolve({ connection, you: message.you })),
      error: (message) => (welcomed ? status(message.message) : reject(new Error(message.message))),
      closed: () => (welcomed ? on.closed() : reject(new Error("the game server isn't answering"))),
    });
  });
}

// The menu: its buttons open pages in its place, and each page's back button returns.
const menu = $("playMenu");
const main = menu.querySelector(".play-menu-main");
const showPage = (page) => {
  for (const el of menu.querySelectorAll(".play-menu-page")) el.hidden = el !== page;
  main.hidden = Boolean(page);
};
for (const button of menu.querySelectorAll("[data-open]")) button.addEventListener("click", () => showPage($(button.dataset.open)));
for (const button of menu.querySelectorAll("[data-back]")) button.addEventListener("click", () => showPage(null));
menu.addEventListener("toggle", (e) => e.newState === "closed" && showPage(null));
menu.querySelector('[data-open="playGraphics"]').disabled = true; // until there's a view

async function play() {
  const loader = new PlayWorld({ ...config, cache: new PlateCache(await openStore()) });
  status("Loading the world...");
  await loader.open();
  const { world } = loader;
  setBuiltObjects(builtObjects(world), images(world), builtStructures(world));

  let others = null;
  const early = []; // what the server says before the view is ready, as [method, argument]
  const tell = (method, arg) => (others ? others[method](arg) : early.push([method, arg]));
  status("Entering...");
  const { connection, you } = await enter({
    snapshot: ({ characters }) => characters.forEach((c) => tell("appear", c)),
    appear: ({ character }) => tell("appear", character),
    vanish: ({ id }) => tell("vanish", id),
    moved: (message) => tell("moved", message),
    closed: () => {
      status("You've left the game. Reload the page to enter again.");
      others?.clear();
    },
  });

  const tile = [Math.floor(you.at[0] / TILE_FT), Math.floor(you.at[2] / TILE_FT)];
  status("Loading the land around you...");
  await loader.platesAround(you.continent, tile, SIGHT.farTiles + 1);
  status("");

  let showGraphics = null;
  const view = new RenderView($("scene"), { onGraphics: (graphics) => showGraphics?.(graphics) });
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
  view.onWalkFrame = (dt) => others.frame(dt);
  const paused = () => ($("playPaused").hidden = false);
  view.walkFrom({ world, continent: you.continent, zones: [], look: resolveRecipe(config.look) }, [you.at[0], you.at[2]], paused);
  view.walker.yaw = you.yaw;
  connection.report(view);
  if (touch) new TouchControls(view, document.body);
  $("playResume").addEventListener("click", () => {
    $("playPaused").hidden = true;
    view.startWalk(paused, [view.walker.pos.x, view.walker.pos.z]);
  });

  // Plates come in as you get near them.
  let fetching = false;
  setInterval(async () => {
    if (fetching || !view.walker) return;
    const { pos } = view.walker;
    const at = [Math.floor((pos.x + view.origin[0]) / TILE_FT), Math.floor((pos.z + view.origin[1]) / TILE_FT)];
    fetching = true;
    try {
      const added = await loader.platesAround(you.continent, at, SIGHT.farTiles + 1);
      if (added.length) view.tilesArrived(added);
    } catch (err) {
      status(`Couldn't load the land nearby: ${err.message}`);
    } finally {
      fetching = false;
    }
  }, STREAM_MS);
}

play().catch((err) => status(`Couldn't enter the world: ${err.message}`));
