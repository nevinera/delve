import { describe, it, expect } from "vitest";
import * as THREE from "three";
import { createNpcToken, setTokenTagDimmed, computeTargetLineDots, targetLineColor } from "../scene";

describe("createNpcToken", () => {
  it("stores the hostility body color for later dimming", () => {
    const group = createNpcToken(2, "hostile", null, null);
    expect(group._baseColor).toBe(0xc62828);
    expect(group._dimmed).toBe(false);
    expect(group._bodyMaterial.color.getHex()).toBe(0xc62828);
  });

  it("falls back to the hostile color for an unknown hostility", () => {
    const group = createNpcToken(2, "unknown", null, null);
    expect(group._baseColor).toBe(0xc62828);
  });
});

describe("targetLineColor", () => {
  it("returns orange while attacking", () => {
    expect(targetLineColor(true)).toBe(0xff8c1a);
  });

  it("returns green while not attacking", () => {
    expect(targetLineColor(false)).toBe(0x00ff44);
  });
});

describe("computeTargetLineDots", () => {
  it("places one dot when self and target coincide", () => {
    const dots = computeTargetLineDots(0, 0, 0, 0, 2.0, 64);
    expect(dots).toEqual([[0, 0]]);
  });

  it("spaces dots evenly along the line, endpoints included", () => {
    const dots = computeTargetLineDots(0, 0, 10, 0, 2.0, 64);
    expect(dots.length).toBe(6);
    expect(dots[0]).toEqual([0, 0]);
    expect(dots[dots.length - 1]).toEqual([10, 0]);
  });

  it("caps the dot count at maxDots", () => {
    const dots = computeTargetLineDots(0, 0, 1000, 0, 2.0, 5);
    expect(dots.length).toBe(5);
  });

  it("interpolates z alongside x for a diagonal line", () => {
    const dots = computeTargetLineDots(0, 0, 4, 4, 2.0, 64);
    expect(dots[dots.length - 1]).toEqual([4, 4]);
  });
});

describe("setTokenTagDimmed", () => {
  it("blends the body color toward grey when dimmed", () => {
    const group = createNpcToken(2, "hostile", null, null);
    setTokenTagDimmed(group, true);

    expect(group._dimmed).toBe(true);
    const expected = new THREE.Color(0xc62828).lerp(new THREE.Color(0x808080), 0.6);
    expect(group._bodyMaterial.color.getHex()).toBe(expected.getHex());
    expect(group._bodyMaterial.color.getHex()).not.toBe(0xc62828);
  });

  it("restores the base color when undimmed", () => {
    const group = createNpcToken(2, "hostile", null, null);
    setTokenTagDimmed(group, true);
    setTokenTagDimmed(group, false);

    expect(group._dimmed).toBe(false);
    expect(group._bodyMaterial.color.getHex()).toBe(0xc62828);
  });

  it("is a no-op when the dimmed state is unchanged", () => {
    const group = createNpcToken(2, "hostile", null, null);
    setTokenTagDimmed(group, false);

    expect(group._dimmed).toBe(false);
    expect(group._bodyMaterial.color.getHex()).toBe(0xc62828);
  });
});
