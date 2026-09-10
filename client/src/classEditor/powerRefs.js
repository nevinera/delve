// Converts between an availableAbilities key (e.g. "classes/puncher/punch",
// the path under abilities/ - see Build::ClassesController#load_available_abilities)
// and the $ref string a class's `powers` entry stores, which is relative to
// the class's own file at classes/<classKey>.json.
//
// classKey's own "/"s each add a directory level beneath classes/ (same
// nesting Build::AbilitiesController's KEY_FORMAT allows for abilities), so
// escaping back up to the repo root before descending into abilities/ needs
// one ".." per segment of classKey. For a flat key like "puncher" that's a
// single "..", matching real content (see classes/puncher.json).
function relativePrefix(classKey) {
  return "../".repeat(classKey.split("/").length);
}

export function refForAbilityKey(classKey, abilityKey) {
  return `${relativePrefix(classKey)}abilities/${abilityKey}.json`;
}

// Returns null for anything that doesn't look like a reference this editor
// itself would have written (e.g. an inline Ability, or a $ref pointing
// somewhere unexpected) - such entries are preserved verbatim on save, just
// not editable through a slot dropdown.
export function abilityKeyForRef(classKey, entry) {
  const ref = entry?.$ref;
  if (typeof ref !== "string") return null;
  const prefix = `${relativePrefix(classKey)}abilities/`;
  if (!ref.startsWith(prefix) || !ref.endsWith(".json")) return null;
  return ref.slice(prefix.length, -".json".length);
}
