import {describe, it, expect} from "vitest";
import {startPositionFor} from "../MapPreviewCanvas";

// MapPreviewCanvas itself mounts a real THREE.WebGLRenderer, which jsdom
// can't provide a context for (see the map editor plan's Phase 2 notes) -
// only this pure helper is covered.
describe("startPositionFor", () => {
  const feetDimensions = {width: 160, height: 120};

  it("uses a point connection's position when the map has one", () => {
    const mapData = {feetDimensions, connections: [{type: "point", position: {x: 12, y: 34, angle: 0}}]};
    expect(startPositionFor(mapData)).toEqual({x: 12, y: 34});
  });

  it("uses a line connection's midpoint when the map's first connection is a line", () => {
    const mapData = {feetDimensions, connections: [{type: "line", start: {x: 0, y: 0}, end: {x: 20, y: 10}}]};
    expect(startPositionFor(mapData)).toEqual({x: 10, y: 5});
  });

  it("falls back to the map's center when there are no connections", () => {
    const mapData = {feetDimensions, connections: []};
    expect(startPositionFor(mapData)).toEqual({x: 80, y: 60});
  });

  it("falls back to the map's center when connections is undefined", () => {
    const mapData = {feetDimensions};
    expect(startPositionFor(mapData)).toEqual({x: 80, y: 60});
  });
});
