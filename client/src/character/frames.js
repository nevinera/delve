import { batClips, batMesh, batRoles } from "./bat.js";
import { birdClips, birdMesh, birdRoles } from "./bird.js";
import { crawlerClips, crawlerMesh, crawlerRoles } from "./crawler.js";
import { dragonClips, dragonMesh, dragonRoles } from "./dragon.js";
import { eyeshaugClips, eyeshaugMesh, eyeshaugRoles } from "./eyeshaug.js";
import { serpentClips, serpentMesh, serpentRoles } from "./serpent.js";
import { fishClips, fishMesh, fishRoles } from "./fish.js";
import { slimeClips, slimeMesh, slimeRoles } from "./slime.js";
import { striderClips, striderMesh, striderRoles } from "./strider.js";
import { quadrupedClips, quadrupedMesh, quadrupedRoles } from "./quadruped.js";
import { BODIES, bodiesOn, followBodies } from "./bodies.js";

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

// The skeletons, and the bodies in use built on each (bodies.js), by their own names, not their
// core: ones. Bodies not built yet stand as humanoids.
const ORDER = ["humanoid", "canine", "feline", "ursine", "hoofed", "lizard", "pachyderm", "dragon", "serpent", "fish", "ray", "bat", "crawler", "slime", "bird", "strider", "eyeshaug"];
export const SKELETONS = {};
const natives = new Map();
followBodies(() => {
  for (const name of Object.keys(SKELETONS)) delete SKELETONS[name];
  for (const skeleton of ORDER) {
    const names = bodiesOn(skeleton).filter((name) => !name.startsWith("core:"));
    if (skeleton === "humanoid") names.unshift("humanoid");
    if (names.length) SKELETONS[skeleton] = names;
  }
  natives.clear();
});

export const skeletonOf = (body) => BODIES[body]?.skeleton ?? "humanoid";

// A body's own height in feet, as its builder shapes it before scaling it to a look's height: 6 for
// a humanoid. Worked out once for each body, from the first look asked about.
export function nativeHeight(look) {
  const frame = FRAMES[skeletonOf(look.body)];
  if (!frame) return 6;
  if (!natives.has(look.body)) natives.set(look.body, 1 / frame.mesh({ ...look, height: 1 }).scale);
  return natives.get(look.body);
}
