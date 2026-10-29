import COLLECTIONS from "./builtin/templates.json" with { type: "json" };

// Templates that ship with the game, in collections: read-only, placed as a world's own are,
// furnished with builtin objects. Copying one into a world's collection makes it editable.
// script/templates.mjs writes builtin/templates.json.

export const BUILTIN_TEMPLATE_COLLECTIONS = COLLECTIONS.map((c) => ({
  ...c,
  templates: c.templates.map((t) => ({ ...t, collection: `builtin:${c.id}` })),
}));

export const BUILTIN_TEMPLATES = BUILTIN_TEMPLATE_COLLECTIONS.flatMap((c) => c.templates);
