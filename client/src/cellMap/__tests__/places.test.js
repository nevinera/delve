import {describe, it, expect} from "vitest";
import {mergePlaces, traceLabels, validateCellPlaces} from "../places";
import {generateCellMap} from "../generate";
import {CELL_SIZE, cellCenter, cellPoint} from "../hexGrid";

// Whether a point (feet) is inside a polygon in cell coordinates.
function inside({x, y}, polygon) {
  const feet = polygon.map(([c, r]) => cellPoint(c, r, CELL_SIZE));
  let hit = false;
  for (let i = 0, j = feet.length - 1; i < feet.length; j = i++) {
    const [a, b] = [feet[i], feet[j]];
    if ((a.y > y) !== (b.y > y) && x < ((b.x - a.x) * (y - a.y)) / (b.y - a.y) + a.x) hit = !hit;
  }
  return hit;
}

function area(polygon) {
  const feet = polygon.map(([c, r]) => cellPoint(c, r, CELL_SIZE));
  return Math.abs(feet.reduce((sum, a, i) => {
    const b = feet[(i + 1) % feet.length];
    return sum + a.x * b.y - b.x * a.y;
  }, 0)) / 2;
}

// The smallest place around a point is the one it's in.
function placeAt(point, places) {
  const around = places.filter((p) => inside(point, p.polygon));
  return around.sort((a, b) => area(a.polygon) - area(b.polygon))[0]?.identifier ?? null;
}

describe("traceLabels", () => {
  it("outlines each label, a label inside another being the smaller place there", () => {
    const grid = {cols: 12, rows: 10};
    const labelAt = (c, r) => (c >= 4 && c <= 7 && r >= 3 && r <= 6 ? 2 : c < 6 ? 0 : 1);
    const outlines = traceLabels(grid, labelAt);
    expect([...outlines.keys()].sort()).toEqual([0, 1, 2]);
    const places = [...outlines].map(([identifier, polygon]) => ({identifier, polygon}));
    for (let c = 0; c < grid.cols; c++) {
      for (let r = 0; r < grid.rows; r++) expect(placeAt(cellCenter(c, r, CELL_SIZE), places)).toBe(labelAt(c, r));
    }
  });

  it("leaves cells without a label out", () => {
    const outlines = traceLabels({cols: 8, rows: 8}, (c, r) => (c >= 2 && c <= 5 && r >= 2 && r <= 5 ? 0 : null));
    const places = [{identifier: 0, polygon: outlines.get(0)}];
    expect(placeAt(cellCenter(3, 3, CELL_SIZE), places)).toBe(0);
    expect(placeAt(cellCenter(0, 0, CELL_SIZE), places)).toBeNull();
    expect(placeAt(cellCenter(7, 4, CELL_SIZE), places)).toBeNull();
  });
});

describe("the generator's places", () => {
  it("put every cell of the map in a place, one per area", () => {
    const map = generateCellMap({cols: 40, rows: 30, seed: 7, connections: 3});
    expect(map.places.length).toBeGreaterThan(2);
    expect(map.places.map((p) => p.identifier)).toEqual(map.places.map((_, i) => `area_${i + 1}`));
    expect(validateCellPlaces(map.places)).toEqual([]);
    for (let r = 0; r < 30; r++) {
      for (let c = 0; c < 40; c++) expect(placeAt(cellCenter(c, r, CELL_SIZE), map.places)).not.toBeNull();
    }
  });
});

describe("validateCellPlaces", () => {
  const place = {identifier: "area_1", polygon: [[0, 0], [2, 0], [1, 1.5]]};

  it("accepts none, or well-formed places", () => {
    expect(validateCellPlaces(undefined)).toEqual([]);
    expect(validateCellPlaces([place, {...place, identifier: "area_2"}])).toEqual([]);
  });

  it("refuses bad identifiers, repeats and short polygons", () => {
    expect(validateCellPlaces([{...place, identifier: "Area 1"}])).toEqual([expect.stringMatching(/identifier/)]);
    expect(validateCellPlaces([place, place])).toEqual([expect.stringMatching(/second place/)]);
    expect(validateCellPlaces([{...place, polygon: [[0, 0], [1, 1]]}])).toEqual([expect.stringMatching(/three points/)]);
  });
});

describe("mergePlaces", () => {
  it("keeps what's known about a place outlined again, and places not outlined", () => {
    const places = [
      {identifier: "area_1", name: "Arren's Camp", tags: ["camp"], annotations: {plan: "three guards"}, polygon: [{x: 0, y: 0}]},
      {identifier: "drawn", polygon: [{x: 5, y: 5}]},
    ];
    const outlined = [{identifier: "area_1", polygon: [{x: 1, y: 1}]}, {identifier: "area_2", polygon: [{x: 2, y: 2}]}];
    expect(mergePlaces(places, outlined)).toEqual([
      places[1],
      {...places[0], polygon: [{x: 1, y: 1}]},
      outlined[1],
    ]);
  });
});
