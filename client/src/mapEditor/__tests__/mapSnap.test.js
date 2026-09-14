import {describe, it, expect} from "vitest";
import {collectSnapPoints, nearestSnapPoint} from "../mapSnap";

function mapData(overrides = {}) {
  return {barriers: [], connections: [], ...overrides};
}

describe("collectSnapPoints", () => {
  it("collects wall vertices, circle centers, connection positions, and line endpoints", () => {
    const data = mapData({
      barriers: [
        {type: "wall", locations: [{x: 0, y: 0}, {x: 10, y: 0}]},
        {type: "circle", location: {x: 5, y: 5}, radius: 2},
      ],
      connections: [
        {type: "point", position: {x: 1, y: 1, angle: 0}},
        {type: "line", start: {x: 2, y: 2}, end: {x: 3, y: 3}},
      ],
    });

    const points = collectSnapPoints(data, null);

    expect(points).toEqual(
      expect.arrayContaining([
        {x: 0, y: 0}, {x: 10, y: 0}, {x: 5, y: 5}, {x: 1, y: 1, angle: 0}, {x: 2, y: 2}, {x: 3, y: 3},
      ])
    );
    expect(points.length).toBe(6);
  });

  it("excludes the wall point currently being dragged", () => {
    const data = mapData({barriers: [{type: "wall", locations: [{x: 0, y: 0}, {x: 10, y: 0}]}]});
    const points = collectSnapPoints(data, {kind: "wall-point", barrierIndex: 0, pointIndex: 0});
    expect(points).toEqual([{x: 10, y: 0}]);
  });

  it("excludes the circle currently being dragged", () => {
    const data = mapData({barriers: [{type: "circle", location: {x: 5, y: 5}, radius: 2}]});
    const points = collectSnapPoints(data, {kind: "circle", barrierIndex: 0});
    expect(points).toEqual([]);
  });

  it("excludes the connection point currently being dragged", () => {
    const data = mapData({connections: [{type: "point", position: {x: 1, y: 1, angle: 0}}]});
    const points = collectSnapPoints(data, {kind: "connection-point", connectionIndex: 0});
    expect(points).toEqual([]);
  });

  it("excludes only the specific line endpoint currently being dragged, not the other one", () => {
    const data = mapData({connections: [{type: "line", start: {x: 2, y: 2}, end: {x: 3, y: 3}}]});
    const points = collectSnapPoints(data, {kind: "connection-endpoint", connectionIndex: 0, endpoint: "start"});
    expect(points).toEqual([{x: 3, y: 3}]);
  });
});

describe("nearestSnapPoint", () => {
  it("returns the closest candidate within the snap radius", () => {
    const candidates = [{x: 0, y: 0}, {x: 1, y: 1}];
    expect(nearestSnapPoint(candidates, {x: 1.1, y: 1.1})).toEqual({x: 1, y: 1});
  });

  it("returns null when nothing is within the snap radius (2ft)", () => {
    const candidates = [{x: 0, y: 0}];
    expect(nearestSnapPoint(candidates, {x: 5, y: 5})).toBeNull();
  });

  it("returns null for an empty candidate list", () => {
    expect(nearestSnapPoint([], {x: 0, y: 0})).toBeNull();
  });
});
