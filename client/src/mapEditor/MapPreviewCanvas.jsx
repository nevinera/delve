import {useEffect, useRef} from "react";
import {MapPreviewScene} from "./MapPreviewScene";

// A map has no dedicated "spawn point" field of its own - where a player
// actually starts is Zone.entryPoints (docs/schema/zone.md), mapping a
// connection on this map to whether it requires a key. This editor has no
// zone context (a Map's connections don't know their own zone), so it can't
// resolve that precisely - the closest reasonable stand-in is the map's own
// first connection (a point's position, or a line's midpoint), falling back
// to the map's center if it has none yet.
export function startPositionFor(mapData) {
  const {width, height} = mapData.feetDimensions;
  const first = mapData.connections?.[0];
  if (first?.type === "point" && first.position) return {x: first.position.x, y: first.position.y};
  if (first?.type === "line" && first.start && first.end) {
    return {x: (first.start.x + first.end.x) / 2, y: (first.start.y + first.end.y) / 2};
  }
  return {x: width / 2, y: height / 2};
}

// Mounts MapPreviewScene onto a canvas - the React side of the "walk it" 3D
// preview (Phase 2 of the map editor plan). Rendered by MapCanvas in place
// of the normal top-down SVG view while `previewing` is active (see
// MapEditor's togglePreview) - a controllable token plus every unit on the
// map, each following its own configured movement, walking around the
// current draft's barriers.
export default function MapPreviewCanvas({mapData, availableUnitTypes, imageUrl, onExit}) {
  const canvasRef = useRef(null);
  const wrapperRef = useRef(null);

  useEffect(() => {
    const scene = new MapPreviewScene(canvasRef.current);
    // "daylight" | "torchlight" - see MapPreviewScene's setLightingMode.
    // The map's own authored `lighting` field (MapFieldsPanel.jsx,
    // docs/schema/map.md) - defaults to daylight when unset, same as
    // everywhere else that field is read. No in-preview toggle any more -
    // it's an authored map setting now, not a session-only choice.
    scene.setLightingMode(mapData.lighting === "torchlight" ? "torchlight" : "daylight");
    const {x, y} = startPositionFor(mapData);
    // isSvg comes from mapData.imageUrl - the repo-relative filename - not
    // the imageUrl prop above (an opaque blob:/data: URL used to actually
    // load the bytes), since that carries no file extension to sniff.
    const isSvg = Boolean(mapData.imageUrl?.toLowerCase().endsWith(".svg"));
    scene.loadMap(
      {feetDimensions: mapData.feetDimensions, barriers: mapData.barriers, connections: mapData.connections, units: mapData.units, imageUrl, isSvg},
      availableUnitTypes, x, y
    );
    scene.handleResize();
    scene.startLoop();

    const resizeObserver = new ResizeObserver(() => scene.handleResize());
    resizeObserver.observe(wrapperRef.current);

    return () => {
      resizeObserver.disconnect();
      scene.dispose();
    };
    // Mounts once per preview session - mapData/availableUnitTypes/imageUrl
    // are read only at mount (editing is locked while previewing, so they
    // can't change underneath it; see MapEditor's togglePreview).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div ref={wrapperRef} className="map-preview-wrapper">
      <canvas ref={canvasRef} className="map-preview-canvas" />
      <p className="map-preview-hint">Drag to look around, scroll to zoom, W/S walk, Q/E strafe, A/D turn, Shift to sprint.</p>
      <button type="button" className="map-preview-exit" onClick={onExit}>Exit Preview</button>
    </div>
  );
}
