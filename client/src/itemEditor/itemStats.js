// Mirrors ItemStats::Raw (app/services/item_stats/raw.rb) / itemstats.Raw
// (game-server/internal/itemstats) - computes the stat grants an item draft
// would produce at em = 1.0 (ee = 0), i.e. before any elevation scaling.
// Live preview only: the editor never uses this to decide anything about
// what's saved, and nothing here needs to match a real character_item (no
// received_at/provenance fields exist on a draft).
const BASE_PRIMARY = 15.0;
const BASE_SECONDARY = 10.0;
const PRIMARY_MISSING_BONUS = 0.8;
const SECONDARY_MISSING_BONUS = 0.6;
const SHIELD_DEFENCE_MULTIPLIER = 2.5;

// factor: slot's point multiplier. primary: whether this slot ever has a
// primary (false for ring/neck). maxSecondaries: how many secondary slots
// it rolls. baseStamina: whether it grants stamina purely from being an
// armor slot, independent of itemization.
const SLOT_SHAPES = {
  head: {factor: 1.5, primary: true, maxSecondaries: 3, baseStamina: true},
  neck: {factor: 1.0, primary: false, maxSecondaries: 3, baseStamina: false},
  shoulders: {factor: 1.0, primary: true, maxSecondaries: 2, baseStamina: true},
  back: {factor: 1.0, primary: true, maxSecondaries: 2, baseStamina: true},
  chest: {factor: 1.5, primary: true, maxSecondaries: 3, baseStamina: true},
  wrists: {factor: 1.0, primary: true, maxSecondaries: 2, baseStamina: true},
  hands: {factor: 1.0, primary: true, maxSecondaries: 2, baseStamina: true},
  waist: {factor: 1.0, primary: true, maxSecondaries: 2, baseStamina: true},
  legs: {factor: 1.5, primary: true, maxSecondaries: 3, baseStamina: true},
  feet: {factor: 1.0, primary: true, maxSecondaries: 2, baseStamina: true},
  ring: {factor: 1.0, primary: false, maxSecondaries: 2, baseStamina: false},
  main_hand: {factor: 2.0, primary: true, maxSecondaries: 3, baseStamina: false},
  off_hand: {factor: 2.0, primary: true, maxSecondaries: 3, baseStamina: false},
  one_hand: {factor: 2.0, primary: true, maxSecondaries: 3, baseStamina: false},
  two_hand: {factor: 4.0, primary: true, maxSecondaries: 3, baseStamina: false},
};

export function rawItemStats(item) {
  const shape = SLOT_SHAPES[item.slot];
  if (!shape) return {};

  const shield = item.slot === "off_hand" && item.shield === true;
  const primarySlot = shape.primary && !shield;
  const primaryPresent = primarySlot && Boolean(item.primary);
  const secondaries = Array.isArray(item.secondaries) ? item.secondaries : [];
  const missingSecondaries = Math.max(shape.maxSecondaries - secondaries.length, 0);

  const primaryBonus = primarySlot && !primaryPresent ? PRIMARY_MISSING_BONUS : 0.0;
  const totalBonusPercent = primaryBonus + missingSecondaries * SECONDARY_MISSING_BONUS;
  const filledCount = (primaryPresent ? 1 : 0) + secondaries.length;
  const bonusPercentEach = filledCount === 0 ? 0.0 : totalBonusPercent / filledCount;
  const itemizedMultiplier = (1 + bonusPercentEach) * shape.factor;

  const stats = {};
  const add = (key, value) => {
    stats[key] = (stats[key] ?? 0) + value;
  };

  if (primaryPresent) add(item.primary, BASE_PRIMARY * itemizedMultiplier);
  secondaries.forEach((s) => add(s, BASE_SECONDARY * itemizedMultiplier));
  if (shape.baseStamina) add("stamina", BASE_SECONDARY * shape.factor);
  if (shield) add("defence_rating", SHIELD_DEFENCE_MULTIPLIER * BASE_PRIMARY * shape.factor);

  return stats;
}
