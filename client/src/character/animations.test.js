import fs from "fs";
import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { characterClips } from "./animations.js";
import { characterMesh } from "./characterMesh.js";
import { resolveRecipe } from "./recipe.js";

const baked = JSON.parse(fs.readFileSync(new URL("./animations.json", import.meta.url)));

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
});
