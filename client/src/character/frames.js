import { BATS, batClips, batMesh, batRoles } from "./bat.js";
import { BIRDS, birdClips, birdMesh, birdRoles } from "./bird.js";
import { CRAWLERS, crawlerClips, crawlerMesh, crawlerRoles } from "./crawler.js";
import { DRAGONS, dragonClips, dragonMesh, dragonRoles } from "./dragon.js";
import { SERPENTS, serpentClips, serpentMesh, serpentRoles } from "./serpent.js";
import { FISH, fishClips, fishMesh, fishRoles } from "./fish.js";
import { SLIMES, slimeClips, slimeMesh, slimeRoles } from "./slime.js";
import { STRIDERS, striderClips, striderMesh, striderRoles } from "./strider.js";
import { quadrupedClips, quadrupedMesh, quadrupedRoles, SPECIES } from "./quadruped.js";

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
const SLIME = { mesh: slimeMesh, clips: slimeClips, roles: slimeRoles, settings: ["height", "build"], colors: ["skin", "eyes"] };
export const FRAMES = { canine: FOUR_LEGS, ursine: FOUR_LEGS, hoofed: FOUR_LEGS, lizard: FOUR_LEGS, pachyderm: FOUR_LEGS, dragon: DRAGON, serpent: SERPENT, fish: SWIMMER, ray: SWIMMER, bat: BAT, crawler: CRAWLER, slime: SLIME, bird: BIRD, strider: STRIDER };

// The skeletons, and the bodies built on each. Bodies not built yet stand as humanoids.
export const SKELETONS = { humanoid: ["humanoid", "goblin", "troll", "orc", "ogre", "kobold", "gnoll", "lizardfolk", "tauros", "skeleton", "zombie", "giant", "harpy", "gargoyle", "imp", "centaur", "naga", "amphen", "georite", "furite", "aquite", "aerite", "boric", "ursol", "trog", "homari", "tyrshaug", "drakel", "abomination", "ghoul", "mummy", "lich", "banshee", "ghost", "deepshaug", "smoulder", "treant", "dryad", "succubus", "hivelord", "cindershaug", "golem", "mycosi", "drakesh"] };
for (const [body, { family }] of Object.entries(SPECIES)) (SKELETONS[family] ??= []).push(body);
SKELETONS.dragon = Object.keys(DRAGONS);
SKELETONS.serpent = Object.keys(SERPENTS);
SKELETONS.bat = Object.keys(BATS);
SKELETONS.crawler = Object.keys(CRAWLERS);
SKELETONS.slime = Object.keys(SLIMES);
SKELETONS.bird = Object.keys(BIRDS);
SKELETONS.strider = Object.keys(STRIDERS);
for (const [body, { family }] of Object.entries(FISH)) (SKELETONS[family] ??= []).push(body);

export const skeletonOf = (body) => Object.keys(SKELETONS).find((name) => SKELETONS[name].includes(body)) ?? "humanoid";
