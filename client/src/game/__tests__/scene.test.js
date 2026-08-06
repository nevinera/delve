import { describe, it, expect } from "vitest";
import * as THREE from "three";
import { createNpcToken, setTokenTagDimmed } from "../scene";

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
