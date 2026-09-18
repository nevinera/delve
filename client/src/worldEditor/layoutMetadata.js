// The world graph's node/satellite positions, as a persistable file (see
// worlds/<key>.layout.json) - kept separate from the world's own JSON
// since it's purely an editor display concern, not part of the World
// schema. Same shape as zoneEditor/layoutMetadata.js, duplicated rather
// than cross-imported (see circleLayout.js/graphView.js's own comments).
//
// Only ever holds *overrides* - the same drag-override map
// WorldGraphCanvas already keeps internally (see its onPositionsChange),
// reported here via a thin, stable wrapper. A zone/satellite with no
// override keeps using circleLayout's dynamic default, so adding/removing
// zones later never requires this file to be kept in sync - it only ever
// describes what an author explicitly dragged.
export function buildLayoutMetadata(positions) {
  return {positions};
}
