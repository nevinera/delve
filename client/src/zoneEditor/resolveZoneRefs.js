import {fetchFilesBatch} from "../github/fetchFilesBatch";
import {dirname, rebaseRelativeUrls} from "../content/rebaseRelativeUrls";

// True for an AssetReference shape (see docs/schema/common.md) - a $ref
// plus its referenceTo tag, as used by a zone's `maps`/`unitTypes` entries,
// or a unit_type's own `powers` entries.
function isRef(value) {
  return Boolean(value) && typeof value === "object" && typeof value.$ref === "string";
}

// Resolves a $ref string against the directory of the file *containing*
// it - not always the zone's own directory (e.g. a unit_type's `powers`
// reference ability files relative to the unit_type's own path). Same
// relative-URL trick saveMap.js/saveAbility.js already use to resolve
// imageUrl/etc.
function resolvePath(baseDir, ref) {
  const url = new URL(ref, `https://_/${baseDir}/`);
  return url.pathname.replace(/^\//, "");
}

// Walks a value looking for AssetReference nodes, recording enough to
// both fetch (the resolved repo path) and later substitute (the parent
// container + key to write the resolved content into) each one.
function collectRefs(node, baseDir, refs) {
  if (Array.isArray(node)) {
    node.forEach((item, i) => {
      if (isRef(item)) refs.push({parent: node, key: i, path: resolvePath(baseDir, item.$ref)});
      else collectRefs(item, baseDir, refs);
    });
  } else if (node && typeof node === "object") {
    for (const key of Object.keys(node)) {
      const value = node[key];
      if (isRef(value)) refs.push({parent: node, key, path: resolvePath(baseDir, value.$ref)});
      else collectRefs(value, baseDir, refs);
    }
  }
}

// Inlines every $ref in a zone draft, recursively - a referenced file may
// itself contain further $refs (e.g. a unit_type's `powers` referencing
// ability files), so this resolves in breadth-first passes: every $ref at
// the current depth is fetched together in one batch (see
// fetchFilesBatch.js), then the newly-inlined content is scanned for the
// *next* depth's $refs, and so on until none remain. zoneDirPath is the
// zone's own directory ("zones/<zoneKey>") - what its own maps/unitTypes
// $refs resolve relative to.
export async function resolveZoneRefs(zoneData, zoneDirPath) {
  const root = structuredClone(zoneData);

  let frontier = [];
  collectRefs(root, zoneDirPath, frontier);

  while (frontier.length > 0) {
    const contents = await fetchFilesBatch(frontier.map((ref) => ref.path));

    const nextFrontier = [];
    for (const ref of frontier) {
      const raw = contents[ref.path];
      if (raw == null) throw new Error(`Could not resolve $ref: ${ref.path}`);
      // Every asset-URL field in this file needs rewriting now that it's
      // about to live at zoneDirPath instead of its own directory (see
      // rebaseRelativeUrls.js) - rebase first, then splice and collect
      // further $refs from that same (rebased) object, so nextFrontier's
      // parent/key pairs point into what's actually in the tree.
      // rebaseRelativeUrls never touches $ref fields, so the refs
      // themselves are unaffected and still resolve relative to *this*
      // file's own directory, not the zone's.
      const resolved = rebaseRelativeUrls(JSON.parse(raw), dirname(ref.path), zoneDirPath);
      ref.parent[ref.key] = resolved;
      collectRefs(resolved, dirname(ref.path), nextFrontier);
    }
    frontier = nextFrontier;
  }

  return root;
}
