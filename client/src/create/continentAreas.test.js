import * as THREE from "three";
import { beforeAll, describe, expect, it } from "vitest";
import { ContinentAreas, ownerOf } from "./continentAreas.js";

const square = (x, z, r) => [[x - r, z - r], [x + r, z - r], [x + r, z + r], [x - r, z + r]];

beforeAll(() => {
  globalThis.document ??= { createElement: () => ({ getContext: () => null }) };
});

function areas(rests) {
  const a = new ContinentAreas(new THREE.Scene(), () => 0, { append() {} }, () => rests);
  a.onRest = (rest, id) => (rest.area = id);
  return a;
}

describe("a continent's areas", () => {
  const rests = () => [
    { id: "resta", continent: "main", at: [0, 0] },
    { id: "restb", continent: "main", at: [100, 0] },
  ];

  it("go to the rest point inside them, or else the nearest", () => {
    const here = rests();
    expect(ownerOf(square(100, 0, 10), here).id).toBe("restb");
    expect(ownerOf(square(30, 0, 5), here).id).toBe("resta");
    expect(ownerOf(square(0, 0, 5), [])).toBe(null);
  });

  it("read and write regions.json, with their ids, colored by whether a rest point points at them", () => {
    const here = rests();
    here[0].area = "area0001";
    const a = areas(here);
    a.load({ version: 1, areas: [{ id: "area0001", points: square(0, 0, 10) }, { id: "area0002", points: square(50, 50, 10) }, { id: "bad", points: [] }] });
    expect(a.areas.map((x) => x.kind)).toEqual(["resting", "area"]);
    expect(a.toJSON()).toEqual({ version: 1, areas: [{ id: "area0001", points: square(0, 0, 10) }, { id: "area0002", points: square(50, 50, 10) }] });
  });

  it("drawn for rest points go to their owner, and others go to none", () => {
    const here = rests();
    const a = areas(here);
    a.mode = "rest";
    const resting = a.addArea("area", square(100, 0, 10));
    expect(here[1].area).toBe(resting.id);
    expect(resting.id).toMatch(/^area[0-9a-z]{4}$/);
    expect(resting.kind).toBe("resting");
    a.mode = null;
    const plain = a.addArea("area", square(0, 0, 10));
    expect(here[0].area).toBeUndefined();
    expect(plain.kind).toBe("area");
    expect(a.byId(plain.id)).toBe(plain);
  });
});
