// Checks a draft against Build::ValidatorsController, which wraps the same
// Ruby Validators::* classes the server already requires for
// FetchAbilityContentJob/FetchCharacterClassContentJob - rather than
// re-implementing that (constantly-changing) schema a second time in JS.
// Resolves to {valid: true} or {valid: false, error: {message, path}}.
function csrfToken() {
  return document.querySelector('meta[name="csrf-token"]')?.content;
}

async function postValidation(path, data) {
  const res = await fetch(path, {
    method: "POST",
    headers: {"Content-Type": "application/json", "X-CSRF-Token": csrfToken()},
    body: JSON.stringify(data),
  });
  return res.json();
}

export function validateAbility(ability) {
  return postValidation("/build/validators/ability", ability);
}

// Takes the *resolved* class (see resolveFullClass.js) - CharacterClassValidator
// rejects $ref powers outright, so the abstract classes/<key>.json form
// this editor actually saves would always fail.
export function validateCharacterClass(fullClass) {
  return postValidation("/build/validators/character_class", fullClass);
}

// Takes the *resolved* unit type (see resolveFullUnitType.js) - UnitTypeValidator
// rejects $ref powers outright, same reasoning as validateCharacterClass.
export function validateUnitType(fullUnitType) {
  return postValidation("/build/validators/unit_type", fullUnitType);
}

// Items have no $ref fields at all (see docs/schema/item.md), so there's no
// resolved/abstract distinction here - the draft is validated as-is.
export function validateItem(item) {
  return postValidation("/build/validators/item", item);
}

// Maps have no $ref fields either (see the map editor plan's Phase 1
// context note) - the draft is validated as-is.
export function validateMap(map) {
  return postValidation("/build/validators/map", map);
}

// Takes the *resolved* zone (see resolveZoneRefs.js) - ZoneValidator#validate_maps!
// calls MapValidator directly on each maps[i] with no $ref handling, same
// reasoning as validateCharacterClass/validateUnitType.
export function validateZone(fullZone) {
  return postValidation("/build/validators/zone", fullZone);
}

// A world never inlines its zones at all (see docs/schema/world.md), so
// there's no abstract/resolved distinction here either - the draft is
// validated as-is, same as validateItem/validateMap.
export function validateWorld(world) {
  return postValidation("/build/validators/world", world);
}
