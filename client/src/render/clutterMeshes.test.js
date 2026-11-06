import { describe, expect, it } from "vitest";

// The module draws a texture on a canvas as it loads; here there's no page, so it draws on nothing.
const nothing = new Proxy(() => nothing, { get: (_, key) => (key === Symbol.toPrimitive ? () => 0 : nothing), apply: () => nothing });
globalThis.document ??= { createElement: () => ({ getContext: () => nothing }) };
const { ClutterSet, clutterMeshes, fadedOut, gatherClutter, ownNumber, prepareClutter } = await import("./clutterMeshes.js");
const THREE = await import("three");

// Grass in a row going east from the focus, a foot apart.
const row = (count) =>
  Array.from({ length: count }, (_, k) => ({ kind: "grass", x: k, y: 0, z: 0.5, yaw: 0, scale: 1, normal: [0, 1, 0], colors: [[0.2, 0.5, 0.1], [0.2, 0.5, 0.1], [0.2, 0.5, 0.1]] }));
const drawn = (meshes) => meshes.reduce((n, m) => n + m.count, 0);

describe("ownNumber", () => {
  it("is the same for the same spot and spread over 0 to 1", () => {
    expect(ownNumber(12.5, -40)).toBe(ownNumber(12.5, -40));
    const numbers = Array.from({ length: 2000 }, (_, k) => ownNumber(k * 3.7, k * -1.3));
    expect(Math.min(...numbers)).toBeGreaterThanOrEqual(0);
    expect(Math.max(...numbers)).toBeLessThan(1);
    expect(numbers.filter((n) => n < 0.5).length / numbers.length).toBeCloseTo(0.5, 1);
  });
});

describe("fadedOut", () => {
  it("keeps everything near, nothing past the radius, and more of the high numbers between", () => {
    expect(fadedOut(0.01, 100, 240)).toBe(false);
    expect(fadedOut(0.99, 240, 240)).toBe(true);
    expect([fadedOut(0.2, 200, 240), fadedOut(0.9, 200, 240)]).toEqual([true, false]);
  });
});

describe("gatherClutter", () => {
  it("leaves out what's faded out wherever the focus goes within the margin", () => {
    const meshes = clutterMeshes(row(300), [0, 0]);
    const all = drawn(meshes);
    gatherClutter(meshes, 0, 0, 240, 1, 40);
    const kept = drawn(meshes);
    expect(kept).toBeLessThan(all);
    // Everything the shader would show from 40 ft nearer is still drawn.
    const showing = row(300).filter(({ x }) => x <= 280 && !fadedOut(ownNumber(x, 0.5), Math.max(0, x - 40), 240)).length;
    expect(kept).toBe(showing);
    for (const mesh of meshes) {
      const own = mesh.geometry.attributes.clutterOwn.array;
      for (let n = 0; n < mesh.count; n++) expect(own[n]).toBe(Math.fround(ownNumber(mesh.instanceMatrix.array[n * 16 + 12], 0.5)));
    }
  });
});

describe("ClutterSet", () => {
  it("draws what gatherClutter would from tiles' pieces, keeping its meshes as tiles go", () => {
    const pieces = row(300);
    const merged = clutterMeshes(pieces, [0, 0]);
    gatherClutter(merged, 0, 0, 240, 1, 40);
    const set = new ClutterSet(new THREE.Group());
    const chunks = [
      { slots: prepareClutter(pieces.slice(0, 150), [0, 0]), born: 1 },
      { slots: prepareClutter(pieces.slice(150), [0, 0]), born: 2 },
    ];
    set.gather(chunks, 0, 0, 240, 1, 40);
    const meshes = [...set.meshes.values()];
    expect(drawn(meshes)).toBe(drawn(merged));
    const born = meshes[0].geometry.attributes.clutterBorn.array;
    expect([born[0], born[meshes[0].count - 1]]).toEqual([1, 2]);
    set.gather(chunks.slice(0, 1), 0, 0, 240, 1, 40);
    expect([...set.meshes.values()]).toEqual(meshes);
    expect(drawn(meshes)).toBe(150);
  });
});
