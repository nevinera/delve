// A zone's maps are always $ref entries in real content (see
// plans/zone-editor.md) - "./<key>/<key>.json", the same basename-matched
// convention Build::MapsController's #map_path already uses. Shared by
// ZoneMapsPanel and ZoneGraphCanvas, which both need to turn a $ref back
// into the key mapDetailsByKey is keyed by, and vice versa.
export function keyFromRef(ref) {
  return ref.replace(/^\.\//, "").split("/")[0];
}

export function refFromKey(key) {
  return `./${key}/${key}.json`;
}

// The map editor's own edit URL for a map already in this zone - matches
// Build::MapsController's key-based route (`get "build/maps/*id/edit"`)
// exactly, no `edit_build_map_path` helper available client-side. Used by
// read-only lists (items, unit types) that link out to "the relevant map"
// rather than editing anything themselves.
export function mapEditPath(zoneKey, mapKey) {
  return `/build/maps/${zoneKey}/${mapKey}/edit`;
}
