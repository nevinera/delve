import fs from "fs";
import { describe, expect, it } from "vitest";
import { characterClips } from "./animations.js";
import { characterMesh } from "./characterMesh.js";
import { dragonMesh } from "./dragon.js";
import { resolveRecipe } from "./recipe.js";

const baked = JSON.parse(fs.readFileSync(new URL("./animations.json", import.meta.url)));

describe("dragonMesh", () => {
  it("stands on the ground, as tall as the look, with a mouth at the front of the head", () => {
    for (const body of ["dragon", "wyvern"]) {
      const { positions, bones } = dragonMesh(resolveRecipe({ body, height: 12 }));
      const ys = positions.filter((_, i) => i % 3 === 1);
      expect(Math.min(...ys), body).toBeCloseTo(0, 0);
      expect(Math.max(...ys), body).toBeGreaterThan(11);
      const at = Object.fromEntries(bones.map((b) => [b.name, b.at]));
      expect(at.mouth[2]).toBeGreaterThan(at.head[2]);
    }
  });
});

describe("dragon clips", () => {
  it("breathes fire for a while partway through its breath", () => {
    const clips = characterClips(characterMesh(resolveRecipe({ body: "dragon" })), baked);
    const [from, to] = clips.get("Breath").userData.breath;
    expect(from).toBeGreaterThan(0);
    expect(to).toBeLessThan(clips.get("Breath").duration);
    expect(to - from).toBeGreaterThan(1);
  });
});
