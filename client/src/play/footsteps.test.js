import * as THREE from "three";
import { describe, expect, it, vi } from "vitest";
import { Footsteps, stepFt, stepSoundOn } from "./footsteps.js";

const flat = { heightAt: () => 0, waterAt: () => NaN, patternAt: () => "grass" };

describe("Footsteps", () => {
  const walking = (ground = flat, speed = 21, seconds = 1, mine = true) => {
    const play = vi.fn();
    const steps = new Footsteps(play, ground);
    const mesh = new THREE.Object3D();
    const unit = { mesh, height: 6, mine };
    steps.frame(0.02, [unit]);
    for (let t = 0; t < seconds; t += 0.02) {
      mesh.position.x += speed * 0.02;
      steps.frame(0.02, [unit]);
    }
    return play;
  };

  it("steps in time with how far they've gone", () => {
    const count = walking().mock.calls.length;
    expect(count).toBeGreaterThanOrEqual(Math.floor(21 / stepFt(21, 6)) - 1);
    expect(count).toBeLessThanOrEqual(Math.ceil(21 / stepFt(21, 6)) + 1);
  });

  it("takes longer strides faster, and on longer legs", () => {
    expect(stepFt(21, 6)).toBeGreaterThan(stepFt(7.5, 6));
    expect(stepFt(21, 12)).toBeGreaterThan(stepFt(21, 6));
  });

  it("walks at a walk, and doesn't step for a lean", () => {
    expect(walking(flat, 7.5).mock.calls.length).toBeGreaterThan(1);
    expect(walking(flat, 2).mock.calls.length).toBe(0);
  });

  it("is silent in the air, in water, and off what's been read", () => {
    expect(walking({ ...flat, heightAt: () => -5 }).mock.calls.length).toBe(0);
    expect(walking({ ...flat, waterAt: () => 2 }).mock.calls.length).toBe(0);
    expect(walking({ ...flat, heightAt: () => null }).mock.calls.length).toBe(0);
  });

  it("doesn't step for a teleport", () => {
    expect(walking(flat, 1000, 0.1).mock.calls.length).toBe(0);
  });

  it("plays from where they are, quieter for others, and marks your own", () => {
    const [name, options] = walking().mock.calls[0];
    expect(name).toBe("step-grass");
    expect(options.mine).toBe(true);
    expect(options.at[0]).toBeGreaterThan(0);
    const [, theirs] = walking(flat, 21, 1, false).mock.calls[0];
    expect(theirs.volume).toBeLessThan(options.volume);
  });

  it("forgets who's gone", () => {
    const steps = new Footsteps(vi.fn(), flat);
    steps.frame(0.02, [{ mesh: new THREE.Object3D(), height: 6 }]);
    steps.frame(0.02, []);
    expect(steps.walkers.size).toBe(0);
  });

  it("picks a sound by the ground", () => {
    expect(stepSoundOn("rock")).toBe("step-stone");
    expect(stepSoundOn("sand")).toBe("step-snow");
    expect(stepSoundOn("mud")).toBe("step-grass");
    expect(stepSoundOn("grass")).toBe("step-grass");
    expect(stepSoundOn(null)).toBe("step-grass");
  });
});
