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

  describe("a status's aura", () => {
    const spawned = (stage) => stage.alive.at(-1).visual.group;

    it("lays a decal over the ground where the unit stands", () => {
      const scene = new THREE.Scene();
      const stage = new AbilityStage(scene, { ground: (x) => x });
      stage.aura(unit(10), { effect: "decal", radius: 2 });
      const { position } = spawned(stage).children[0].geometry.attributes;
      expect(spawned(stage).position.x).toBe(10);
      expect(position.getY(1)).toBeCloseTo(10 + position.getX(1) + 0.2, 3);
    });

    it("has a ribbon follow what the unit holds", () => {
      const stage = stageWith();
      const on = unit();
      const hold = new THREE.Bone();
      hold.name = "hand_r";
      on.mesh.skeleton = { getBoneByName: () => hold };
      on.mesh.add(hold);
      stage.aura(on, { effect: "ribbon", duration: 2, length: 1 });
      const live = stage.alive.at(-1);
      for (const x of [1, 2, 3, 4]) {
        hold.position.x = x;
        stage.frame(0.1);
      }
      expect(live.visual.group.children[0].visible).toBe(true);
    });

    it("takes parameters and colors, and its own colors over the ones given", () => {
      const stage = stageWith();
      stage.aura(unit(), { effect: "shield", texture: "ripple", duration: 3, colors: ["#ff0000", "#ff0000"], scale: 2 }, ["#00ff00", "#00ff00"]);
      const live = stage.alive.at(-1);
      expect(live.visual.length).toBe(3);
      expect(live.visual.group.children[0].children[0].material.uniforms.uColor.value.r).toBeGreaterThan(0.9);
      stage.aura(unit(), { effect: "shield" }, ["#00ff00", "#00ff00"]);
      expect(stage.alive.at(-1).visual.group.children[0].children[0].material.uniforms.uColor.value.g).toBeGreaterThan(0.9);
    });

    it("keeps a particle one on the unit as it moves", () => {
      const stage = stageWith();
      const on = unit();
      stage.aura(on, { effect: "embers", duration: 1 });
      on.mesh.position.x = 7;
      stage.frame(0.05);
      expect(spawned(stage).position.x).toBe(7);
    });
  });

  describe("following", () => {
    const fire = (stage, on, effect, params) => stage.fireVisual({ caster: on, target: on, spot: null }, { effect, on: "caster", colors: ["#ffffff", "#ffffff"], scale: 1, params });
    const moved = (stage, on) => {
      on.mesh.position.x += 5;
      stage.frame(0.01);
      stage.place();
    };

    it.each(["burst", "ring", "shield", "bolt", "arrow", "decal", "scorch"])("%s stays put by default, and comes along when it says", (effect) => {
      const stage = stageWith();
      const on = unit();
      const left = fire(stage, on, effect, {});
      const comes = fire(stage, on, effect, { follow: true });
      const { y } = comes.visual.group.position;
      moved(stage, on);
      expect(left.visual.group.position.x).toBe(0);
      expect(comes.visual.group.position.x).toBe(5);
      expect(comes.visual.group.position.y).toBe(y);
    });

    it.each([[true, 5], [undefined, 5], [false, 0]])("particles with follow %s", (follow, x) => {
      const stage = stageWith();
      const on = unit();
      const { visual } = fire(stage, on, "embers", { follow });
      on.mesh.position.x = 5;
      stage.frame(0.01);
      expect(visual.group.position.x).toBe(x);
    });

    it("lays a following decal over the ground it's come to", () => {
      const stage = new AbilityStage(new THREE.Scene(), { ground: (x) => x });
      const on = unit();
      const { visual } = fire(stage, on, "decal", { follow: true, duration: 100 });
      moved(stage, on);
      const { position } = visual.group.children[0].geometry.attributes;
      expect(position.getY(1)).toBeCloseTo(5 + position.getX(1) + 0.2, 3);
    });

    it("turns a following cone as its caster turns", () => {
      const stage = stageWith();
      const on = unit();
      const { visual } = fire(stage, on, "cone", { follow: true });
      on.mesh.rotation.y = 1;
      moved(stage, on);
      expect(visual.group.rotation.y).toBe(1);
    });

    it("keeps a following beam reaching to its target", () => {
      const stage = stageWith();
      const [caster, target] = [unit(), unit(10)];
      const { visual } = stage.fireVisual({ caster, target, spot: null }, { effect: "beam", on: "target", colors: ["#ffffff", "#ffffff"], scale: 1, params: { follow: true } });
      target.mesh.position.x = 30;
      stage.frame(0.01);
      stage.place();
      stage.frame(0.01);
      const beam = visual.group.children[0].children[0];
      expect(beam.scale.y).toBeGreaterThan(25);
    });

    it("leaves something on the ground where it is", () => {
      const stage = stageWith();
      const on = unit();
      const live = stage.fireVisual({ caster: on, target: on, spot: new THREE.Vector3(3, 0, 3) }, { effect: "ring", on: "ground", colors: ["#ffffff", "#ffffff"], scale: 1, params: { follow: true } });
      moved(stage, on);
      expect(live.visual.group.position.x).toBe(3);
    });
  });

  describe("an aura that lasts as long as its status", () => {
    const lasting = { effect: "shield", duration: "status" };

    it("carries on past its stock length, then fades and goes when ended", () => {
      const stage = stageWith();
      const live = stage.aura(unit(), lasting);
      for (let n = 0; n < 50; n++) stage.frame(0.1);
      expect(stage.alive).toContain(live);
      const { material } = live.visual.group.children[0].children[0];
      expect(material.uniforms.uOpacity.value).toBeGreaterThan(0.5);
      const full = material.uniforms.uOpacity.value;
      stage.endAura(live);
      stage.frame(0.1);
      expect(stage.alive).toContain(live);
      expect(material.uniforms.uOpacity.value).toBeLessThan(full);
      stage.frame(0.3);
      expect(stage.alive).not.toContain(live);
    });

    it("follows by default, and not if it says", () => {
      const stage = stageWith();
      const on = unit();
      const comes = stage.aura(on, lasting);
      const stays = stage.aura(on, { ...lasting, follow: false });
      on.mesh.position.x = 4;
      stage.frame(0.1);
      stage.place();
      expect(comes.visual.group.position.x).toBe(4);
      expect(stays.visual.group.position.x).toBe(0);
    });

    it("keeps letting go particles, of either kind, until it ends", () => {
      for (const effect of ["embers", "sparks"]) {
        const stage = stageWith();
        const emit = vi.spyOn(stage.particles, "emit");
        const live = stage.aura(unit(), { effect, duration: "status" });
        for (let n = 0; n < 40; n++) stage.frame(0.1);
        const { length } = emit.mock.calls;
        expect(length).toBeGreaterThan(1);
        stage.endAura(live);
        stage.frame(0.1);
        expect(emit.mock.calls.length).toBe(length);
      }
    });

    it("ends by itself when told how long", () => {
      const stage = stageWith();
      const live = stage.aura(unit(), lasting, undefined, { lasts: 1 });
      for (let n = 0; n < 15; n++) stage.frame(0.1);
      expect(stage.alive).not.toContain(live);
    });

    it("plays once with a number", () => {
      const stage = stageWith();
      const live = stage.aura(unit(), { effect: "shield", duration: 0.5 });
      for (let n = 0; n < 8; n++) stage.frame(0.1);
      expect(stage.alive).not.toContain(live);
    });
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
