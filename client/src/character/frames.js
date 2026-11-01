import { quadrupedClips, quadrupedMesh, quadrupedRoles, SPECIES } from "./quadruped.js";

// The skeletons bodies are built on, besides body.js's humanoid: for each, how to build a mesh
// for a look (as body.js's bodyMesh, with the scale its clips move the pelvis by), its clips (as
// animations.js's characterClips) and the clip for each creature role (animations.js's ROLES).
export const FRAMES = {
  canine: { mesh: quadrupedMesh, clips: quadrupedClips, roles: quadrupedRoles },
  ursine: { mesh: quadrupedMesh, clips: quadrupedClips, roles: quadrupedRoles },
  hoofed: { mesh: quadrupedMesh, clips: quadrupedClips, roles: quadrupedRoles },
  lizard: { mesh: quadrupedMesh, clips: quadrupedClips, roles: quadrupedRoles },
};

// The skeletons, and the bodies built on each. Bodies not built yet stand as humanoids.
export const SKELETONS = { humanoid: ["humanoid", "goblin", "troll"] };
for (const [body, { family }] of Object.entries(SPECIES)) (SKELETONS[family] ??= []).push(body);

export const skeletonOf = (body) => Object.keys(SKELETONS).find((name) => SKELETONS[name].includes(body)) ?? "humanoid";
