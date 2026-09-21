import resourceTypes from "../../config/resource_types.json";

// The fixed set of resource types a unit type can be given, picked from
// config/resource_types.json - "we're best served with a fixed set of
// resource types for now" (energy, mana; rage is deferred until something
// generates it). Rails has no need of this list yet (nothing server-side
// validates against it), so it's client-only, unlike hotkeys.js's ACTIONS.
//
// Each entry is a full ResourceType (see docs/schema/resource_type.md) plus
// an "id" the unit-type editor's picker uses as its option value; "none"
// isn't in this list; it's the picker's own absence-of-a-resource option.
export const RESOURCE_TYPES = resourceTypes;

export function resourceTypeById(id) {
  return RESOURCE_TYPES.find(r => r.id === id) ?? null;
}
