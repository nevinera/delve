import fs from "fs";
import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { characterClips, strideRate } from "./animations.js";
import { characterMesh } from "./characterMesh.js";
import { TURN_RATE } from "./posed.js";
import { resolveRecipe } from "./recipe.js";

const read = (file) => JSON.parse(fs.readFileSync(new URL(file, import.meta.url)));
// The clips, with the stashed T-pose that checks the baking.
const baked = read("./animations.json");
baked.clips.A_TPose = read("./animations-stash.json").clips.A_TPose;

// Where each bone is, in feet, at a time into a clip.
function posed(name, time, look = resolveRecipe()) {
  const mesh = characterMesh(look);
  const mixer = new THREE.AnimationMixer(mesh);
  mixer.clipAction(characterClips(mesh, baked).get(name)).play();
  mixer.setTime(time);
  mesh.updateMatrixWorld(true);
  return (bone) => new THREE.Vector3().setFromMatrixPosition(mesh.skeleton.getBoneByName(bone).matrixWorld);
}

describe("characterClips", () => {
  it("holds the arms straight out in a T-pose", () => {
    const at = posed("A_TPose", 0);
    expect(at("hand_l").y).toBeCloseTo(at("upperarm_l").y, 0);
    expect(at("hand_l").x).toBeGreaterThan(at("upperarm_l").x + 1.5);
    expect(at("hand_r").x).toBeLessThan(at("upperarm_r").x - 1.5);
  });

  it("stands on the ground when idle", () => {
    const at = posed("Idle_Loop", 0.5);
    expect(at("foot_l").y).toBeGreaterThan(0.1);
    expect(at("foot_l").y).toBeLessThan(0.6);
    expect(at("head").y).toBeGreaterThan(4.8);
    expect(at("hand_l").y).toBeLessThan(at("upperarm_l").y - 1);
  });

  it("moves the pelvis in proportion to height", () => {
    const short = posed("Jump_Loop", 0.3, resolveRecipe({ height: 4.5 }));
    const tall = posed("Jump_Loop", 0.3, resolveRecipe({ height: 7.5 }));
    expect(tall("pelvis").y / short("pelvis").y).toBeCloseTo(7.5 / 4.5, 1);
  });

  it("sits cross-legged on the ground, knees out and each foot under the other knee", () => {
    const at = posed("Sit_Ground_Idle_Loop", 1);
    expect(at("pelvis").y).toBeGreaterThan(0.25);
    expect(at("pelvis").y).toBeLessThan(0.8);
    expect(at("calf_l").x).toBeGreaterThan(0.7);
    expect(at("calf_r").x).toBeLessThan(-0.7);
    expect(at("calf_l").y).toBeLessThan(at("pelvis").y + 0.4);
    expect(at("foot_l").x).toBeLessThan(0);
    expect(at("foot_r").x).toBeGreaterThan(0);
    expect(at("foot_l").y).toBeGreaterThan(0.1);
    expect(at("foot_l").y).toBeLessThan(0.6);
    expect(at("hand_l").y).toBeGreaterThan(0.3);
  });

  it("gets every melee swing to its target about when its hit lands", () => {
    for (const name of ["Punch_Cross", "Sword_Attack", "Sword_Regular_B", "TwoHand_Chop", "TwoHand_Sweep", "TwoHand_Sweep_Release", "Zombie_Scratch"]) {
      // The moment the hand goes forward fastest.
      let fastest = { gain: 0, at: 0 };
      let was = posed(name, 0)("hand_r").z;
      for (let t = 1 / 30; t < 0.9; t += 1 / 30) {
        const { z } = posed(name, t)("hand_r");
        if (z - was > fastest.gain) fastest = { gain: z - was, at: t };
        was = z;
      }
      expect(fastest.at, name).toBeGreaterThan(0.12);
      expect(fastest.at, name).toBeLessThan(0.4);
    }
  }, 60000);

  it("holds a two-handed weapon in both hands, in front, with the feet planted", () => {
    for (const time of [0, 0.5, 0.6, 0.75]) {
      const at = posed("TwoHand_Chop", time);
      expect(at("hand_l").distanceTo(at("hand_r"))).toBeLessThan(0.75);
      expect(at("foot_l").y).toBeCloseTo(0.32, 1);
      expect(at("foot_r").y).toBeCloseTo(0.32, 1);
    }
    const ready = posed("TwoHand_Idle_Loop", 0);
    expect(Math.abs(ready("hand_r").x)).toBeLessThan(0.4);
    expect(ready("hand_r").z).toBeGreaterThan(0.6);
  });

  it("draws a bow with the left arm out ahead and the right hand at the jaw", () => {
    const at = posed("Bow_Aim_Loop", 0);
    expect(at("hand_l").z).toBeGreaterThan(1.3);
    expect(at("hand_r").distanceTo(at("head"))).toBeLessThan(0.8);
  });

  it("runs with the planted foot holding the ground, and both feet off it between steps", () => {
    const cycle = 0.66;
    // Halfway through the left foot's time planted, then halfway through the moment in the air.
    const planted = posed("Run_Fwd_Loop", 0.11 * cycle);
    expect(planted("foot_l").y).toBeCloseTo(0.32, 1);
    const later = posed("Run_Fwd_Loop", 0.12 * cycle);
    expect((planted("foot_l").z - later("foot_l").z) / (0.01 * cycle)).toBeCloseTo(21, -1);
    const flying = posed("Run_Fwd_Loop", 0.36 * cycle);
    expect(flying("foot_l").y).toBeGreaterThan(0.4);
    expect(flying("foot_r").y).toBeGreaterThan(0.4);
  });

  it("turns on the spot with the planted foot held as the body turns over it", () => {
    const cycle = 0.7;
    // Through the left foot's time planted, it turns back against a left turn as fast as the
    // body turns, so it stays put on the ground.
    const angle = (t) => {
      const foot = posed("Turn_Left_Loop", t)("foot_l");
      return Math.atan2(foot.x, foot.z);
    };
    expect((angle(0.3 * cycle) - angle(0.2 * cycle)) / (0.1 * cycle)).toBeCloseTo(-TURN_RATE, 0);
    // While it swings round ahead, it's off the ground.
    expect(posed("Turn_Left_Loop", 0.75 * cycle)("foot_l").y).toBeGreaterThan(0.4);
    const right = (t) => {
      const foot = posed("Turn_Right_Loop", t)("foot_l");
      return Math.atan2(foot.x, foot.z);
    };
    expect((right(0.3 * cycle) - right(0.2 * cycle)) / (0.1 * cycle)).toBeCloseTo(TURN_RATE, 0);
  });

  it("strafes with the feet clear of each other", () => {
    for (let t = 0; t < 0.66; t += 0.03) {
      const at = posed("Run_Left_Loop", t);
      expect(at("foot_l").distanceTo(at("foot_r"))).toBeGreaterThan(0.25);
    }
  });
});

describe("strideRate", () => {
  it("plays a bigger body's stride slower at the same speed, so its feet don't slide", () => {
    const rate = (scale) => {
      const mesh = characterMesh(resolveRecipe({ body: "wolf", scale }));
      return strideRate(characterClips(mesh, { clips: {} }).get("Run_Fwd_Loop"), mesh, 20);
    };
    expect(rate(2)).toBeCloseTo(rate(1) / 2);
    expect(strideRate(null, { userData: { scale: 1 } }, 20)).toBe(1);
  });
});
