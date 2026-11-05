import fs from "fs";
import { describe, expect, it } from "vitest";
import { BIOME_NAMES } from "../v2/biomes.js";
import { BIOMES } from "./biomes.js";

describe("the biome tool", () => {
  it("has a color and a button for every biome", () => {
    const view = fs.readFileSync(new URL("../../../app/views/create/show.html.erb", import.meta.url), "utf8");
    for (const name of BIOME_NAMES) {
      expect(BIOMES[name], name).toBeDefined();
      expect(view, name).toContain(`data-biome="${name}"`);
      expect(view, name).toContain(`<span style="background:${BIOMES[name]}"></span>${name}</button>`);
    }
  });
});
