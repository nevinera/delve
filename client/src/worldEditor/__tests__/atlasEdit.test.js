import {describe, it, expect} from "vitest";
import {bendLink, constrainMove, insertVertex, moveCorner, moveMap, moveZone, removeVertex} from "../atlasEdit";
import {rectCorners} from "../atlasGeometry";

const outline = (x, y, s) => rectCorners({x, y, width: s, height: s});
const sizes = {a: {m1: {width: 10, height: 10}, m2: {width: 10, height: 10}}, b: {m3: {width: 10, height: 10}}};
const atlas = {zones: {
  a: {outline: outline(0, 0, 40), maps: {m1: {x: 0, y: 0}, m2: {x: 20, y: 0}}},
  b: {outline: outline(40, 0, 40), maps: {m3: {x: 40, y: 0}}},
}};

describe("constrainMove", () => {
  it("goes all the way when it can, else slides, else stops short", () => {
    const wall = (p) => p.x <= 10;
    expect(constrainMove({x: 0, y: 0}, {x: 5, y: 5}, wall)).toEqual({x: 5, y: 5});
    const slid = constrainMove({x: 0, y: 0}, {x: 20, y: 5}, wall);
    expect(slid.x).toBeCloseTo(10, 1);
    expect(slid.y).toBe(5);
    const box = (p) => p.x <= 10 && p.y <= 10;
    const stopped = constrainMove({x: 0, y: 0}, {x: 20, y: 20}, box);
    expect(stopped.x).toBeCloseTo(10, 1);
    expect(stopped.y).toBeCloseTo(10, 1);
  });
});

describe("moveMap", () => {
  it("moves a map within its zone", () => {
    expect(moveMap(atlas, sizes, "a", "m1", {x: 5, y: 20}).zones.a.maps.m1).toEqual({x: 5, y: 20});
  });

  it("stops a map at its zone's edge", () => {
    expect(moveMap(atlas, sizes, "a", "m1", {x: 0, y: 50}).zones.a.maps.m1).toEqual({x: 0, y: 30});
  });

  it("slides a map along one in the way, not into it", () => {
    const moved = moveMap(atlas, sizes, "a", "m1", {x: 15, y: 5}).zones.a.maps.m1;
    expect(moved).toEqual({x: 10, y: 5});
  });
});

describe("moveZone", () => {
  it("moves a zone's outline and maps together", () => {
    const moved = moveZone(atlas, "a", {x: -10, y: 5}).zones.a;
    expect(moved.outline[0]).toEqual({x: -10, y: 5});
    expect(moved.maps.m2).toEqual({x: 10, y: 5});
  });

  it("stops a zone at another's outline", () => {
    expect(moveZone(atlas, "a", {x: 20, y: 0}).zones.a.outline[0]).toEqual({x: 0, y: 0});
  });
});

describe("moveCorner", () => {
  it("moves a corner freely outward", () => {
    expect(moveCorner(atlas, sizes, "a", 3, {x: -20, y: 60}).zones.a.outline[3]).toEqual({x: -20, y: 60});
  });

  it("won't cut into a map", () => {
    const corner = moveCorner(atlas, sizes, "a", 0, {x: 10, y: 10}).zones.a.outline[0];
    expect(corner).not.toEqual({x: 10, y: 10});
  });

  it("won't cross into another zone", () => {
    const corner = moveCorner(atlas, sizes, "a", 1, {x: 60, y: 0}).zones.a.outline[1];
    expect(corner.x).toBeLessThanOrEqual(40);
  });
});

describe("insertVertex", () => {
  it("splits an edge at its middle", () => {
    const outline = insertVertex(atlas, "a", 1).zones.a.outline;
    expect(outline).toHaveLength(5);
    expect(outline[2]).toEqual({x: 40, y: 20});
  });

  it("then lets the new vertex move like any other", () => {
    const split = insertVertex(atlas, "a", 3); // the west edge
    expect(moveCorner(split, sizes, "a", 4, {x: -30, y: 20}).zones.a.outline[4]).toEqual({x: -30, y: 20});
  });
});

describe("removeVertex", () => {
  it("removes a vertex the outline can do without", () => {
    const split = moveCorner(insertVertex(atlas, "a", 3), sizes, "a", 4, {x: -30, y: 20});
    expect(removeVertex(split, sizes, "a", 4).zones.a.outline).toEqual(atlas.zones.a.outline);
  });

  it("keeps at least 3, and won't cut into a map", () => {
    const triangle = {zones: {t: {outline: [{x: 0, y: 0}, {x: 10, y: 0}, {x: 0, y: 10}], maps: {}}}};
    expect(removeVertex(triangle, {}, "t", 0)).toBe(triangle);
    expect(removeVertex(atlas, sizes, "a", 0)).toBe(atlas); // the triangle left would cut m1
  });
});

describe("bendLink", () => {
  it("sets and clears a bend", () => {
    const bent = bendLink(atlas, "a/m1/n|a/m2/s", {x: 3.4, y: -7.6});
    expect(bent.bends).toEqual({"a/m1/n|a/m2/s": {x: 3, y: -8}});
    expect(bendLink(bent, "a/m1/n|a/m2/s", null)).not.toHaveProperty("bends");
  });
});
