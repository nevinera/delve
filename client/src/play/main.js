import "./play.css";
import { RenderView, SIGHT } from "../editor/renderView.js";
import { builtObjects, builtStructures, images } from "../objects/collections.js";
import { resolveRecipe } from "../character/recipe.js";
import { TILE_FT } from "../world/constants.js";
import { setBuiltObjects } from "../world/objects.js";
import { PlayWorld } from "./loader.js";

// The play page: your character in a released world, at its spawn point. Tiles come from the
// world's plates on raw GitHub, at the released commit, fetched as you walk toward them.

const $ = (id) => document.getElementById(id);
const config = JSON.parse($("playConfig").textContent); // { repo, sha, paths, look }
const status = (text) => ($("playStatus").textContent = text);
const STREAM_MS = 1000; // how often to look for plates coming into reach

async function play() {
  const loader = new PlayWorld(config);
  status("Loading the world...");
  const spawn = await loader.open();
  const { world } = loader;
  setBuiltObjects(builtObjects(world), images(world), builtStructures(world));
  const tile = spawn.at.map(Math.floor);
  status("Loading the land around you...");
  await loader.platesAround(spawn.continent, tile, SIGHT.farTiles + 1);
  status("");

  const view = new RenderView($("scene"));
  const paused = () => ($("playPaused").hidden = false);
  view.walkFrom({ world, continent: spawn.continent, zones: [], look: resolveRecipe(config.look) }, [spawn.at[0] * TILE_FT, spawn.at[1] * TILE_FT], paused);
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
      const added = await loader.platesAround(spawn.continent, at, SIGHT.farTiles + 1);
      if (added.length) view.tilesArrived(added);
    } catch (err) {
      status(`Couldn't load the land nearby: ${err.message}`);
    } finally {
      fetching = false;
    }
  }, STREAM_MS);
}

play().catch((err) => status(`Couldn't enter the world: ${err.message}`));
