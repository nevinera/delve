import { Areas } from "./areas.js";

// Biome areas drawn on the map with geo's biome tool (areas.js), each with one of BIOMES (as
// v2/biomes.js says which biome each place is). A continent's are kept in its biomes file:
//
//   places/continents/<continent>/biomes.json
//   { "version": 1, "areas": [{ "biome": "forest", "points": [[x, z], ...] }, ...] }, continent feet

export const BIOMES = {
  plains: "#a8c060",
  forest: "#2e7d32",
  rocky: "#9e9488",
  swamp: "#56704a",
};
export const DEFAULT_BIOME = "plains";
export const biomesPath = (continent) => `places/continents/${continent}/biomes.json`;

export class Biomes extends Areas {
  constructor(scene, surface, stage) {
    super(scene, surface, stage, { colors: BIOMES, kind: DEFAULT_BIOME, field: "biome", list: "areas" });
  }
}
