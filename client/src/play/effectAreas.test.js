import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { EffectAreaMarks, markOf } from "./effectAreas.js";

describe("markOf", () => {
  it("draws a circle as a ring, and a line as a strip the way it runs", () => {
    expect(markOf({ radius: 8 })).toEqual({ shape: "ring", radius: 8 });
    const strip = markOf({ radius: 30, line: true, width: 4, dir: [1, 0] });
    expect(strip).toMatchObject({ shape: "strip", length: 30, width: 4 });
    expect(strip.turn).toBeCloseTo(Math.PI / 2);
  });
});

describe("EffectAreaMarks", () => {
  const view = () => ({ scene: new THREE.Scene(), origin: [100, 200] });
  const area = { id: 1, affects: "enemies", at: [110, 5, 220], radius: 8, dir: [0, 1], lasts: 2 };

  it("puts a mark where the area is, until it runs out", () => {
    const v = view();
    const marks = new EffectAreaMarks(v);
    marks.add(area, 0);
    const { group } = marks.marks.get(1).draped;
    expect(group.position.x).toBe(10);
    expect(group.position.z).toBe(20);
    marks.frame(1000, () => null);
    expect(v.scene.children).toHaveLength(1);
    marks.frame(2000, () => null);
    expect(v.scene.children).toHaveLength(0);
  });

  it("moves one that follows someone", () => {
    const marks = new EffectAreaMarks(view());
    marks.add({ ...area, follows: 5 }, 0);
    marks.frame(1, (id) => (id === 5 ? new THREE.Vector3(1, 2, 3) : null));
    const { group } = marks.marks.get(1).draped;
    expect(group.position.x).toBe(1);
    expect(group.position.z).toBe(3);
  });

  it("follows the ground under it, and again where it's followed someone to", () => {
    const v = { ...view(), renditions: { heightAt: (x) => x } };
    const marks = new EffectAreaMarks(v);
    marks.add({ ...area, at: [100, 0, 200], follows: 5 }, 0);
    const { group } = marks.marks.get(1).draped;
    const { position } = group.children[0].geometry.attributes;
    expect(position.getY(1)).toBeCloseTo(position.getX(1) + 0.2, 4);
    marks.frame(1, () => new THREE.Vector3(10, 10, 0));
    expect(position.getY(1)).toBeCloseTo(position.getX(1) + 0.2, 4);
    expect(group.position.x).toBe(10);
  });

  it("turns a strip the way it runs when it follows the ground", () => {
    const v = { ...view(), renditions: { heightAt: (x) => x } };
    const marks = new EffectAreaMarks(v);
    marks.add({ id: 2, affects: "enemies", at: [100, 0, 200], radius: 30, line: true, width: 4, dir: [1, 0], lasts: 2 }, 0);
    const { position } = marks.marks.get(2).draped.group.children[0].geometry.attributes;
    const far = position.count - 1; // the end of the strip, 30 ft along +x once it's turned
    expect(position.getY(far)).toBeCloseTo(30.2, 3);
  });

  it("forgets one that's gone early", () => {
    const v = view();
    const marks = new EffectAreaMarks(v);
    marks.add(area, 0);
    marks.remove(1);
    marks.remove(1);
    expect(v.scene.children).toHaveLength(0);
  });
});
