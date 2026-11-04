import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { AreaMarks, markOf } from "./areas.js";

describe("markOf", () => {
  it("draws a circle as a ring, and a line as a strip the way it runs", () => {
    expect(markOf({ radius: 8 })).toEqual({ shape: "ring", radius: 8 });
    const strip = markOf({ radius: 30, line: true, width: 4, dir: [1, 0] });
    expect(strip).toMatchObject({ shape: "strip", length: 30, width: 4 });
    expect(strip.turn).toBeCloseTo(Math.PI / 2);
  });
});

describe("AreaMarks", () => {
  const view = () => ({ scene: new THREE.Scene(), origin: [100, 200] });
  const area = { id: 1, affects: "enemies", at: [110, 5, 220], radius: 8, dir: [0, 1], lasts: 2 };

  it("puts a mark where the area is, until it runs out", () => {
    const v = view();
    const marks = new AreaMarks(v);
    marks.add(area, 0);
    const { mesh } = marks.marks.get(1);
    expect(mesh.position.x).toBe(10);
    expect(mesh.position.z).toBe(20);
    marks.frame(1000, () => null);
    expect(v.scene.children).toHaveLength(1);
    marks.frame(2000, () => null);
    expect(v.scene.children).toHaveLength(0);
  });

  it("moves one that follows someone", () => {
    const marks = new AreaMarks(view());
    marks.add({ ...area, follows: 5 }, 0);
    marks.frame(1, (id) => (id === 5 ? new THREE.Vector3(1, 2, 3) : null));
    expect(marks.marks.get(1).mesh.position.x).toBe(1);
    expect(marks.marks.get(1).mesh.position.z).toBe(3);
  });

  it("forgets one that's gone early", () => {
    const v = view();
    const marks = new AreaMarks(v);
    marks.add(area, 0);
    marks.remove(1);
    marks.remove(1);
    expect(v.scene.children).toHaveLength(0);
  });
});
