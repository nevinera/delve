import { describe, expect, it } from "vitest";
import { characterMesh } from "./characterMesh.js";
import { resolveRecipe } from "./recipe.js";
import { WeaponDraw } from "./weaponDraw.js";

const holding = (weapon) => characterMesh({ ...resolveRecipe(), weapon, sheathed: true });
const inHand = (mesh) => mesh.userData.held[0].parent.name === "hand_r";

describe("reaching for a weapon", () => {
  it("reaches over the shoulder or to the hip, and moves the weapon when the hand gets there", () => {
    const mesh = holding("greatsword");
    const draw = new WeaponDraw(mesh);
    expect(draw.update(0, false)).toBeNull();
    const going = draw.update(1, true);
    expect(going).toMatchObject({ name: "Draw_Back", at: 1 });
    expect(inHand(mesh)).toBe(false);
    expect(draw.update(1.05, true)).toBe(going);
    expect(inHand(mesh)).toBe(false);
    expect(draw.update(1.12, true)).toBe(going);
    expect(inHand(mesh)).toBe(true);
    expect(draw.update(1.2, true)).toBeNull();
    expect(new WeaponDraw(holding("sword")).update(0, true).name).toBe("Draw_Hip");
  });

  it("puts it away the same way, more slowly", () => {
    const mesh = holding("sword");
    const draw = new WeaponDraw(mesh);
    draw.update(0, true);
    draw.update(1, true);
    expect(draw.update(2, false).name).toBe("Draw_Hip");
    expect(inHand(mesh)).toBe(true);
    expect(draw.update(2.2, false)).not.toBeNull();
    expect(inHand(mesh)).toBe(false);
    expect(draw.update(2.4, false)).toBeNull();
  });

  it("changes its mind partway through", () => {
    const mesh = holding("sword");
    const draw = new WeaponDraw(mesh);
    draw.update(0, true);
    expect(draw.update(0.02, false).name).toBe("Draw_Hip");
    expect(inHand(mesh)).toBe(true);
  });

  it("has nothing to reach for with empty hands", () => {
    const mesh = holding("none");
    expect(new WeaponDraw(mesh).update(0, true)).toBeNull();
    expect(mesh.userData.weaponsDrawn).toBe(true);
  });
});
