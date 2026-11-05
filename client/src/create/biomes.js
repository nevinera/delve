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
  "autumn forest": "#c8862a",
  "giant woods": "#1f5a2a",
  taiga: "#2c5a4a",
  "blossom valley": "#f0b4c8",
  "bamboo grove": "#7fb04a",
  "snowy forest": "#b8cfd8",
  highlands: "#7a6a84",
  savanna: "#c8b060",
  "red canyon": "#b05a38",
  "sand desert": "#d6b276",
  "salt flats": "#ece8dc",
  jungle: "#1f8a3c",
  "primeval valley": "#5cbb50",
  "tropical coast": "#2fb5a8",
  "sandy beach": "#ecd9a8",
  snowfield: "#ecf2f6",
  "frozen tundra": "#a8a88c",
  glacier: "#8cc4e4",
  mangrove: "#5f5a30",
  "fungal marsh": "#2c8a8a",
  "haunted woods": "#3a3e3a",
  "plague lands": "#8a8a34",
  "volcanic waste": "#e0501c",
  "corrupted waste": "#8a3040",
  "enchanted glade": "#7a8ad0",
  "crystal forest": "#a07ae0",
};
export const DEFAULT_BIOME = "plains";
export const biomesPath = (continent) => `places/continents/${continent}/biomes.json`;

export class Biomes extends Areas {
  constructor(scene, surface, stage) {
    super(scene, surface, stage, { colors: BIOMES, kind: DEFAULT_BIOME, field: "biome", list: "areas" });
  }
}
