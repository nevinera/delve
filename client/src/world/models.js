import { SHIPPED_BODIES } from "../character/bodies.js";
import { FRAMES } from "../character/frames.js";
import { colorationProblems } from "../character/paint.js";
import { modelAt } from "./paths.js";

// A world's models (docs/formats/bodies.md): its own bodies, and the patterns and colorations it
// adds to shipped bodies, as useModels takes them, from its files. `json` reads a path.
export function modelsOf(paths, json) {
  const models = { bodies: {}, colorations: {} };
  for (const path of paths) {
    const at = modelAt(path);
    if (!at || at.bad) continue;
    const thing = json(path);
    if (thing && typeof thing === "object" && !Array.isArray(thing)) models[at.kind][at.name] = thing;
  }
  return models;
}

const SKELETONS = ["humanoid", ...Object.keys(FRAMES)];
const isObject = (v) => v !== null && typeof v === "object" && !Array.isArray(v);

// What's wrong with a models file, as [path, message] pairs.
export function modelProblems(path, thing) {
  const at = modelAt(path);
  if (at.bad) return ["isn't a models file: models/bodies/<name>.json or models/colorations/<name>.json, the name in lowercase letters, digits and dashes"];
  if (!isObject(thing)) return ["should be an object"];
  const out = [];
  if (at.kind === "bodies") {
    if (!SKELETONS.includes(thing.skeleton)) out.push(`has skeleton ${JSON.stringify(thing.skeleton)}, not one of ${SKELETONS.join(", ")}`);
    if (!(thing.scale > 0)) out.push("needs a scale above 0");
    if (thing.skeleton !== "humanoid" && !isObject(thing.shape)) out.push("needs a shape, its skeleton's builder's settings");
    if (thing.look !== undefined && !isObject(thing.look)) out.push("needs its look as an object");
    if (thing.colorations !== undefined) out.push(...colorationProblems(thing.colorations, thing.patterns));
  } else {
    const shipped = SHIPPED_BODIES[at.name];
    if (!shipped) return [`adds to body ${at.name}, which the game doesn't ship`];
    const patterns = { ...shipped.patterns, ...thing.patterns };
    out.push(...colorationProblems(thing.colorations ?? [], patterns));
    const taken = new Set((shipped.colorations ?? []).map((c) => c.name));
    for (const c of Array.isArray(thing.colorations) ? thing.colorations : []) if (taken.has(c?.name)) out.push(`adds coloration ${JSON.stringify(c.name)}, which ${at.name} already has`);
  }
  return out;
}
