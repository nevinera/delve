import {describe, expect, it} from "vitest";
import {hitStamp, rotationToward, scaleToward, stampBox, stampCorners, stampHandles, toLocal} from "../stampGeometry";

const sets = {camp: {imageUrl: "c.png", stamps: {log: {feetWidth: 8, frames: [{x: 0, y: 0, width: 40, height: 20}]}}}};
const sheets = {camp: {naturalWidth: 40, naturalHeight: 20}};
const log = (fields = {}) => ({stamp: "camp/log", x: 10, y: 10, ...fields});
const close = (point, x, y) => {
  expect(point.x).toBeCloseTo(x);
  expect(point.y).toBeCloseTo(y);
};

describe("stampGeometry", () => {
  it("sizes a stamp, or gives null without its sheet", () => {
    expect(stampBox(sets, sheets, log({scale: 2}))).toEqual({width: 16, height: 8});
    expect(stampBox(sets, {}, log())).toBeNull();
  });

  it("finds the topmost stamp under a point, rotation included", () => {
    const stamps = [log(), log({x: 12})];
    expect(hitStamp(stamps, sets, sheets, {x: 7, y: 10})).toBe(0);
    expect(hitStamp(stamps, sets, sheets, {x: 13, y: 10})).toBe(1);
    expect(hitStamp(stamps, sets, sheets, {x: 10, y: 13})).toBe(-1);
    expect(hitStamp([log({rotation: 90})], sets, sheets, {x: 10, y: 13})).toBe(0);
  });

  it("puts corners and handles where the rotation takes them", () => {
    const turned = log({rotation: 90});
    const box = stampBox(sets, sheets, turned);
    close(stampCorners(turned, box)[0], 12, 6);
    close(toLocal(turned, {x: 12, y: 6}), -4, -2);
    const {rotate, scale} = stampHandles(turned, box, 3);
    close(rotate, 15, 10);
    close(scale, 8, 14);
  });

  it("rotates toward a point clockwise from north, snapping on request", () => {
    expect(rotationToward(log(), {x: 10, y: 0})).toBe(0);
    expect(rotationToward(log(), {x: 20, y: 10})).toBe(90);
    expect(rotationToward(log(), {x: 0, y: 10})).toBe(270);
    expect(rotationToward(log(), {x: 20, y: 1}, true)).toBe(45);
  });

  it("scales so the corner reaches the point", () => {
    const box = stampBox(sets, sheets, log());
    expect(scaleToward(log(), box, {x: 18, y: 14})).toBe(2);
    expect(scaleToward(log(), box, {x: 10, y: 10})).toBe(0.1);
  });
});
