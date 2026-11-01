// The bodies the game ships (docs/formats/bodies.md), one file each in bodies/: its skeleton, the
// shape its skeleton's builder makes it from, and the look its creatures are picked from.
const files = import.meta.glob("./bodies/*.json", { eager: true, import: "default" });

export const SHIPPED_BODIES = Object.fromEntries(Object.entries(files).map(([path, body]) => [path.match(/([\w-]+)\.json$/)[1], body]));

// The shapes of the bodies on any of the skeletons, by name, each with its skeleton as `family`.
export function shapesOn(...skeletons) {
  const on = Object.entries(SHIPPED_BODIES).filter(([, body]) => skeletons.includes(body.skeleton));
  return Object.fromEntries(on.map(([name, body]) => [name, { family: body.skeleton, ...body.shape }]));
}

// The names of the bodies on a skeleton.
export const bodiesOn = (skeleton) => Object.keys(SHIPPED_BODIES).filter((name) => SHIPPED_BODIES[name].skeleton === skeleton);

// Each body's look, by name.
export const SHIPPED_LOOKS = Object.fromEntries(Object.entries(SHIPPED_BODIES).map(([name, body]) => [name, body.look ?? {}]));
