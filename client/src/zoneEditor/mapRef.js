// A zone's maps are always $ref entries in real content (see
// plans/zone-editor.md) - "./<key>/<key>.json", the same basename-matched
// convention every zone uses. Shared by
// ZoneMapsPanel and ZoneGraphCanvas, which both need to turn a $ref back
// into the key mapDetailsByKey is keyed by, and vice versa.
export function keyFromRef(ref) {
  return ref.replace(/^\.\//, "").split("/")[0];
}

export function refFromKey(key) {
  return `./${key}/${key}.json`;
}
