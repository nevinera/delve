import { describe, expect, it } from "vitest";
import { BIOME_NAMES } from "./biomes.js";
import { PATTERNS, groundClass, look, painted, slopeOf } from "./look.js";

const biome = (name) => BIOME_NAMES.indexOf(name);
const pattern = (...args) => PATTERNS[look(...args).pattern];

describe("ground's look", () => {
  it("sorts ground into classes by slope and height", () => {
    expect(groundClass(5, 100)).toBe("flat");
    expect(groundClass(30, 100)).toBe("slope");
    expect(groundClass(55, 100)).toBe("steep");
    expect(groundClass(55, 1)).toBe("shore");
  });

  it("works out a square's slope from its corners", () => {
    expect(slopeOf(0, 0, 0, 0, 4)).toBe(0);
    expect(slopeOf(0, 4, 0, 4, 4)).toBeCloseTo(45);
  });

  it("gives each biome its own ground", () => {
    expect(pattern(biome("swamp"), 2, 50, 0, 0)).toMatch(/mud|moss/);
    expect(pattern(biome("forest"), 2, 50, 0, 0)).toMatch(/litter|moss/);
    expect(pattern(biome("plains"), 60, 50, 0, 0)).toBe("rock");
    expect(pattern(biome("plains"), 2, 1, 0, 0)).toBe("sand");
  });

  it("mixes patches in about as much as each biome says", () => {
    let mud = 0;
    for (let k = 0; k < 4000; k++) if (pattern(biome("swamp"), 2, 50, (k % 63) * 37, Math.floor(k / 63) * 41) === "mud") mud++;
    expect(mud / 4000).toBeGreaterThan(0.35);
    expect(mud / 4000).toBeLessThan(0.75);
  });

  it("looks up ground painted by hand", () => {
    expect(PATTERNS[painted("sand", 0, 0).pattern]).toBe("sand");
    expect(painted("lava", 0, 0)).toBeNull();
  });
});
