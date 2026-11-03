import { SHIPPED_BODIES } from "../character/bodies.js";
import { FRAMES } from "../character/frames.js";
import { colorationProblems } from "../character/paint.js";

// A world's models (.agents/formats.md), models.json: `bodies`, its own bodies by name, and
// `colorations`, the patterns and colorations it adds to shipped bodies, by the body's name.

const SKELETONS = ["humanoid", ...Object.keys(FRAMES)];
const NAME = /^[a-z][a-z0-9-]*$/;
const isObject = (v) => v !== null && typeof v === "object" && !Array.isArray(v);

// The models as useModels takes them, leaving out what isn't an object.
export function modelsOf(file) {
  const pick = (group) => Object.fromEntries(Object.entries(isObject(group) ? group : {}).filter(([, v]) => isObject(v)));
  return { bodies: pick(file?.bodies), colorations: pick(file?.colorations) };
}

// What's wrong with models.json.
export function modelProblems(file) {
  if (!isObject(file)) return ["should be an object"];
  const out = [];
  for (const key of ["bodies", "colorations"]) if (file[key] !== undefined && !isObject(file[key])) out.push(`needs ${key} as an object, by body name`);
  for (const [name, body] of Object.entries(isObject(file.bodies) ? file.bodies : {})) {
    const problem = (m) => out.push(`body ${name} ${m}`);
    if (!NAME.test(name)) problem("needs a name of lowercase letters, digits and dashes");
    if (!isObject(body)) {
      problem("should be an object");
      continue;
    }
    if (!SKELETONS.includes(body.skeleton)) problem(`has skeleton ${JSON.stringify(body.skeleton)}, not one of ${SKELETONS.join(", ")}`);
    if (!(body.scale > 0)) problem("needs a scale above 0");
    if (body.skeleton !== "humanoid" && !isObject(body.shape)) problem("needs a shape, its skeleton's builder's settings");
    if (body.look !== undefined && !isObject(body.look)) problem("needs its look as an object");
    if (body.colorations !== undefined) for (const m of colorationProblems(body.colorations, body.patterns)) problem(m);
  }
  for (const [name, added] of Object.entries(isObject(file.colorations) ? file.colorations : {})) {
    const problem = (m) => out.push(`colorations for ${name} ${m}`);
    const shipped = SHIPPED_BODIES[name];
    if (!shipped) {
      problem("are for a body the game doesn't ship");
      continue;
    }
    if (!isObject(added)) {
      problem("should be an object");
      continue;
    }
    for (const m of colorationProblems(added.colorations ?? [], { ...shipped.patterns, ...added.patterns })) problem(m);
    const taken = new Set((shipped.colorations ?? []).map((c) => c.name));
    for (const c of Array.isArray(added.colorations) ? added.colorations : []) if (taken.has(c?.name)) problem(`add ${JSON.stringify(c.name)}, which ${name} already has`);
  }
  return out;
}
