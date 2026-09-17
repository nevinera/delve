// The zone graph's node/satellite positions, as a persistable file (see
// plans/zone-editor.md step 11's <zone>.layout.json) - kept separate from
// the zone's own JSON since it's purely an editor display concern, not
// part of the zone schema.
//
// Only ever holds *overrides* - the same drag-override map ZoneGraphCanvas
// already keeps internally (see its onPositionsChange), reported here via
// a thin, stable wrapper rather than the raw internal shape. A map/
// satellite with no override keeps using circleLayout's dynamic default
// (see ZoneGraphCanvas's own nodePosition), so adding/removing maps later
// never requires this file to be kept in sync - it only ever describes
// what an author explicitly dragged.
export function buildLayoutMetadata(positions) {
  return {positions};
}
