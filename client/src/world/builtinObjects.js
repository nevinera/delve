import { BANDIT } from "./builtin/bandit.js";
import { CAVE } from "./builtin/cave.js";
import { COAST } from "./builtin/coast.js";
import { FARM } from "./builtin/farm.js";
import { FORT } from "./builtin/fort.js";
import { GOBLIN } from "./builtin/goblin.js";
import { HOUSEHOLD } from "./builtin/household.js";
import { MARKET } from "./builtin/market.js";
import { MILL } from "./builtin/mill.js";
import { QUEST } from "./builtin/quest.js";
import { ROADS } from "./builtin/roads.js";
import { RUINS } from "./builtin/ruins.js";
import { VILLAGE } from "./builtin/village.js";
import { WOODLAND } from "./builtin/woodland.js";

// Built objects that ship with the game, in collections: read-only props of builtObjects.js's
// format, placed as "built:<id>" as a world's own are. Copying one into a world's collection makes
// it editable. Each id starts with "b", and the files under builtin/ write them.

export const BUILTIN_OBJECT_COLLECTIONS = [FARM, VILLAGE, HOUSEHOLD, MILL, COAST, BANDIT, CAVE, GOBLIN, WOODLAND, FORT, ROADS, RUINS, MARKET, QUEST];

export const BUILTIN_OBJECTS = BUILTIN_OBJECT_COLLECTIONS.flatMap((c) => c.objects.map((o) => ({ ...o, collection: `builtin:${c.id}` })));
