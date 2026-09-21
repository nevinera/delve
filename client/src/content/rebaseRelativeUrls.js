// Every $ref-flattening editor (zoneEditor's resolveZoneRefs, classEditor's
// resolveFullClass, unitTypeEditor's resolveFullUnitType) splices a
// referenced file's raw content into a document that lives somewhere else
// in the repo. Any *plain* relative URL string inside that content (as
// opposed to a $ref, which resolveZoneRefs/resolveReferences already
// handle) is still relative to the referenced file's own directory - once
// embedded, it needs rewriting to stay relative to the resolving
// document's directory instead. rebaseRelativeUrls does that rewrite,
// walking the whole value and touching only the schema's known
// asset-URL fields.
//
// Field names are schema-wide (see docs/schema/{ability,graphic_effect,
// sound_effect,aura_effect,map,unit_type,world,common}.md) - the mixed
// casing ("iconURL"/"sourceURL" vs "imageUrl"/"thumbnailUrl"/
// "tokenImageUrl") comes straight from the schema itself, not a typo, so
// both are matched here.
const URL_FIELD_NAMES = new Set(["iconURL", "sourceURL", "imageUrl", "thumbnailUrl", "tokenImageUrl"]);

function isStockReference(value) {
  return value.startsWith(":") && value.endsWith(":");
}

// Only a same-repo relative path needs rebasing - an absolute URL (http(s),
// protocol-relative, or a leading "/") already points somewhere fixed, and
// a stock reference has no repo file at all (docs/schema/common.md#stock-asset-reference).
function isRebasable(value) {
  return typeof value === "string" && value !== "" && !isStockReference(value) &&
    !value.startsWith("/") && !/^[a-z][a-z0-9+.-]*:\/\//i.test(value);
}

// dirname of a repo-relative path, e.g. "zones/goblin-cave/goblin-cave.json"
// -> "zones/goblin-cave". "" (repo root) for a bare filename.
export function dirname(path) {
  const i = path.lastIndexOf("/");
  return i === -1 ? "" : path.slice(0, i);
}

// Resolves relativePath against baseDir (a directory, not a file) to a
// repo-root-relative path - the same URL trick every editor's own
// resolveRelativePath already uses for a single lookup; rebaseOne below
// chains it with relativeFromDir to re-express the result from a new base.
function resolveAgainstDir(baseDir, relativePath) {
  const url = new URL(relativePath, `https://_/${baseDir}/`);
  return url.pathname.replace(/^\//, "");
}

// Expresses toPath (a repo-root-relative *file* path) as a path relative to
// fromDir (a repo-root-relative *directory*) - a from-scratch equivalent of
// Node's path.relative, since this runs in the browser. Compares directory
// segments only (toPath's last segment is always the filename, never part
// of the common prefix).
function relativeFromDir(fromDir, toPath) {
  const fromParts = fromDir.split("/").filter(Boolean);
  const toParts = toPath.split("/").filter(Boolean);
  let i = 0;
  while (i < fromParts.length && i < toParts.length - 1 && fromParts[i] === toParts[i]) i++;
  const ups = fromParts.length - i;
  return [...Array(ups).fill(".."), ...toParts.slice(i)].join("/");
}

function rebaseOne(value, sourceDir, targetDir) {
  if (!isRebasable(value)) return value;
  return relativeFromDir(targetDir, resolveAgainstDir(sourceDir, value));
}

// Rewrites every relative asset-URL field found anywhere in data (which may
// itself be a string, an array of strings - tokenImageUrl's variant-list
// form - or a nested object/array) so it stays correct once embedded in a
// document at targetDir instead of the content's own sourceDir.
export function rebaseRelativeUrls(data, sourceDir, targetDir) {
  if (Array.isArray(data)) {
    return data.map((item) => rebaseRelativeUrls(item, sourceDir, targetDir));
  }
  if (data !== null && typeof data === "object") {
    return Object.fromEntries(
      Object.entries(data).map(([key, value]) => {
        if (!URL_FIELD_NAMES.has(key)) return [key, rebaseRelativeUrls(value, sourceDir, targetDir)];
        const rebased = Array.isArray(value)
          ? value.map((v) => rebaseOne(v, sourceDir, targetDir))
          : rebaseOne(value, sourceDir, targetDir);
        return [key, rebased];
      })
    );
  }
  return data;
}
