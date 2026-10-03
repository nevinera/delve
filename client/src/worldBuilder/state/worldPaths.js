// Where everything in a self-contained world lives (see
// plans/world-editor/README.md, "A world is self-contained").

export const IDENTIFIER_FORMAT = /^[A-Za-z0-9_-]+$/;

export function isValidIdentifier(identifier) {
  return typeof identifier === "string" && IDENTIFIER_FORMAT.test(identifier);
}

export const worldDir = (world) => `worlds/${world}`;
export const worldFile = (world) => `${worldDir(world)}/${world}.json`;
export const worldLayoutFile = (world) => `${worldDir(world)}/${world}.layout.json`;

export const zonesDir = (world) => `${worldDir(world)}/zones`;
export const zoneDir = (world, zone) => `${zonesDir(world)}/${zone}`;
export const zoneFile = (world, zone) => `${zoneDir(world, zone)}/${zone}.json`;
export const zoneLayoutFile = (world, zone) => `${zoneDir(world, zone)}/${zone}.layout.json`;
export const zoneFullFile = (world, zone) => `${zoneDir(world, zone)}/${zone}.full.json`;

export const mapDir = (world, zone, map) => `${zoneDir(world, zone)}/${map}`;
export const mapFile = (world, zone, map) => `${mapDir(world, zone, map)}/${map}.json`;

export const unitTypeFile = (world, key) => `${worldDir(world)}/unit_types/${key}.json`;
export const itemFile = (world, key) => `${worldDir(world)}/items/${key}.json`;

// Resolves `relative` against the directory holding `fromFile`, both
// repo-relative ("worlds/w/zones/a/a.json" + "../../unit_types/x.json" ->
// "worlds/w/unit_types/x.json"). Null if it climbs out of the repo.
export function resolvePath(fromFile, relative) {
  const parts = fromFile.split("/").slice(0, -1);
  for (const segment of relative.split("/")) {
    if (segment === "" || segment === ".") continue;
    if (segment === "..") {
      if (parts.length === 0) return null;
      parts.pop();
    } else {
      parts.push(segment);
    }
  }
  return parts.join("/");
}

// The relative path from `fromFile`'s directory to `target`, "./"-prefixed
// when it doesn't climb (the content repo's own convention).
export function relativePath(fromFile, target) {
  const from = fromFile.split("/").slice(0, -1);
  const to = target.split("/");
  let common = 0;
  while (common < from.length && common < to.length - 1 && from[common] === to[common]) common++;
  const ups = from.length - common;
  const rest = to.slice(common).join("/");
  return ups === 0 ? `./${rest}` : `${"../".repeat(ups)}${rest}`;
}
