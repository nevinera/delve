import fs from "fs";
import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { ROLES, characterClips, clipNames, roleClips } from "./animations.js";
import { SKELETONS, characterMesh } from "./characterMesh.js";
import { quadrupedMesh, quadrupedSkeleton } from "./quadruped.js";
import { resolveRecipe } from "./recipe.js";
import { WEAPONS, attackGroup } from "./weapons.js";

const wolf = (look = {}) => resolveRecipe({ body: "wolf", ...look });
const baked = JSON.parse(fs.readFileSync(new URL("./animations.json", import.meta.url)));

describe("quadrupedSkeleton", () => {
  it("lists parents first and mirrors the left legs to the right", () => {
    const bones = quadrupedSkeleton(wolf());
    bones.forEach((b, i) => {
      if (b.parent) expect(bones.findIndex((p) => p.name === b.parent)).toBeLessThan(i);
    });
    const at = Object.fromEntries(bones.map((b) => [b.name, b.at]));
    expect(at.hand_r[0]).toBeCloseTo(-at.hand_l[0]);
    expect(at.ball_r[2]).toBeCloseTo(at.ball_l[2]);
  });
});

describe("quadrupedMesh", () => {
  it("stands on the ground, about as tall as the look", () => {
    const { positions } = quadrupedMesh(wolf({ height: 3 }));
    const ys = positions.filter((_, i) => i % 3 === 1);
    expect(Math.min(...ys)).toBeCloseTo(0, 0);
    expect(Math.max(...ys)).toBeCloseTo(3.2, 0);
  });

  it("weights every corner to real bones, summing to 1", () => {
    const { bones, skinIndex, skinWeight } = quadrupedMesh(wolf());
    for (let v = 0; v < skinIndex.length / 4; v++) {
      let total = 0;
      for (let n = 0; n < 4; n++) {
        expect(skinIndex[v * 4 + n]).toBeLessThan(bones.length);
        total += skinWeight[v * 4 + n];
      }
      expect(total).toBeCloseTo(1);
    }
  });
});

describe("roleClips", () => {
  it("has a clip for each role each body plays, a battle cry among them", () => {
    for (const body of Object.values(SKELETONS).flat()) {
      const look = resolveRecipe({ body, loadouts: [] });
      const mesh = characterMesh(look);
      const clips = characterClips(mesh, baked);
      const roles = roleClips(look, mesh.userData.skeleton);
      for (const role of ["idle", "walk", "run", "attack", "battleCry", "hit", "death"]) expect(clips.has(roles[role]), `${body} ${role}`).toBe(true);
      for (const role of ROLES) if (roles[role]) expect(clips.has(roles[role]), `${body} ${role}`).toBe(true);
    }
  });

  it("attacks with every weapon, by one of a few groups of clips", () => {
    const clips = characterClips(characterMesh(resolveRecipe()), baked);
    for (const weapon of WEAPONS) {
      const roles = roleClips(resolveRecipe({ weapon }), "humanoid");
      for (const role of ["attack", "bigAttack"]) expect(clips.has(roles[role]), `${weapon} ${role}`).toBe(true);
      if (roles.shoot) expect(clips.has(roles.shoot), `${weapon} shoot`).toBe(true);
    }
    expect(new Set(WEAPONS.map(attackGroup)).size).toBeLessThanOrEqual(6);
  });

  it("gives a wolf its own clips, on its own bones", () => {
    const mesh = characterMesh(wolf());
    const clips = characterClips(mesh, baked);
    expect([...clips.keys()].some((name) => clipNames(baked).includes(name) && !["Idle_Loop", "Walk_Loop", "Run_Fwd_Loop"].includes(name))).toBe(false);
    for (const clip of clips.values()) {
      for (const track of clip.tracks) expect(mesh.skeleton.getBoneByName(track.name.split(".")[0]), track.name).toBeTruthy();
    }
    expect(clips.get("Run_Fwd_Loop").userData.speed).toBeGreaterThan(clips.get("Walk_Loop").userData.speed);
  });

  it("lays a dead wolf on its side, near the ground", () => {
    const mesh = characterMesh(wolf());
    const mixer = new THREE.AnimationMixer(mesh);
    const clip = characterClips(mesh, baked).get("Death");
    mixer.clipAction(clip).play();
    mixer.setTime(clip.duration - 0.01);
    mesh.updateMatrixWorld(true);
    const at = (bone) => new THREE.Vector3().setFromMatrixPosition(mesh.skeleton.getBoneByName(bone).matrixWorld);
    expect(at("spine_02").y).toBeLessThan(1);
    expect(Math.abs(at("hand_l").y - at("hand_r").y)).toBeGreaterThan(0.4);
  });
});
