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

describe("mobs placed in /create", () => {
  const goblin = { id: "gobl0001", name: "Goblin", look: { body: "goblin" } };
  const npc = { id: "npc1", npc: "vend0001", at: [0, 0, 0] };
  function mobs() {
    const made = units();
    made.u.loadSpawns({ version: 1, regions: [{ id: "r1", area: [], spawns: [] }], placed: [npc], notes: "kept" });
    made.u.setCreatures([goblin]);
    return made;
  }

  it("puts the chosen creature down with the mob settings, keeping NPCs and dropping the old regions", () => {
    const { u } = mobs();
    u.setTool("mob");
    u.setMob({ levels: [2, 4], respawn: 60, yaw: 90 });
    u.down();
    const file = u.spawnsJSON();
    expect(file).not.toHaveProperty("regions");
    expect(file.spawnAreas).toEqual([]);
    expect(file.notes).toBe("kept");
    expect(file.placed[0]).toEqual(npc);
    expect(file.placed[1]).toMatchObject({ creature: "gobl0001", levels: [2, 4], respawn: 60, yaw: 90, at: [10, 5, 20.1] });
    expect(file.placed[1]).not.toHaveProperty("wander");
    expect(file.placed[1].id).toMatch(/^mob[0-9a-z]{5}$/);
    expect(u.mobVersion).toBe(1);
    expect(u.meshes.get(file.placed[1]).userData.character).toBe(true);
  });

  it("draws mobs as dummies until the world's creatures are known", () => {
    const { u } = units();
    u.loadSpawns({ version: 1, regions: [], placed: [{ id: "m1", creature: "gobl0001", at: [1, 2, 3] }] });
    expect(u.meshes.size).toBe(1);
    u.setCreatures([goblin]);
    expect([...u.meshes.values()][0].userData.character).toBe(true);
  });

  it("changes a picked mob's settings, drags it and deletes it", () => {
    const { u, point } = mobs();
    u.setTool("mob");
    u.down();
    u.setTool("unitSelect");
    const [mob] = u.mobs();
    u.unitHit = () => mob;
    u.down();
    u.setMob({ levels: 7, wander: 12 });
    expect(u.mobs()[0]).toMatchObject({ levels: 7, wander: 12, respawn: 300 });
    point([30, 6, 40]);
    u.move();
    u.up();
    expect(u.mobs()[0].at).toEqual([30, 6, 40]);
    expect(u.key({ key: "Delete" })).toBe(true);
    expect(u.mobs()).toEqual([]);
    expect(u.spawnsJSON().placed).toEqual([npc]);
  });

  it("puts nothing down when the world has no creatures", () => {
    const { u } = units();
    u.loadSpawns(null);
    u.setCreatures([]);
    u.setTool("mob");
    u.down();
    expect(u.mobs()).toEqual([]);
    expect(u.spawnsJSON()).toEqual({ version: 1, spawnAreas: [], placed: [] });
  });
});

describe("spawn areas in /create", () => {
  const goblin = { id: "gobl0001", name: "Goblin", look: { body: "goblin" } };
  const square = [[0, 0], [512, 0], [512, 512], [0, 512]];
  function spawning() {
    const made = units();
    made.u.loadSpawns({ version: 1, spawnAreas: [], placed: [{ id: "mine0001", creature: "gobl0001", at: [1, 5, 1] }] });
    made.u.setCreatures([goblin]);
    return made;
  }

  it("scatter their mobs, and scatter them again in place of the old ones", () => {
    const { u } = spawning();
    const spawnArea = u.addSpawnArea("area0001", square);
    expect(spawnArea.id).toMatch(/^spwn[0-9a-z]{4}$/);
    expect(spawnArea.spawns).toEqual([{ creature: "gobl0001", density: 1, levels: 1, respawn: 300 }]);
    u.setSpawns(spawnArea, [{ creature: "gobl0001", density: 6, levels: [2, 3], respawn: 60, wander: 10 }], square);
    const mine = u.mobs().filter((m) => m.spawnArea === spawnArea.id);
    expect(mine).toHaveLength(6);
    expect(mine[0]).toMatchObject({ creature: "gobl0001", levels: [2, 3], respawn: 60, wander: 10 });
    expect(u.mobs().find((m) => m.id === "mine0001")).toBeTruthy();
    expect(u.spawnsJSON().spawnAreas).toEqual([{ id: spawnArea.id, area: "area0001", spawns: [{ creature: "gobl0001", density: 6, levels: [2, 3], respawn: 60, wander: 10 }] }]);
    u.removeSpawnArea(spawnArea);
    expect(u.mobs().map((m) => m.id)).toEqual(["mine0001"]);
  });

  it("let go of a mob edited or moved by hand", () => {
    const { u, point } = spawning();
    const spawnArea = u.addSpawnArea("area0001", square);
    u.setTool("unitSelect");
    const [a] = u.mobs().filter((m) => m.spawnArea);
    u.unitHit = () => a;
    u.down();
    point([30, 6, 40]);
    u.move();
    u.up();
    expect(a).not.toHaveProperty("spawnArea");
    u.fill(spawnArea, square);
    expect(u.mobs()).toContain(a);
  });
});
