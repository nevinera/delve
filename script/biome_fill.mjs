// Adds each new biome's entries to client/src/v2/fill.json and the game server's copy, leaving what's
// there alone. An entry is a tree kind and size, a world/objects.js type, or a built-in object or
// variant set by name, whose share is split among its members. Built objects carry their footprint
// and height, since the game server has no copy of them.
//
//   node script/biome_fill.mjs
import { register } from "node:module";
import fs from "fs";

register("data:text/javascript,export async function load(url, context, next) { return next(url, url.endsWith('.json') ? { ...context, importAttributes: { type: 'json' } } : context); }");
const client = (path) => import(new URL(`../client/src/${path}`, import.meta.url));
const { BUILTIN_OBJECTS } = await client("world/builtinObjects.js");
const { shapeOf } = await client("world/builtObjects.js");
const { OBJECT_TYPES } = await client("world/objects.js");
const { BIOME_NAMES } = await client("v2/biomes.js");

const T = (tree, size, share) => ({ tree, size, share });
const O = (object, share) => ({ object, share });
const S = (name, share) => ({ set: name, share });

const BIOMES = {
  "autumn forest": { large: [T("autumn", 3, 0.11), T("oak", 3, 0.015)], medium: [T("autumn", 2, 0.04), S("small stumps", 0.006), S("fallen branches", 0.006)], small: [T("autumn", 1, 0.01), S("shrubs", 0.02), S("brown mushrooms", 0.01)] },
  "giant woods": { large: [T("giant", 3, 0.13)], medium: [T("giant", 2, 0.03), O("mossyBoulder", 0.012), O("rottingLog", 0.01)], small: [S("ferns", 0.03), O("hollowStump", 0.005), S("bracket fungus log", 0.004)] },
  taiga: { large: [T("spruce", 3, 0.14)], medium: [T("spruce", 2, 0.05), O("mossyBoulder", 0.008)], small: [T("spruce", 1, 0.02), S("fir saplings", 0.02), O("rootTangle", 0.004)] },
  "blossom valley": { large: [T("blossom", 3, 0.035)], medium: [T("blossom", 2, 0.03), S("low boulders", 0.004)], small: [T("blossom", 1, 0.012), S("flowering shrubs", 0.012), S("fallen petals", 0.012)] },
  "bamboo grove": { large: [T("bamboo", 3, 0.05)], medium: [T("bamboo", 2, 0.08), S("mossy rocks", 0.01)], small: [T("bamboo", 1, 0.1), S("ferns", 0.01)] },
  "snowy forest": { large: [T("snowpine", 3, 0.12), T("dead", 3, 0.006)], medium: [T("snowpine", 2, 0.04), S("snowy rocks", 0.008)], small: [S("snowy firs", 0.025), S("snowdrift", 0.01), O("deadStump", 0.003)] },
  highlands: { large: [O("rock", 0.01), S("standing stone", 0.001), T("pine", 3, 0.002)], medium: [O("boulder", 0.012), S("low boulders", 0.01), S("mossy rocks", 0.006)], small: [S("loose rocks", 0.015), S("cairn", 0.001), S("thistles", 0.01)] },
  savanna: { large: [T("acacia", 3, 0.012), O("rock", 0.002)], medium: [T("acacia", 2, 0.01), S("dead bush", 0.006), S("termite mound", 0.003)], small: [S("dead bush", 0.006), S("dry grass", 0.012), S("desert skull", 0.0005)] },
  "red canyon": { large: [S("sandstone hoodoo", 0.01)], medium: [S("sandstone hoodoo", 0.01), S("barrel cactus", 0.004), T("dead", 2, 0.003)], small: [S("dead bush", 0.014), S("prickly pear", 0.006)] },
  "sand desert": { large: [S("saguaro cactus", 0.006)], medium: [S("saguaro cactus", 0.004), S("sandstone hoodoo", 0.003)], small: [S("barrel cactus", 0.004), S("dead bush", 0.005), S("tumbleweed", 0.004), S("desert skull", 0.0008)] },
  "salt flats": { medium: [S("low boulders", 0.001)], small: [S("dead bush", 0.002), S("desert skull", 0.0005)] },
  jungle: { large: [T("jungle", 3, 0.14)], medium: [T("jungle", 2, 0.05), T("treefern", 2, 0.02), O("mossyBoulder", 0.008)], small: [T("treefern", 1, 0.02), S("shrubs", 0.03), S("ferns", 0.02), O("rootTangle", 0.006)] },
  "primeval valley": { large: [T("treefern", 3, 0.05), T("jungle", 3, 0.02)], medium: [T("treefern", 2, 0.04), S("giant ribcage", 0.0008), O("mossyBoulder", 0.008)], small: [S("ferns", 0.03), T("treefern", 1, 0.015), S("eggs", 0.002)] },
  "tropical coast": { large: [T("palm", 3, 0.02)], medium: [T("palm", 2, 0.025), S("low boulders", 0.002)], small: [T("palm", 1, 0.008), S("shrubs", 0.006)] },
  "sandy beach": { medium: [O("driftLog", 0.008)], small: [S("loose rocks", 0.004)] },
  snowfield: { large: [T("snowpine", 3, 0.008), S("snowy rocks", 0.008)], medium: [S("snowy rocks", 0.01), S("snowdrift", 0.012), T("snowpine", 2, 0.006)], small: [S("snowdrift", 0.015), S("snowy firs", 0.004)] },
  "frozen tundra": { large: [S("snowy rocks", 0.004)], medium: [S("snowy rocks", 0.006), S("dead bush", 0.004)], small: [S("dead bush", 0.01), S("snowdrift", 0.006), S("dry grass", 0.012), S("ice chunks", 0.002)] },
  glacier: { large: [S("ice spikes", 0.012), S("ice chunks", 0.01)], medium: [S("ice chunks", 0.012), S("ice spikes", 0.01), S("snowdrift", 0.006)], small: [S("ice chunks", 0.008)] },
  mangrove: { large: [T("mangrove", 3, 0.09)], medium: [T("mangrove", 2, 0.05), S("cypress knees", 0.012), O("rottingLog", 0.006)], small: [T("mangrove", 1, 0.015), S("cypress knees", 0.015), S("swamp mound", 0.01), O("rootTangle", 0.01)] },
  "fungal marsh": { large: [T("giantcap", 3, 0.07)], medium: [T("giantcap", 2, 0.04), S("giant mushroom", 0.006)], small: [T("giantcap", 1, 0.02), S("glowcaps", 0.03), S("pale mushrooms", 0.02), S("swamp mound", 0.006)] },
  "haunted woods": { large: [T("gnarled", 3, 0.1), T("dead", 3, 0.02)], medium: [T("gnarled", 2, 0.04), O("rottingLog", 0.008)], small: [T("gnarled", 1, 0.012), O("hollowStump", 0.006), S("exposed roots", 0.008), S("pale mushrooms", 0.008)] },
  "plague lands": { large: [T("blighted", 3, 0.03), T("dead", 3, 0.02)], medium: [T("blighted", 2, 0.02), T("dead", 2, 0.01), S("loose bones", 0.004)], small: [S("dead bush", 0.012), S("loose bones", 0.006), S("skeletons", 0.001), S("rotten stump", 0.004)] },
  "volcanic waste": { large: [T("charred", 3, 0.008), S("slate shards", 0.02)], medium: [T("charred", 2, 0.008), S("slate shards", 0.02), S("ash piles", 0.01)], small: [S("slate shards", 0.02), S("ash piles", 0.01)] },
  "corrupted waste": { large: [T("thorn", 3, 0.02), S("slate shards", 0.012)], medium: [T("thorn", 2, 0.02), S("slate shards", 0.012)], small: [S("blood spatter", 0.004), S("loose bones", 0.005), S("slate shards", 0.01)] },
  "enchanted glade": { large: [T("silverleaf", 3, 0.09)], medium: [T("silverleaf", 2, 0.04), S("runestones", 0.002), S("glowcaps", 0.006)], small: [T("silverleaf", 1, 0.01), S("flowering shrubs", 0.012), S("glowcaps", 0.012), S("moss patch", 0.01)] },
  "crystal forest": { large: [T("crystal", 3, 0.035), T("silverleaf", 3, 0.03)], medium: [T("crystal", 2, 0.03), S("crystal cluster", 0.012)], small: [T("crystal", 1, 0.015), S("crystal cluster", 0.02), S("loose rocks", 0.005)] },
};

const near = (v) => Math.round(v * 1e6) / 1e6;
function entries(list) {
  return list.flatMap((entry) => {
    if (entry.tree) return [entry];
    if (entry.object) {
      if (!OBJECT_TYPES[entry.object]) throw new Error(`no object type ${entry.object}`);
      return [entry];
    }
    const members = BUILTIN_OBJECTS.filter((o) => (o.variantSet ?? o.name) === entry.set);
    if (!members.length) throw new Error(`no built-in object or set ${entry.set}`);
    return members.map((o) => {
      const { footprint, height } = shapeOf(o);
      const vary = o.sizeVary ?? 0.1;
      return { object: `built:${o.id}`, share: near(entry.share / members.length), scales: [near(1 - vary), near(1 + vary)], footprint, height, ...(o.blocksSight === false ? { blocksSight: false } : {}) };
    });
  });
}

const path = new URL("../client/src/v2/fill.json", import.meta.url);
const fill = JSON.parse(fs.readFileSync(path, "utf8"));
for (const name of BIOME_NAMES) {
  if (!BIOMES[name]) continue;
  fill.biomes[name] = Object.fromEntries(Object.entries(BIOMES[name]).map(([size, list]) => [size, entries(list)]));
}
fill.about = "What fills each object slot (v2/slots.js), by the biome under it and the slot's size: each entry takes `share` of the rolls, in order (rolls are split finer by the slot's place, so shares can be small), and the rest are left empty. A tree is a kind and size from render/treeMeshes.js; an object is a type from world/objects.js, or a built-in object (built:<id>) with its `scales`, its `footprint` and `height` at scale 1, and `blocksSight` false if you see through it. Slots on banks of running water, shores of still water, or in shallows of either take theirs from `banks` instead, by whether the water runs. script/biome_fill.mjs writes the newer biomes.";
const text = `${JSON.stringify(fill, null, 2)}\n`;
fs.writeFileSync(path, text);
fs.writeFileSync(new URL("../game-server/internal/worlds/fill.json", import.meta.url), text);
console.log(`${Object.keys(fill.biomes).length} biomes, ${text.length} bytes`);
