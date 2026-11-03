// The stock visuals and sounds abilities pick from, by name. What each one looks like is in
// visuals.js, and what it sounds like in sounds.js.

export const VISUALS = ["bolt", "arrow", "burst", "ring", "glow", "swirl", "beam", "slash", "cone", "shield"];
export const SOUNDS = ["cast", "whoosh", "impact", "fire", "frost", "holy", "shadow", "nature", "arcane", "slash", "heal", "shout"];

// What a school looks like, if an ability doesn't pick colors: [main, trim].
export const SCHOOL_COLORS = {
  physical: ["#c8c8c8", "#ffffff"],
  holy: ["#ffe9a0", "#ffffff"],
  fire: ["#ff6a20", "#ffd040"],
  nature: ["#58c850", "#d8f8a0"],
  frost: ["#70c8ff", "#ffffff"],
  shadow: ["#6a3aa0", "#c090f0"],
  arcane: ["#c060f0", "#f8c8ff"],
};
