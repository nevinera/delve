import { BATS, batClips, batMesh, batRoles } from "./bat.js";
import { BIRDS, birdClips, birdMesh, birdRoles } from "./bird.js";
import { CRAWLERS, crawlerClips, crawlerMesh, crawlerRoles } from "./crawler.js";
import { DRAGONS, dragonClips, dragonMesh, dragonRoles } from "./dragon.js";
import { EYESHAUGS, eyeshaugClips, eyeshaugMesh, eyeshaugRoles } from "./eyeshaug.js";
import { SERPENTS, serpentClips, serpentMesh, serpentRoles } from "./serpent.js";
import { FISH, fishClips, fishMesh, fishRoles } from "./fish.js";
import { SLIMES, slimeClips, slimeMesh, slimeRoles } from "./slime.js";
import { STRIDERS, striderClips, striderMesh, striderRoles } from "./strider.js";
import { quadrupedClips, quadrupedMesh, quadrupedRoles, SPECIES } from "./quadruped.js";
import { bodiesOn } from "./bodies.js";

// The skeletons bodies are built on, besides body.js's humanoid: for each, how to build a mesh
// for a look (as body.js's bodyMesh, with the scale its clips move the pelvis by), its clips (as
// animations.js's characterClips), the clip for each creature role (animations.js's ROLES), and
// the look's settings and colors it takes (recipe.js), where a humanoid takes them all.
const FOUR_LEGS = { mesh: quadrupedMesh, clips: quadrupedClips, roles: quadrupedRoles, settings: ["height", "build", "limbs", "head"], colors: ["skin", "hair", "secondary", "eyes"] };
const DRAGON = { mesh: dragonMesh, clips: dragonClips, roles: dragonRoles, settings: ["height", "build", "limbs", "head"], colors: ["skin", "secondary", "hair", "eyes"] };
const SERPENT = { mesh: serpentMesh, clips: serpentClips, roles: serpentRoles, settings: ["height", "build", "head"], colors: ["skin", "secondary", "hair", "eyes"] };
const SWIMMER = { mesh: fishMesh, clips: fishClips, roles: fishRoles, settings: ["height", "build"], colors: ["skin", "secondary", "hair", "eyes"] };
const BAT = { mesh: batMesh, clips: batClips, roles: batRoles, settings: ["height", "build", "head"], colors: ["skin", "secondary", "hair", "eyes"] };
const CRAWLER = { mesh: crawlerMesh, clips: crawlerClips, roles: crawlerRoles, settings: ["height", "build", "limbs"], colors: ["skin", "secondary", "hair", "eyes"] };
const BIRD = { mesh: birdMesh, clips: birdClips, roles: birdRoles, settings: ["height", "build", "head"], colors: ["skin", "secondary", "hair", "eyes"] };
const STRIDER = { mesh: striderMesh, clips: striderClips, roles: striderRoles, settings: ["height", "build", "head"], colors: ["skin", "secondary", "hair", "eyes"] };
const EYESHAUG = { mesh: eyeshaugMesh, clips: eyeshaugClips, roles: eyeshaugRoles, settings: ["height", "build"], colors: ["skin", "secondary", "eyes"] };
const SLIME = { mesh: slimeMesh, clips: slimeClips, roles: slimeRoles, settings: ["height", "build"], colors: ["skin", "eyes"] };
export const FRAMES = { canine: FOUR_LEGS, feline: FOUR_LEGS, ursine: FOUR_LEGS, hoofed: FOUR_LEGS, lizard: FOUR_LEGS, pachyderm: FOUR_LEGS, dragon: DRAGON, serpent: SERPENT, fish: SWIMMER, ray: SWIMMER, bat: BAT, crawler: CRAWLER, slime: SLIME, bird: BIRD, strider: STRIDER, eyeshaug: EYESHAUG };

// The skeletons, and the bodies built on each. Bodies not built yet stand as humanoids.
export const SKELETONS = { humanoid: ["humanoid", ...bodiesOn("humanoid")] };
for (const [body, { family }] of Object.entries(SPECIES)) (SKELETONS[family] ??= []).push(body);
SKELETONS.dragon = Object.keys(DRAGONS);
SKELETONS.serpent = Object.keys(SERPENTS);
SKELETONS.bat = Object.keys(BATS);
SKELETONS.crawler = Object.keys(CRAWLERS);
SKELETONS.slime = Object.keys(SLIMES);
SKELETONS.bird = Object.keys(BIRDS);
SKELETONS.strider = Object.keys(STRIDERS);
SKELETONS.eyeshaug = Object.keys(EYESHAUGS);
for (const [body, { family }] of Object.entries(FISH)) (SKELETONS[family] ??= []).push(body);

export const skeletonOf = (body) => Object.keys(SKELETONS).find((name) => SKELETONS[name].includes(body)) ?? "humanoid";

// A body's own height in feet, as its builder shapes it before scaling it to a look's height: 6 for
// a humanoid. Worked out once for each body, from the first look asked about.
const natives = new Map();
export function nativeHeight(look) {
  const frame = FRAMES[skeletonOf(look.body)];
  if (!frame) return 6;
  if (!natives.has(look.body)) natives.set(look.body, 1 / frame.mesh({ ...look, height: 1 }).scale);
  return natives.get(look.body);
}
