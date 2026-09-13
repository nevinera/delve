// Converts between an availableAbilities key (e.g. "units/goblin-raider/slash",
// the path under abilities/ - see Build::UnitTypesController#load_available_abilities)
// and the $ref string a unit type's `powers` entry stores, which is relative
// to the unit type's own file at unit-types/<unitTypeKey>.json.
//
// unitTypeKey's own "/"s each add a directory level beneath unit-types/ (same
// nesting Build::AbilitiesController's KEY_FORMAT allows for abilities), so
// escaping back up to the repo root before descending into abilities/ needs
// one ".." per segment of unitTypeKey. For a flat key like "goblin-raider"
// that's a single "..", matching real content (see unit-types/goblin-raider.json).
function relativePrefix(unitTypeKey) {
  return "../".repeat(unitTypeKey.split("/").length);
}

export function refForAbilityKey(unitTypeKey, abilityKey) {
  return `${relativePrefix(unitTypeKey)}abilities/${abilityKey}.json`;
}

// Returns null for anything that doesn't look like a reference this editor
// itself would have written (e.g. an inline Ability, or a $ref pointing
// somewhere unexpected) - such entries are preserved verbatim on save, just
// not editable through an ability-slot dropdown.
export function abilityKeyForRef(unitTypeKey, entry) {
  const ref = entry?.$ref;
  if (typeof ref !== "string") return null;
  const prefix = `${relativePrefix(unitTypeKey)}abilities/`;
  if (!ref.startsWith(prefix) || !ref.endsWith(".json")) return null;
  return ref.slice(prefix.length, -".json".length);
}
