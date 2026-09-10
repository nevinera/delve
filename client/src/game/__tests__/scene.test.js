import { describe, it, expect } from "vitest";
import * as THREE from "three";
import { createNpcToken, setTokenTagDimmed, computeTargetLineDots, targetLineColor, edgeTowards, closestSentPosition, reconciledTarget } from "../scene";

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

describe("edgeTowards", () => {
  it("offsets toward the other point by the radius", () => {
    expect(edgeTowards({ x: 0, y: 0, radius: 2 }, { x: 10, y: 0 })).toEqual({ x: 2, y: 0 });
  });

  it("returns the position unchanged when it has no radius", () => {
    const pos = { x: 0, y: 0 };
    expect(edgeTowards(pos, { x: 10, y: 0 })).toBe(pos);
  });

  it("returns the position unchanged when it coincides with the other point", () => {
    const pos = { x: 5, y: 5, radius: 2 };
    expect(edgeTowards(pos, { x: 5, y: 5 })).toBe(pos);
  });

  it("returns the position unchanged when either point is missing", () => {
    const pos = { x: 0, y: 0, radius: 2 };
    expect(edgeTowards(pos, null)).toBe(pos);
    expect(edgeTowards(null, { x: 10, y: 0 })).toBe(null);
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

describe("closestSentPosition", () => {
  it("returns the entry nearest in value to the given position", () => {
    const history = [{ x: 0, y: 0 }, { x: 10, y: 10 }, { x: 20, y: 0 }];
    expect(closestSentPosition(history, 19, 1)).toEqual({ x: 20, y: 0 });
  });

  it("returns null for an empty history", () => {
    expect(closestSentPosition([], 5, 5)).toBeNull();
  });
});

describe("reconciledTarget", () => {
  it("targets the current position unchanged when the echo exactly matches a sent position", () => {
    const history = [{ x: 5, y: 5 }, { x: 10, y: 8 }];
    // Server echoed back exactly what was sent - no real correction.
    expect(reconciledTarget(history, 10, 8, 10, 8)).toEqual({ x: 10, y: 8 });
  });

  it("does not yank the target back to a stale echo once the client has since moved on", () => {
    const history = [{ x: 5, y: 0 }];
    // The echo matches an old send; the client has since predicted forward
    // to (12, 0). No correction was actually made (echo == matched send), so
    // the target should stay at the client's current position, not snap
    // back to the stale (5, 0).
    expect(reconciledTarget(history, 12, 0, 5, 0)).toEqual({ x: 12, y: 0 });
  });

  it("applies a genuine server correction (e.g. a wall clamp) as an offset from the current position", () => {
    const history = [{ x: 10, y: 0 }];
    // Client asked to move to (10, 0) but the server clamped it to (7, 0)
    // (e.g. a wall 3ft short of the requested move). The client has since
    // predicted forward to (12, 0); the same 3ft correction should apply
    // there too, not replace it with the stale absolute value.
    expect(reconciledTarget(history, 12, 0, 7, 0)).toEqual({ x: 9, y: 0 });
  });

  it("falls back to the raw echoed position when there's no history to match against", () => {
    expect(reconciledTarget([], 0, 0, 42, 7)).toEqual({ x: 42, y: 7 });
  });
});
