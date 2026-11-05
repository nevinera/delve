import { BANDIT } from "./builtin/bandit.js";
import { DENS, MINES, NATURAL_CAVES } from "./builtin/cave.js";
import { COAST } from "./builtin/coast.js";
import { FARM } from "./builtin/farm.js";
import { FLORA } from "./builtin/flora.js";
import { FORT } from "./builtin/fort.js";
import { FURNITURE, TABLEWARE } from "./builtin/furniture.js";
import { GOBLIN } from "./builtin/goblin.js";
import { HOUSEHOLD } from "./builtin/household.js";
import { MARKET } from "./builtin/market.js";
import { MILL } from "./builtin/mill.js";
import { HARBOUR, STREET, WAR } from "./builtin/outdoors.js";
import { QUEST } from "./builtin/quest.js";
import { ROADS } from "./builtin/roads.js";
import { RUINS } from "./builtin/ruins.js";
import { SACRED } from "./builtin/sacred.js";
import { STONES } from "./builtin/stones.js";
import { TRADES } from "./builtin/trades.js";
import { VILLAGE } from "./builtin/village.js";
import { ARCANE, FARMYARD, LANDS, REMAINS } from "./builtin/wilds.js";
import { WOODLAND } from "./builtin/woodland.js";

// Built objects that ship with the game, in collections: read-only props of builtObjects.js's
// format, placed as "built:<id>" as a world's own are. Copying one into a world's collection makes
// it editable. Each id starts with "b", and the files under builtin/ write them.

// The ones you see through or over, which don't block line of sight: open frames, posts, and
// things lying low. Arches, wells and stalls block it, with holes cut through (builtin/pieces.js
// throughZ and throughX).
const SEE_THROUGH = new Set([
  ...["bfarm005", "bfarm006", "bfarm007", "bfarm011", "bfarm013"], // wheelbarrow, plough, scarecrow, split-rail fence, farm gate
  ...["bvill010", "bvill012", "bvill013", "bvill014", "bvill015"], // stool, wagon wheel, lamp post, signpost, hanging sign
  ...["bhome008", "bhome009", "bhome010", "bhome011", "bhome013", "bhome014", "bhome015"], // pot on tripod, rug, candlestick, chair, table setting, loom, spinning wheel
  ...["bmill004", "bmill008"], // sawhorse, timber crane
  ...["bcoas004", "bcoas010", "bcoas012"], // net rack, fish drying rack, harbour lamp
  ...["bband005", "bband006", "bband012"], // bedroll, weapon rack, cook spit
  ...["bcave001", "bcave002", "bcave007", "bcave009", "bcave011"], // candles, glowing mushrooms, mine rails, pickaxe
  ...["bcave018", "bcave022", "bcave023", "bcave025", "bcave026", "bcave027"], // shovel and pick, hanging roots, loose rocks, nest, hide bedding, gnawed scraps
  ...["bgobl008", "bgobl010", "bgobl013"], // pipes, scaffold, goblin lamp
  ...["bwood001", "bwood003", "bwood004", "bwood005", "bwood006", "bwood007", "bwood013"], // mushroom ring, fern, wildflowers, berry bush, reeds, lily pads, spider web
  ...["bfort001", "bfort006", "bfort009", "bfort011"], // banner pole, ballista, weapon rack, portcullis
  ...["broad003", "broad006", "broad008"], // cobble patch, hitching post, stepping stones
  "bruin010", // iron fence
  ...["bmark003", "bmark005"], // meat rack, weighing scale
  "bques004", // lectern with scroll
]);

// The ones a character walks through, and sees through, for lying flat on the ground.
const WALK_THROUGH = new Set([
  ...["bwood001", "bwood004"], // mushroom ring, wildflowers
  ...["bhome009", "bband005", "bcave026", "bcave027"], // rug, bedroll, hide bedding, gnawed scraps
  ...["broad003", "broad008", "bcave009"], // cobble patch, stepping stones, mine rails
]);

// Sets that live in another collection than the file that makes them. Each member keeps its id.
const MOVED_SETS = [
  ["stones", "stalagmites", "natural"],
  ["stones", "stalactites", "natural"],
];

// Objects that join a set in another collection and take on how it blocks: [collection, set, ids].
const JOINED_SETS = [
  ["natural", "stalagmites", ["bcave003"]],
  ["natural", "stalactites", ["bcave020"]],
  ["stones", "loose rocks", ["bcave023"]],
  ["stones", "crystal cluster", ["bcave021"]],
  ["stones", "cairn", ["broad004"]],
  ["flora", "glowcaps", ["bcave007"]],
  ["flora", "toadstools", ["bwood002"]],
  ["flora", "ferns", ["bwood003"]],
  ["flora", "cattails", ["bwood006"]],
  ["flora", "flat lily pads", ["bwood007"]],
  ["flora", "fallen branches", ["bwood008"]],
  ["farmyard", "pumpkins", ["bfarm014"]],
  ["harbour", "buoys", ["bcoas006"]],
  ["harbour", "coiled rope", ["bcoas008"]],
  ["sacred", "headstones", ["bruin001", "bruin003"]],
  ["sacred", "grave crosses", ["bruin002"]],
  ["remains", "loose bones", ["bcave006"]],
  ["arcane", "treasure heap", ["bques008"]],
  ["war", "palisade wall", ["bband009"]],
];

// The collections with MOVED_SETS and JOINED_SETS applied, each joiner next to its set.
function regrouped(collections) {
  const out = collections.map((c) => ({ ...c, objects: [...c.objects] }));
  const named = (id) => out.find((c) => c.id === id);
  const add = (collection, objects, set) => {
    const last = collection.objects.findLastIndex((o) => o.variantSet === set);
    collection.objects.splice(last < 0 ? collection.objects.length : last + 1, 0, ...objects);
  };
  for (const [from, set, to] of MOVED_SETS) {
    const members = named(from).objects.filter((o) => o.variantSet === set);
    named(from).objects = named(from).objects.filter((o) => o.variantSet !== set);
    add(named(to), members, set);
  }
  for (const [home, set, ids] of JOINED_SETS) {
    const { walkThrough, blocksSight } = named(home).objects.find((o) => o.variantSet === set);
    const flags = { ...(walkThrough ? { walkThrough } : {}), ...(blocksSight === false ? { blocksSight } : {}) };
    for (const id of ids) {
      const from = out.find((c) => c.objects.some((o) => o.id === id));
      const object = from.objects.find((o) => o.id === id);
      from.objects = from.objects.filter((o) => o !== object);
      add(named(home), [{ ...object, ...flags, variantSet: set }], set);
    }
  }
  return out;
}

export const BUILTIN_OBJECT_COLLECTIONS = regrouped([FARM, VILLAGE, HOUSEHOLD, MILL, COAST, BANDIT, MINES, NATURAL_CAVES, DENS, GOBLIN, WOODLAND, FORT, ROADS, RUINS, MARKET, QUEST, STONES, FLORA, FURNITURE, TABLEWARE, TRADES, SACRED, WAR, HARBOUR, STREET, ARCANE, LANDS, REMAINS, FARMYARD]).map((c) => ({
  ...c,
  objects: c.objects.map((o) => ({
    ...o,
    ...(SEE_THROUGH.has(o.id) || WALK_THROUGH.has(o.id) ? { blocksSight: false } : {}),
    ...(WALK_THROUGH.has(o.id) ? { walkThrough: true } : {}),
  })),
}));

export const BUILTIN_OBJECTS = BUILTIN_OBJECT_COLLECTIONS.flatMap((c) => c.objects.map((o) => ({ ...o, collection: `builtin:${c.id}` })));
