import { DRAGONS, dragonClips, dragonMesh, dragonRoles } from "./dragon.js";
import { quadrupedClips, quadrupedMesh, quadrupedRoles, SPECIES } from "./quadruped.js";

// The skeletons bodies are built on, besides body.js's humanoid: for each, how to build a mesh
// for a look (as body.js's bodyMesh, with the scale its clips move the pelvis by), its clips (as
// animations.js's characterClips), the clip for each creature role (animations.js's ROLES), and
// the look's settings and colors it takes (recipe.js), where a humanoid takes them all.
const FOUR_LEGS = { mesh: quadrupedMesh, clips: quadrupedClips, roles: quadrupedRoles, settings: ["height", "build", "limbs", "head"], colors: ["skin", "hair", "secondary", "eyes"] };
const DRAGON = { mesh: dragonMesh, clips: dragonClips, roles: dragonRoles, settings: ["height", "build", "limbs", "head"], colors: ["skin", "secondary", "hair", "eyes"] };
export const FRAMES = { canine: FOUR_LEGS, ursine: FOUR_LEGS, hoofed: FOUR_LEGS, lizard: FOUR_LEGS, dragon: DRAGON };

// The skeletons, and the bodies built on each. Bodies not built yet stand as humanoids.
export const SKELETONS = { humanoid: ["humanoid", "goblin", "troll", "orc", "ogre", "kobold", "gnoll", "lizardfolk", "minotaur", "skeleton", "zombie", "giant", "harpy", "gargoyle", "imp"] };
for (const [body, { family }] of Object.entries(SPECIES)) (SKELETONS[family] ??= []).push(body);
SKELETONS.dragon = Object.keys(DRAGONS);

export const skeletonOf = (body) => Object.keys(SKELETONS).find((name) => SKELETONS[name].includes(body)) ?? "humanoid";
