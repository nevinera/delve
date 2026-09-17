import { describe, it, expect } from "vitest";
import * as THREE from "three";
import {
  createNpcToken,
  setTokenTagDimmed,
  computeTargetLineDots,
  targetLineColor,
  edgeTowards,
  reconciledTarget,
  clampZoom,
  pinchZoom,
  pointerDistance,
  orbitFromDrag,
  orbitFromStick,
  isTap,
  buildCircleBarrier,
} from "../scene";

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

describe("reconciledTarget", () => {
  it("targets the current position unchanged when the echo exactly matches what was sent", () => {
    const matched = { x: 10, y: 8 };
    // Server echoed back exactly what was sent - no real correction.
    expect(reconciledTarget(matched, 10, 8, 10, 8)).toEqual({ x: 10, y: 8 });
  });

  it("does not yank the target back to a stale echo once the client has since moved on", () => {
    const matched = { x: 5, y: 0 };
    // The echo matches an old send; the client has since predicted forward
    // to (12, 0). No correction was actually made (echo == matched send), so
    // the target should stay at the client's current position, not snap
    // back to the stale (5, 0).
    expect(reconciledTarget(matched, 12, 0, 5, 0)).toEqual({ x: 12, y: 0 });
  });

  it("applies a genuine server correction (e.g. a wall clamp) as an offset from the current position", () => {
    const matched = { x: 10, y: 0 };
    // Client asked to move to (10, 0) but the server clamped it to (7, 0)
    // (e.g. a wall 3ft short of the requested move). The client has since
    // predicted forward to (12, 0); the same 3ft correction should apply
    // there too, not replace it with the stale absolute value.
    expect(reconciledTarget(matched, 12, 0, 7, 0)).toEqual({ x: 9, y: 0 });
  });

  it("falls back to the raw echoed position when there's nothing to match against", () => {
    expect(reconciledTarget(null, 0, 0, 42, 7)).toEqual({ x: 42, y: 7 });
  });
});

describe("clampZoom", () => {
  it("clamps below the minimum", () => {
    expect(clampZoom(0)).toBe(0.5);
  });

  it("clamps above the maximum", () => {
    expect(clampZoom(10)).toBe(1.5);
  });

  it("passes through values already in range", () => {
    expect(clampZoom(1)).toBe(1);
  });
});

describe("pinchZoom", () => {
  it("zooms in (decreases camZoom) when fingers spread apart", () => {
    expect(pinchZoom(1.0, 150, 100)).toBeLessThan(1.0);
  });

  it("zooms out (increases camZoom) when fingers pinch together", () => {
    expect(pinchZoom(1.0, 100, 150)).toBeGreaterThan(1.0);
  });

  it("is a no-op when finger distance is unchanged", () => {
    expect(pinchZoom(1.2, 100, 100)).toBe(1.2);
  });

  it("clamps a huge spread to the zoom minimum", () => {
    expect(pinchZoom(0.5, 1000, 0)).toBe(0.5);
  });

  it("clamps a huge pinch to the zoom maximum", () => {
    expect(pinchZoom(1.5, 0, 1000)).toBe(1.5);
  });
});

describe("pointerDistance", () => {
  it("computes the euclidean distance between two points", () => {
    expect(pointerDistance({ x: 0, y: 0 }, { x: 3, y: 4 })).toBe(5);
  });
});

describe("orbitFromDrag", () => {
  it("increases facing when dragging right", () => {
    expect(orbitFromDrag(0, 0.5, 10, 0).facing).toBeGreaterThan(0);
  });

  it("decreases facing when dragging left", () => {
    expect(orbitFromDrag(0, 0.5, -10, 0).facing).toBeLessThan(0);
  });

  it("leaves facing unchanged for a purely vertical drag", () => {
    expect(orbitFromDrag(1.2, 0.5, 0, 5).facing).toBe(1.2);
  });

  it("clamps pitch to the minimum when dragging far up", () => {
    expect(orbitFromDrag(0, 0.5, 0, -1000).pitch).toBeCloseTo(20 * (Math.PI / 180));
  });

  it("clamps pitch to the maximum when dragging far down", () => {
    expect(orbitFromDrag(0, 0.5, 0, 1000).pitch).toBeCloseTo(60 * (Math.PI / 180));
  });
});

describe("orbitFromStick", () => {
  it("increases facing when pushed right", () => {
    expect(orbitFromStick(0, 0.5, 1, 0, 1).facing).toBeGreaterThan(0);
  });

  it("decreases facing when pushed left", () => {
    expect(orbitFromStick(0, 0.5, -1, 0, 1).facing).toBeLessThan(0);
  });

  it("leaves facing unchanged for a purely vertical deflection", () => {
    expect(orbitFromStick(1.2, 0.5, 0, 1, 1).facing).toBe(1.2);
  });

  it("scales facing change by elapsed time", () => {
    const half = orbitFromStick(0, 0.5, 1, 0, 0.5).facing;
    const full = orbitFromStick(0, 0.5, 1, 0, 1).facing;
    expect(half).toBeCloseTo(full / 2);
  });

  it("decreases pitch (looks up) when pulled back/down", () => {
    expect(orbitFromStick(0, 0.5, 0, -1, 1).pitch).toBeLessThan(0.5);
  });

  it("increases pitch (steeper overhead angle) when pushed forward/up", () => {
    expect(orbitFromStick(0, 0.5, 0, 1, 1).pitch).toBeGreaterThan(0.5);
  });

  it("clamps pitch to the minimum when pulled back/down for a long time", () => {
    expect(orbitFromStick(0, 0.5, 0, -1, 1000).pitch).toBeCloseTo(20 * (Math.PI / 180));
  });

  it("clamps pitch to the maximum when pushed forward/up for a long time", () => {
    expect(orbitFromStick(0, 0.5, 0, 1, 1000).pitch).toBeCloseTo(60 * (Math.PI / 180));
  });

  it("does nothing at zero elapsed time", () => {
    expect(orbitFromStick(1.2, 0.5, 1, 1, 0)).toEqual({ facing: 1.2, pitch: 0.5 });
  });
});

describe("isTap", () => {
  it("treats zero movement as a tap", () => {
    expect(isTap(0, 0)).toBe(true);
  });

  it("treats a small movement under the threshold as a tap", () => {
    expect(isTap(2, 2)).toBe(true); // dx^2+dy^2 = 8 < 9
  });

  it("treats a movement at the threshold as a drag", () => {
    expect(isTap(3, 0)).toBe(false); // dx^2+dy^2 = 9, not < 9
  });

  it("treats a larger movement as a drag", () => {
    expect(isTap(10, 10)).toBe(false);
  });
});

describe("buildCircleBarrier", () => {
  it("positions the group at the given world coordinates", () => {
    const group = buildCircleBarrier([5, -3], 2);
    expect(group.position.x).toBe(5);
    expect(group.position.z).toBe(-3);
  });

  it("sizes the cylinder geometry to the given radius", () => {
    const group = buildCircleBarrier([0, 0], 4);
    const [mesh] = group.children;
    expect(mesh.geometry.parameters.radiusTop).toBe(4);
    expect(mesh.geometry.parameters.radiusBottom).toBe(4);
  });
});
