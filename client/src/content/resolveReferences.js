// Recursively expands every AssetReference (a {$ref, referenceTo} object -
// see docs/schema/common.md#assetreference) found anywhere in `data` into
// the content `lookup` returns for it, producing the "full" (concrete) form
// of an otherwise-abstract config. This is the same shared behavior every
// editor needs to build its own <key>.full.json (classes today; units,
// maps, and zones will reuse this unchanged) - only what a $ref actually
// means (how to fetch/parse it) differs per editor, so that's injected
// rather than hardcoded here.
//
// lookup(ref, referenceTo) => resolved content for that reference, or a
// Promise of it. A referenced file may itself contain further references -
// those are resolved recursively, so `lookup` only ever needs to return
// that file's own (possibly still-abstract) content, not resolve it itself.
export async function resolveReferences(data, lookup) {
  if (Array.isArray(data)) {
    return Promise.all(data.map((item) => resolveReferences(item, lookup)));
  }

  if (isAssetReference(data)) {
    const referenced = await lookup(data.$ref, data.referenceTo);
    return resolveReferences(referenced, lookup);
  }

  if (data !== null && typeof data === "object") {
    const resolvedEntries = await Promise.all(
      Object.entries(data).map(async ([key, value]) => [key, await resolveReferences(value, lookup)])
    );
    return Object.fromEntries(resolvedEntries);
  }

  return data;
}

function isAssetReference(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value) && typeof value.$ref === "string";
}
