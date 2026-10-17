import {describe, it, expect} from "vitest";
import {startPositionFor} from "../MapPreviewCanvas";

// MapPreviewCanvas itself mounts a real THREE.WebGLRenderer, which jsdom
// can't provide a context for (see the map editor plan's Phase 2 notes) -
// only this pure helper is covered.
describe("startPositionFor", () => {
  const feetDimensions = {width: 160, height: 120};

  it("starts at the visible-area center when given one", () => {
    const mapData = {feetDimensions, connections: [{type: "point", position: {x: 1, y: 2, angle: 0}}]};
    expect(startPositionFor(mapData, {x: 100, y: 70})).toEqual({x: 100, y: 70});
  });

  it("uses the entrance nearest the view center when that spot is off the map", () => {
    const mapData = {feetDimensions, connections: [
      {type: "point", position: {x: 10, y: 10, angle: 0}},
      {type: "point", position: {x: 150, y: 110, angle: 0}},
    ]};
    expect(startPositionFor(mapData, {x: 200, y: 130})).toEqual({x: 150, y: 110});
  });

  it("uses the nearest entrance when the view center is inside a circle barrier", () => {
    const mapData = {feetDimensions, barriers: [{type: "circle", location: {x: 100, y: 70}, radius: 10}],
      connections: [{type: "point", position: {x: 10, y: 10, angle: 0}}]};
    expect(startPositionFor(mapData, {x: 100, y: 70})).toEqual({x: 10, y: 10});
  });

  it("uses the nearest entrance when the view center is against a wall", () => {
    const mapData = {feetDimensions, barriers: [{type: "wall", locations: [{x: 90, y: 0}, {x: 90, y: 120}]}],
      connections: [{type: "point", position: {x: 10, y: 10, angle: 0}}]};
    expect(startPositionFor(mapData, {x: 91, y: 60})).toEqual({x: 10, y: 10});
  });

  it("uses the nearest entrance when the view center is walled off from every entrance", () => {
    const ring = [{x: 60, y: 30}, {x: 140, y: 30}, {x: 140, y: 100}, {x: 60, y: 100}, {x: 60, y: 30}];
    const mapData = {feetDimensions, barriers: [{type: "wall", locations: ring}],
      connections: [{type: "point", position: {x: 10, y: 10, angle: 0}}]};
    expect(startPositionFor(mapData, {x: 100, y: 65})).toEqual({x: 10, y: 10});
    expect(startPositionFor(mapData, {x: 30, y: 60})).toEqual({x: 30, y: 60});
  });

  it("starts inside walls when an entrance is inside them", () => {
    const ring = [{x: 60, y: 30}, {x: 140, y: 30}, {x: 140, y: 100}, {x: 60, y: 100}, {x: 60, y: 30}];
    const mapData = {feetDimensions, barriers: [{type: "wall", locations: ring}],
      connections: [{type: "point", position: {x: 100, y: 50, angle: 0}}]};
    expect(startPositionFor(mapData, {x: 30, y: 60})).toEqual({x: 100, y: 50});
    expect(startPositionFor(mapData, {x: 90, y: 70})).toEqual({x: 90, y: 70});
  });

  it("clamps the view center to the map when there are no entrances", () => {
    expect(startPositionFor({feetDimensions}, {x: -5, y: 500})).toEqual({x: 0, y: 120});
  });

  it("starts at the map center, else its nearest entrance, with no view", () => {
    const blocked = {feetDimensions, barriers: [{type: "circle", location: {x: 80, y: 60}, radius: 5}],
      connections: [{type: "point", position: {x: 3, y: 4, angle: 0}}]};
    expect(startPositionFor({feetDimensions})).toEqual({x: 80, y: 60});
    expect(startPositionFor(blocked)).toEqual({x: 3, y: 4});
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
