// Mirrors CharacterItem::PRIMARY_STATS/SECONDARY_STATS and
// CharacterClass::WIELD_TYPES - no server round-trip for these, so they're
// hardcoded here the same way entryFieldSchema.js mirrors the ability
// validators' enums.
export const PRIMARY_STATS = ["strength", "agility", "intellect"];

export const SECONDARY_STATS = [
  "stamina", "crit_rating", "haste_rating", "mastery_rating", "versatility_rating", "defence_rating", "recovery_rating",
];

export const WIELD_TYPES = [
  "axe", "sword", "mace", "dagger", "fist_weapon", "polearm", "staff", "bow", "crossbow", "gun", "wand", "thrown",
  "shield", "totem", "book", "orb",
];

export const SLOT_COUNT = 10;
