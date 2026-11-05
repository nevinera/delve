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

export const BUILTIN_OBJECT_COLLECTIONS = [FARM, VILLAGE, HOUSEHOLD, MILL, COAST, BANDIT, MINES, NATURAL_CAVES, DENS, GOBLIN, WOODLAND, FORT, ROADS, RUINS, MARKET, QUEST, STONES, FLORA, FURNITURE, TABLEWARE, TRADES, SACRED, WAR, HARBOUR, STREET, ARCANE, LANDS, REMAINS, FARMYARD].map((c) => ({
  ...c,
  objects: c.objects.map((o) => (SEE_THROUGH.has(o.id) ? { ...o, blocksSight: false } : o)),
}));

export const BUILTIN_OBJECTS = BUILTIN_OBJECT_COLLECTIONS.flatMap((c) => c.objects.map((o) => ({ ...o, collection: `builtin:${c.id}` })));
