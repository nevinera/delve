import { describe, it, expect } from "vitest";
import { BONE_NAMES, bodyMesh, skeleton } from "./body.js";
import { SKELETONS } from "./frames.js";
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

  it("sets the arms and legs apart by the shoulders and hips", () => {
    const at = (look) => Object.fromEntries(skeleton(resolveRecipe(look)).map((b) => [b.name, b.at]));
    const [narrow, broad] = [at({ shoulders: 0, hips: 0 }), at({ shoulders: 1, hips: 1 })];
    expect(broad.thigh_l[0]).toBeGreaterThan(narrow.thigh_l[0]);
    expect(broad.upperarm_l[0]).toBeGreaterThan(narrow.upperarm_l[0]);
  });
});

describe("bodyMesh", () => {
  it("stands as tall as the look says", () => {
    expect(tallest(bodyMesh(resolveRecipe({ height: 6 })).positions)).toBeCloseTo(6, 0);
    expect(tallest(bodyMesh(resolveRecipe({ height: 7.5 })).positions)).toBeCloseTo(7.5, 0);
  });

  it("weights every corner to real bones, summing to 1", () => {
    const { bones, skinIndex, skinWeight } = bodyMesh(resolveRecipe({ hair: "braids", beard: "handlebar", jewelry: ["earrings", "necklace"] }));
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

describe("proportions", () => {
  const lowest = (positions) => Math.min(...positions.filter((_, i) => i % 3 === 1));
  const bones = (look) => Object.fromEntries(bodyMesh(resolveRecipe(look)).bones.map((b) => [b.name, b.at]));
  const length = (a, b) => Math.hypot(...a.map((v, i) => v - b[i]));

  it("keeps the height and the feet on the ground, whatever the arms, legs and head", () => {
    for (const look of [{ arms: 0, legs: 0, head: 1 }, { arms: 1, legs: 1, head: 0 }]) {
      const { positions } = bodyMesh(resolveRecipe({ height: 6, ...look }));
      expect(tallest(positions)).toBeCloseTo(6, 0);
      expect(lowest(positions)).toBeCloseTo(0, 0);
    }
  });

  it("lengthens the arms and legs", () => {
    const [short, long] = [bones({ arms: 0, legs: 0 }), bones({ arms: 1, legs: 1 })];
    expect(length(long.upperarm_l, long.hand_l)).toBeGreaterThan(length(short.upperarm_l, short.hand_l) * 1.2);
    expect(long.pelvis[1]).toBeGreaterThan(short.pelvis[1] * 1.1);
  });
});

describe("creature extras", () => {
  // One test a body, since each takes a while to build.
  it.each(SKELETONS.humanoid)("builds %s, its tail and wings on bones of their own", (body) => {
    const look = resolveRecipe({ body, loadouts: [] });
    const mesh = bodyMesh(look);
    expect(mesh.positions.every(Number.isFinite)).toBe(true);
    expect(Math.max(...mesh.skinIndex)).toBeLessThan(mesh.bones.length);
    const names = mesh.bones.map((b) => b.name);
    expect(names.includes("tail_01")).toBe(look.tail !== "none");
    expect(names.includes("wing_01_r")).toBe(look.wings !== "none");
  });

  it("gives the second pair of arms, goat's legs and a drake's body bones of their own", () => {
    const names = (look) => skeleton(resolveRecipe(look)).map((b) => b.name);
    expect(names({ lowerArms: "pair" })).toEqual(expect.arrayContaining(["upperarm2_l", "hand2_r"]));
    expect(names({ lower: "drake" })).toEqual(expect.arrayContaining(["fore_01_l", "hind_03_r", "horsetail_05"]));
    const at = (look) => Object.fromEntries(skeleton(resolveRecipe(look)).map((b) => [b.name, b.at]));
    // Goat's legs bend the knee forward and the hock back.
    const [legs, hocked] = [at({}), at({ lower: "hocked" })];
    expect(hocked.calf_l[2]).toBeGreaterThan(legs.calf_l[2]);
    expect(hocked.foot_l[2]).toBeLessThan(legs.foot_l[2]);
  });

  it.each(["boric", "ursol", "trog", "homari", "tyrshaug", "drakel", "abomination", "ghoul", "mummy", "lich", "banshee", "ghost", "deepshaug", "smoulder", "treant", "dryad", "succubus", "hivelord", "cindershaug", "golem", "mycosi", "drakesh"])("stands %s on the ground", (body) => {
    const look = resolveRecipe({ body }, () => 0.5);
    const { positions } = bodyMesh(look);
    const ys = positions.filter((_, i) => i % 3 === 1);
    expect(Math.min(...ys)).toBeLessThan(0.15 * look.height);
    expect(Math.min(...ys)).toBeGreaterThan(-0.05 * look.height);
  });

  it.each(Object.entries({ flesh: ["fur", "shell", "chitin", "wrapped", "spirit", "shadow", "bark", "fungal", "molten", "stitched"], hands: ["pincers"], muzzle: ["boar", "bear", "insect"], hair: ["cap", "branches", "leaves"], horns: ["antennae", "antlers"] }).flatMap(([key, values]) => values.map((value) => [key, value])))("builds a %s of %s", (key, value) => {
    const look = resolveRecipe({ [key]: value });
    expect(look[key]).toBe(value);
    expect(bodyMesh(look).positions.every(Number.isFinite)).toBe(true);
  });
});
