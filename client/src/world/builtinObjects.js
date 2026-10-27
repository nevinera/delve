import { FARM } from "./builtin/farm.js";

// Built objects that ship with the game, in collections: read-only props of builtObjects.js's
// format, placed as "built:<id>" as a world's own are. Copying one into a world's collection makes
// it editable. Each id starts with "b", and the files under builtin/ write them.

export const BUILTIN_OBJECT_COLLECTIONS = [FARM];

export const BUILTIN_OBJECTS = BUILTIN_OBJECT_COLLECTIONS.flatMap((c) => c.objects.map((o) => ({ ...o, collection: `builtin:${c.id}` })));
