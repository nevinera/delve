import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { Units, restPointId } from "./units.js";

function units(at = [10.04, 5, 20.06]) {
  let pointer = at;
  const u = new Units({ scene: new THREE.Scene(), groundAt: () => 5, hit: () => pointer, ray: () => null });
  const kept = [];
  u.onChange = (next) => kept.push(structuredClone(next));
  u.load({ continent: "main", spawn: null, dummies: [{ continent: "far", at: [1, 1] }] });
  return { u, kept, point: (p) => (pointer = p) };
}

describe("units in /create", () => {
  it("puts up a dummy where you click, keeping other continents' dummies", () => {
    const { u, kept } = units();
    u.setTool("dummy");
    u.down();
    expect(kept.at(-1).dummies).toEqual([{ continent: "far", at: [1, 1] }, { continent: "main", at: [10, 20.1] }]);
    expect(u.meshes.size).toBe(1);
  });

  it("sets the spawn point with the spawn tool", () => {
    const { u, kept } = units();
    u.setTool("spawn");
    u.down();
    expect(kept.at(-1).spawn).toEqual({ continent: "main", at: [10, 20.1] });
  });

  it("drags a picked dummy, and takes it away with Delete", () => {
    const { u, kept, point } = units();
    u.setTool("dummy");
    u.down();
    u.setTool("unitSelect");
    const [dummy] = u.here();
    u.unitHit = () => dummy;
    u.down();
    point([30, 5, 40]);
    u.move();
    u.up();
    expect(kept.at(-1).dummies[1].at).toEqual([30, 40]);
    expect(u.key({ key: "Delete" })).toBe(true);
    expect(kept.at(-1).dummies).toEqual([{ continent: "far", at: [1, 1] }]);
    expect(u.key({ key: "Delete" })).toBe(false);
  });

  it("doesn't count a click on nothing as a change", () => {
    const { u, kept } = units();
    u.setTool("unitSelect");
    u.unitHit = () => null;
    u.down();
    u.up();
    expect(kept).toEqual([]);
  });

  it("puts up a named rest point with the rest tool, and renames and deletes it", () => {
    const { u, kept } = units();
    u.setTool("rest");
    u.down();
    const [rest] = kept.at(-1).restPoints;
    expect(rest).toMatchObject({ continent: "main", at: [10, 20.1], name: "Rest point 1" });
    expect(rest.id).toMatch(/^rest[0-9a-z]{4}$/);
    u.setTool("unitSelect");
    u.unitHit = () => u.restPoints[0];
    u.down();
    u.up();
    u.rename("The Inn");
    expect(kept.at(-1).restPoints[0].name).toBe("The Inn");
    u.key({ key: "Delete" });
    expect(kept.at(-1).restPoints).toEqual([]);
  });

  it("gives rest points ids no other has", () => {
    const rolls = [0, 0, 0.5];
    expect(restPointId([{ id: "rest0000" }], () => rolls.shift())).not.toBe("rest0000");
  });
});
