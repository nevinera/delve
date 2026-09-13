// Mirrors Validators::ItemValidator's enums (app/services/validators/item_validator.rb)
// and docs/schema/item.md - no server round-trip for these, same reasoning
// as classFieldOptions.js.
export const SLOT_VALUES = [
  "head", "neck", "shoulders", "back", "chest", "wrists", "hands", "waist", "legs", "feet",
  "ring", "main_hand", "off_hand", "one_hand", "two_hand",
];

export const WEAPON_SLOTS = ["main_hand", "off_hand", "one_hand", "two_hand"];

export const WEAPON_TYPES = [
  "axe", "sword", "mace", "dagger", "fist_weapon", "polearm", "staff", "bow", "crossbow", "gun", "wand", "thrown",
];

export const PRIMARY_STATS = ["strength", "agility", "intellect"];

export const SECONDARY_STATS = [
  "stamina", "crit_rating", "haste_rating", "mastery_rating", "versatility_rating", "defence_rating", "recovery_rating",
];

// Max secondaries per slot, per docs/stats.md's Slots table.
const TWO_SECONDARY_SLOTS = ["ring", "shoulders", "back", "waist", "hands", "feet", "wrists"];
const THREE_SECONDARY_SLOTS = ["neck", "head", "chest", "legs", "main_hand", "off_hand", "one_hand", "two_hand"];

export function maxSecondaries(slot) {
  if (TWO_SECONDARY_SLOTS.includes(slot)) return 2;
  if (THREE_SECONDARY_SLOTS.includes(slot)) return 3;
  return 3;
}
