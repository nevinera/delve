import * as THREE from "three";
import { describe, expect, it, vi } from "vitest";
import { abilityTimeline } from "./timeline.js";
import { AbilityStage } from "./stage.js";

const swing = { range: "melee", school: "physical", animation: "attack" };
const kinds = (ability, kind) => abilityTimeline(ability).events.filter((e) => e.kind === kind);

describe("how a swing feels", () => {
  it("gives a melee swing a lean and a pause by its clip", () => {
    expect(kinds(swing, "lunge")[0]).toMatchObject({ at: 0, feet: 0.5, strikes: 0.3 });
    expect(kinds(swing, "pause")[0]).toMatchObject({ at: 0.3, seconds: 0.04 });
    expect(kinds(swing, "shake")).toEqual([]);
    expect(kinds({ ...swing, animation: "bigAttack" }, "shake")[0]).toMatchObject({ at: 0.3, strength: 0.1 });
  });

  it("lets an ability set or turn off each", () => {
    expect(kinds({ ...swing, lunge: 3 }, "lunge")[0].feet).toBe(3);
    expect(kinds({ ...swing, lunge: 0, pause: 0 }, "lunge")).toEqual([]);
    expect(kinds({ ...swing, pause: 0 }, "pause")).toEqual([]);
    expect(kinds({ ...swing, shake: 0.2 }, "shake")[0].strength).toBe(0.2);
  });

  it("leaves spells alone", () => {
    const spell = { range: 30, school: "fire", castTime: 1 };
    for (const kind of ["lunge", "pause", "shake"]) expect(kinds(spell, kind)).toEqual([]);
  });

  it("lands sooner with a faster clip", () => {
    const fast = abilityTimeline({ ...swing, clipSpeed: 2, effects: [{ type: "damage", affects: "target" }] }).events;
    expect(fast.find((e) => e.kind === "clip").speed).toBe(2);
    expect(fast.find((e) => e.kind === "hit").at).toBeCloseTo(0.15);
    expect(fast.find((e) => e.effect === "ribbon").params.duration).toBeCloseTo(0.21);
  });
});

describe("the stage", () => {
  const unit = (x = 0) => {
    const mesh = new THREE.Mesh();
    mesh.position.x = x;
    return { mesh, height: 6, clip: vi.fn(), mixer: { timeScale: 1 } };
  };
  const stageWith = () => new AbilityStage(new THREE.Scene());

  it("leans toward the target at the strike, and all the way back", () => {
    const [stage, caster, target] = [stageWith(), unit(), unit(10)];
    stage.swing(caster, target);
    stage.frame(0.01);
    for (let n = 0; n < 30; n++) {
      stage.frame(0.01);
      stage.place();
    }
    expect(caster.mesh.position.x).toBeCloseTo(0.5, 1);
    for (let n = 0; n < 40; n++) {
      stage.frame(0.01);
      stage.place();
    }
    expect(caster.mesh.position.x).toBeCloseTo(0, 5);
    expect(stage.lunges).toEqual([]);
  });

  it("works whether or not the game puts the body back each frame", () => {
    const [stage, caster, target] = [stageWith(), unit(), unit(10)];
    stage.swing(caster, target);
    let furthest = 0;
    for (let n = 0; n < 80; n++) {
      caster.mesh.position.x = 0;
      stage.frame(0.01);
      stage.place();
      furthest = Math.max(furthest, caster.mesh.position.x);
    }
    expect(furthest).toBeCloseTo(0.5, 1);
  });

  it("doesn't lean into someone it's already at", () => {
    const [stage, caster, target] = [stageWith(), unit(), unit(2)];
    stage.swing(caster, target);
    for (let n = 0; n < 31; n++) {
      stage.frame(0.01);
      stage.place();
    }
    expect(caster.mesh.position.x).toBeCloseTo(0, 5);
  });

  it("holds both sides' clips on contact, then lets go", () => {
    const [stage, caster, target] = [stageWith(), unit(), unit(10)];
    stage.swing(caster, target);
    for (let n = 0; n < 31; n++) stage.frame(0.01);
    expect(caster.mixer.timeScale).toBe(0);
    expect(target.mixer.timeScale).toBe(0);
    for (let n = 0; n < 6; n++) stage.frame(0.01);
    expect(caster.mixer.timeScale).toBe(1);
    expect(target.mixer.timeScale).toBe(1);
  });

  it("keeps a trail from ageing while it's held", () => {
    const [stage, caster, target] = [stageWith(), unit(), unit(10)];
    stage.swing(caster, target);
    for (let n = 0; n < 31; n++) stage.frame(0.01);
    const trail = stage.alive.find((live) => live.heldStill === caster.mesh);
    const { at } = trail;
    stage.frame(0.01);
    expect(trail.at).toBeCloseTo(at + 0.01);
  });

  it("stops a cancelled cast's clip even with a swing going", () => {
    const [stage, caster, target] = [stageWith(), unit(), unit(10)];
    const cast = stage.play({ name: "Cast", castTime: 2, school: "fire" }, { caster, target });
    stage.swing(caster, target);
    caster.clip.mockClear();
    stage.stop(cast);
    expect(caster.clip).toHaveBeenCalledWith(null);
  });

  it("lets go of everything when cleared", () => {
    const [stage, caster, target] = [stageWith(), unit(), unit(10)];
    stage.swing(caster, target);
    for (let n = 0; n < 31; n++) {
      stage.frame(0.01);
      stage.place();
    }
    stage.clear();
    expect(caster.mixer.timeScale).toBe(1);
    expect(caster.mesh.position.x).toBeCloseTo(0, 5);
  });

  it("shakes only when told to, and settles", () => {
    const stage = stageWith();
    expect(stage.shakeOffset().length()).toBe(0);
    stage.shake(0.1);
    stage.frame(0.02);
    expect(stage.shakeOffset().length()).toBeGreaterThan(0);
    stage.frame(0.3);
    expect(stage.shakeOffset().length()).toBe(0);
  });
});
