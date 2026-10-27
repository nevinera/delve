import { MILITARY_STRUCTURES } from "./builtin/structures/military.js";
import { FARMSTEAD_STRUCTURES, VILLAGE_STRUCTURES } from "./builtin/structures/village.js";
import { WATERSIDE_STRUCTURES } from "./builtin/structures/waterside.js";
import { WILDS_STRUCTURES } from "./builtin/structures/wilds.js";
import { withWalk } from "./structures.js";

// Structures that ship with the game, in collections: read-only, placed as "structure:<id>" as a
// world's own are, furnished with builtin objects. Copying one into a world's collection makes it
// editable. The files under builtin/structures/ write them.

export const BUILTIN_STRUCTURE_COLLECTIONS = [FARMSTEAD_STRUCTURES, VILLAGE_STRUCTURES, MILITARY_STRUCTURES, WILDS_STRUCTURES, WATERSIDE_STRUCTURES].map((c) => ({
  ...c,
  structures: c.structures.map((s) => withWalk({ ...s, collection: `builtin:${c.id}` })),
}));

export const BUILTIN_STRUCTURES = BUILTIN_STRUCTURE_COLLECTIONS.flatMap((c) => c.structures);
