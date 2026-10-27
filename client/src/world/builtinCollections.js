// The collections that ship with the game, read-only: every scattered object type (objects.js),
// grouped. Kit types (made of pieces) can be copied into a world's own collections; the rest are
// made in code, so they can only be looked at and placed.

export const BUILTIN_COLLECTIONS = [
  { id: "crafted", name: "crafted", types: ["fence"] },
  { id: "wood", name: "wood", types: ["log", "rottingLog", "driftLog", "stump", "deadStump", "hollowStump", "rootTangle", "uprooted"] },
  { id: "rocks", name: "rocks", types: ["boulder", "mossyBoulder", "rock", "outcrop", "spire", "rubble"] },
  { id: "plants", name: "plants", types: ["bush", "thicket", "hummock"] },
];
