import { useMemo } from "react";
import AtlasCanvas from "./worldEditor/AtlasCanvas";
import { visibleAtlas } from "./game/atlasVisibility";

const panelBase = {
  position: "fixed",
  zIndex: 25,
  background: "rgba(20,16,12,0.97)",
  border: "1px solid #7a5a2a",
  borderRadius: 6,
  display: "flex",
  flexDirection: "column",
  overflow: "hidden",
};

const styles = {
  wrapper: {...panelBase, top: 40, bottom: 40, left: "50%", transform: "translateX(-50%)", width: "min(1000px, calc(100vw - 80px))"},
  wrapperPortrait: {...panelBase, left: 8, right: 8, top: 100, bottom: 110 + 34},
  wrapperLandscape: {...panelBase, top: 16, left: 16, right: 16, bottom: 16},
  header: {display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 14px"},
  title: {fontSize: 15, fontWeight: "bold", color: "#d4a84b", letterSpacing: 1, textTransform: "uppercase"},
  close: {background: "none", border: "none", color: "#aaa", cursor: "pointer", fontSize: 14},
  canvas: {flex: 1, minHeight: 0},
  empty: {color: "#889", fontStyle: "italic", padding: "0 14px 14px"},
};

// What AtlasCanvas takes, from the world's published atlas
// (WorldContent::Atlas.payload): {atlas, sizes, zoneNames, mapNames,
// thumbnails, links}.
export function canvasProps(payload) {
  const atlas = {zones: {}};
  const [sizes, mapNames, thumbnails] = [{}, {}, {}];
  for (const [zone, {outline}] of Object.entries(payload?.zones ?? {})) {
    atlas.zones[zone] = {outline, maps: {}};
    sizes[zone] = {};
    mapNames[zone] = {};
    thumbnails[zone] = {};
  }
  for (const m of payload?.maps ?? []) {
    if (!atlas.zones[m.zone]) continue;
    atlas.zones[m.zone].maps[m.map] = {x: m.x, y: m.y};
    sizes[m.zone][m.map] = {width: m.width, height: m.height};
    mapNames[m.zone][m.map] = m.name;
    if (m.thumbnail_url) thumbnails[m.zone][m.map] = m.thumbnail_url;
  }
  const zoneNames = Object.fromEntries(Object.entries(payload?.zones ?? {}).map(([key, z]) => [key, z.name || key]));
  return {atlas, sizes, zoneNames, mapNames, thumbnails, links: payload?.links ?? []};
}

// The in-game map: the world's atlas, read-only, opened on the current map
// with an arrow where the player is. Only what's been visited shows (see
// game/atlasVisibility.js); visited is the visit keys, or null to show
// everything. position is the player's {x, y, angle} on map, in its own
// feet.
export function AtlasWindow({open, atlas: payload, visited = null, zone, map, position, onClose, portrait = false, landscape = false}) {
  const props = useMemo(() => {
    const all = {...canvasProps(payload), fog: [], stubs: []};
    return visited ? visibleAtlas(all, payload, visited) : all;
  }, [payload, visited]);
  if (!open) return null;
  const placed = props.atlas.zones[zone]?.maps[map];
  const marker = placed && position ? {x: placed.x + position.x, y: placed.y + position.y, angle: position.angle} : null;
  const laidOut = Object.keys(props.atlas.zones).length > 0;
  return (
    <div style={portrait ? styles.wrapperPortrait : landscape ? styles.wrapperLandscape : styles.wrapper}>
      <div style={styles.header}>
        <span style={styles.title}>Map</span>
        <button style={styles.close} aria-label="Close map" onClick={onClose}>✕</button>
      </div>
      {laidOut ? (
        <div style={styles.canvas}>
          <AtlasCanvas
            atlas={props.atlas}
            sizes={props.sizes}
            zoneNames={props.zoneNames}
            mapNames={props.mapNames}
            thumbnails={props.thumbnails}
            linksFor={() => props.links}
            onChange={() => {}}
            editable={false}
            marker={marker}
            fog={props.fog}
            stubs={props.stubs}
            focus={{zone, map}}
          />
        </div>
      ) : (
        <div style={styles.empty}>This world has no map yet.</div>
      )}
    </div>
  );
}
