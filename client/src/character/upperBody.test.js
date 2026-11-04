import fs from "fs";
import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { characterClips } from "./animations.js";
import { characterMesh, setWeaponsDrawn } from "./characterMesh.js";
import { resolveRecipe } from "./recipe.js";
import { UpperBody, canSplit, halfOf } from "./upperBody.js";

const baked = JSON.parse(fs.readFileSync(new URL("./animations.json", import.meta.url)));

function body() {
  const mesh = characterMesh(resolveRecipe());
  const clips = characterClips(mesh, baked);
  const at = (bone) => {
    mesh.updateMatrixWorld(true);
    return new THREE.Vector3().setFromMatrixPosition(mesh.skeleton.getBoneByName(bone).matrixWorld);
  };
  return { mesh, clips, at, mixer: new THREE.AnimationMixer(mesh) };
}
const alone = (name, time) => {
  const { mixer, clips, at } = body();
  mixer.clipAction(clips.get(name)).play();
  mixer.setTime(time);
  return at;
};

describe("a body split at the waist", () => {
  it("swings with its arms while its legs run", () => {
    const { mixer, clips, at, mesh } = body();
    expect(canSplit(mesh)).toBe(true);
    mixer.clipAction(clips.get(halfOf(clips, "Run_Fwd_Loop", "lower"))).play();
    new UpperBody(mixer, clips).show({}, "TwoHand_Chop");
    mixer.setTime(0.3);
    const [swing, run] = [alone("TwoHand_Chop", 0.3), alone("Run_Fwd_Loop", 0.3)];
    expect(at("foot_l").distanceTo(run("foot_l"))).toBeLessThan(0.01);
    // The arms hang from a pelvis the run is moving, so compare them from the chest.
    const fromChest = (a) => a("hand_r").sub(a("spine_01"));
    expect(fromChest(at).distanceTo(fromChest(swing))).toBeLessThan(0.6);
    expect(fromChest(at).distanceTo(fromChest(run))).toBeGreaterThan(0.5);
  });

  it("carries on the same go, and starts another over", () => {
    const { mixer, clips } = body();
    const upper = new UpperBody(mixer, clips);
    const go = {};
    upper.show(go, "TwoHand_Chop", { time: 0.2 });
    const first = upper.action;
    mixer.update(0.1);
    upper.show(go, "TwoHand_Chop");
    expect(upper.action).toBe(first);
    expect(first.time).toBeCloseTo(0.3);
    upper.clear();
    expect(upper.action).toBeNull();
  });
});

describe("drawing weapons", () => {
  it("moves them between the hand and where they're put away", () => {
    const mesh = characterMesh({ ...resolveRecipe(), weapon: "sword", offhand: "shield", sheathed: true });
    const [sword] = mesh.userData.held;
    expect(sword.parent.name).toBe("pelvis");
    setWeaponsDrawn(mesh, true);
    expect(sword.parent.name).toBe("hand_r");
    setWeaponsDrawn(mesh, false);
    expect(sword.parent.name).toBe("pelvis");
  });
});
