import * as THREE from "three";
import { describe, expect, it, vi } from "vitest";
import { Footsteps, groundOf, stepSound } from "./footsteps.js";

const flat = { heightAt: () => 0, waterAt: () => NaN, patternAt: () => "grass" };

// A body going `speed` ft a second whose two feet swing up and down out of step, twice a second
// each, so four footfalls a second.
const striding = ({ ground = flat, speed = 10, seconds = 2, mine = true } = {}) => {
  const play = vi.fn();
  const steps = new Footsteps(play, ground);
  const mesh = new THREE.Object3D();
  const feet = ["foot_l", "foot_r"].map((name) => Object.assign(new THREE.Object3D(), { name }));
  mesh.add(...feet);
  const unit = { mesh, height: 6, mine };
  for (let t = 0; t < seconds; t += 0.01) {
    mesh.position.x += speed * 0.01;
    feet[0].position.y = Math.max(0, Math.sin(2 * Math.PI * 2 * t));
    feet[1].position.y = Math.max(0, -Math.sin(2 * Math.PI * 2 * t));
    mesh.updateMatrixWorld(true);
    steps.frame(0.01, [unit]);
  }
  return play;
};

describe("Footsteps", () => {
  it("steps when a foot comes down", () => {
    // Four footfalls a second, less the first or two while it learns how high the feet go.
    const count = striding().mock.calls.length;
    expect(count).toBeGreaterThanOrEqual(6);
    expect(count).toBeLessThanOrEqual(9);
  });

  it("doesn't step for a lean, or a teleport", () => {
    expect(striding({ speed: 2 }).mock.calls.length).toBe(0);
    expect(striding({ speed: 5000, seconds: 0.5 }).mock.calls.length).toBe(0);
  });

  it("is silent in the air, in water, and off what's been read", () => {
    expect(striding({ ground: { ...flat, heightAt: () => -5 } }).mock.calls.length).toBe(0);
    expect(striding({ ground: { ...flat, waterAt: () => 2 } }).mock.calls.length).toBe(0);
    expect(striding({ ground: { ...flat, heightAt: () => null } }).mock.calls.length).toBe(0);
  });

  it("says where they are, what they're on, and whether they're yours", () => {
    const [kind, options] = striding().mock.calls[0];
    expect(kind).toBe("soft");
    expect(options.mine).toBe(true);
    expect(options.at[0]).toBeGreaterThan(0);
    expect(striding({ mine: false }).mock.calls[0][1].mine).toBe(false);
  });

  it("steps on landing", () => {
    const play = vi.fn();
    let h = -5;
    const steps = new Footsteps(play, { ...flat, heightAt: () => h });
    const unit = { mesh: new THREE.Object3D(), height: 6, mine: true };
    for (let n = 0; n < 50; n++) steps.frame(0.02, [unit]);
    h = 0;
    steps.frame(0.02, [unit]);
    expect(play.mock.calls.map(([, options]) => options.landing)).toEqual([true]);
  });

  it("forgets who's gone", () => {
    const steps = new Footsteps(vi.fn(), flat);
    steps.frame(0.02, [{ mesh: new THREE.Object3D(), height: 6 }]);
    steps.frame(0.02, []);
    expect(steps.walkers.size).toBe(0);
  });

  it("tells rock and sand from the rest", () => {
    expect(groundOf("rock")).toBe("rock");
    expect(groundOf("sand")).toBe("sand");
    expect(groundOf("mud")).toBe("soft");
    expect(groundOf(null)).toBe("soft");
  });

  it("plays others' quieter than yours, and landings louder and lower", () => {
    const yours = stepSound({ mine: true });
    expect(stepSound({ mine: false }).volume).toBeLessThan(yours.volume);
    expect(stepSound({ mine: true, landing: true })).toMatchObject({ pitch: 0.9, volume: expect.any(Number) });
    expect(stepSound({ mine: true, landing: true }).volume).toBeGreaterThan(yours.volume);
  });
});
