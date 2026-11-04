import * as THREE from "three";
import { describe, expect, it, vi } from "vitest";
import { AbilityStage } from "./stage.js";

const stageWithUnit = () => {
  const stage = new AbilityStage(new THREE.Scene());
  vi.spyOn(stage.particles, "emit");
  const pelvis = new THREE.Object3D();
  const mesh = new THREE.Object3D();
  mesh.add(pelvis);
  mesh.skeleton = { getBoneByName: (name) => (name === "pelvis" ? pelvis : null) };
  return { stage, pelvis, unit: { mesh, height: 6, clip() {} } };
};
const motes = { name: "Pray", target: "self", castTime: 2, effects: [], visuals: [{ effect: "motes", when: "cast", duration: "cast" }] };

describe("a particle effect on a unit", () => {
  it("lets particles go from where the unit's body is, when a clip has carried it away", () => {
    const { stage, pelvis, unit } = stageWithUnit();
    stage.play(motes, { caster: unit });
    stage.frame(0.1);
    pelvis.position.set(4, 3, 1);
    stage.frame(0.5);
    const [, , origin] = stage.particles.emit.mock.lastCall;
    expect(origin[0]).toBe(4);
    expect(origin[2]).toBe(1);
  });

  it("stops when the cast holding it is cut short", () => {
    const { stage, unit } = stageWithUnit();
    const run = stage.play(motes, { caster: unit });
    stage.frame(0.5);
    stage.stop(run);
    stage.particles.emit.mockClear();
    stage.frame(0.5);
    expect(stage.particles.emit).not.toHaveBeenCalled();
    expect(stage.alive).toEqual([]);
  });

  it("has what a cast held fade out as the cast ends, and leaves other particles alone", () => {
    const { stage, unit } = stageWithUnit();
    const fadesAt = () => Array.from({ length: stage.particles.next }, (_, k) => stage.particles.cells[k * 4 + 3]);
    stage.play({ ...motes, visuals: [...motes.visuals, { effect: "embers", when: "cast" }] }, { caster: unit });
    for (let i = 0; i < 12; i++) stage.frame(0.1);
    expect(new Set(fadesAt()).size).toBe(1);
    for (let i = 0; i < 10; i++) stage.frame(0.1);
    const ended = new Set(fadesAt());
    expect(ended.size).toBe(2);
    expect([...ended].filter((at) => at < 3)[0]).toBeCloseTo(2, 0);
  });
});
