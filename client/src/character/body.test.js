import { describe, it, expect } from "vitest";
import { BONE_NAMES, bodyMesh, skeleton } from "./body.js";
import { resolveRecipe } from "./recipe.js";

const tallest = (positions) => Math.max(...positions.filter((_, i) => i % 3 === 1));

describe("skeleton", () => {
  it("has the mannequin's bone names, parents first", () => {
    const bones = skeleton(resolveRecipe());
    expect(bones.map((b) => b.name).sort()).toEqual([...BONE_NAMES].sort());
    bones.forEach((b, i) => {
      if (b.parent) expect(bones.findIndex((p) => p.name === b.parent)).toBeLessThan(i);
    });
  });

  it("mirrors the left side to the right", () => {
    const bones = Object.fromEntries(skeleton(resolveRecipe()).map((b) => [b.name, b.at]));
    expect(bones.hand_r[0]).toBeCloseTo(-bones.hand_l[0]);
    expect(bones.hand_r[1]).toBeCloseTo(bones.hand_l[1]);
  });

  it("widens the hips and narrows the shoulders with femininity", () => {
    const at = (look) => Object.fromEntries(skeleton(resolveRecipe(look)).map((b) => [b.name, b.at]));
    const [man, woman] = [at({ femininity: 0 }), at({ femininity: 1 })];
    expect(woman.thigh_l[0]).toBeGreaterThan(man.thigh_l[0]);
    expect(woman.upperarm_l[0]).toBeLessThan(man.upperarm_l[0]);
  });
});

describe("bodyMesh", () => {
  it("stands as tall as the look says", () => {
    expect(tallest(bodyMesh(resolveRecipe({ height: 6 })).positions)).toBeCloseTo(6, 0);
    expect(tallest(bodyMesh(resolveRecipe({ height: 7.5 })).positions)).toBeCloseTo(7.5, 0);
  });

  it("weights every corner to real bones, summing to 1", () => {
    const { bones, skinIndex, skinWeight } = bodyMesh(resolveRecipe({ hair: "ponytail", jewelry: ["earrings", "necklace"] }));
    for (let v = 0; v < skinIndex.length / 4; v++) {
      let total = 0;
      for (let n = 0; n < 4; n++) {
        expect(skinIndex[v * 4 + n]).toBeLessThan(bones.length);
        total += skinWeight[v * 4 + n];
      }
      expect(total).toBeCloseTo(1);
    }
  });

  it("colors hair onto the head unless bald", () => {
    const hair = "#ff0000";
    const reds = (look) => {
      const { colors } = bodyMesh(resolveRecipe({ ...look, colors: { hair } }));
      let n = 0;
      for (let i = 0; i < colors.length; i += 3) if (colors[i] === 1 && colors[i + 1] === 0) n++;
      return n;
    };
    expect(reds({ hair: "bald" })).toBe(0);
    expect(reds({ hair: "short" })).toBeGreaterThan(0);
    expect(reds({ hair: "long" })).toBeGreaterThan(reds({ hair: "short" }));
  });
});
