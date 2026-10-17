import {useEffect, useRef} from "react";
import {MapPreviewScene} from "./MapPreviewScene";

// Where the walk preview starts: the center of the part of the map the editor
// was showing (`viewCenter`, in feet). A map has no spawn point of its own -
// real play starts at Zone.entryPoints (docs/schema/zone.md), which this
// editor can't resolve without zone context - so with no visible-area center
// to go on, fall back to the connection nearest the map's center (a point's
// position, or a line's midpoint), then to the map's center itself.
export function startPositionFor(mapData, viewCenter = null) {
  const {width, height} = mapData.feetDimensions;
  if (viewCenter) {
    return {x: Math.min(width, Math.max(0, viewCenter.x)), y: Math.min(height, Math.max(0, viewCenter.y))};
  }
  const center = {x: width / 2, y: height / 2};
  let best = null;
  let bestDist = Infinity;
  for (const c of mapData.connections ?? []) {
    let at = null;
    if (c?.type === "point" && c.position) at = {x: c.position.x, y: c.position.y};
    else if (c?.type === "line" && c.start && c.end) at = {x: (c.start.x + c.end.x) / 2, y: (c.start.y + c.end.y) / 2};
    if (!at) continue;
    const dist = Math.hypot(at.x - center.x, at.y - center.y);
    if (dist < bestDist) {
      best = at;
      bestDist = dist;
    }
  }
  return best ?? center;
}

// Mounts MapPreviewScene onto a canvas - the React side of the "walk it" 3D
// preview (Phase 2 of the map editor plan). Rendered by MapCanvas in place
// of the normal top-down SVG view while `previewing` is active (see
// MapEditor's togglePreview) - a controllable token plus every unit on the
// map, each following its own configured movement, walking around the
// current draft's barriers.
// groundImage (a bitmap or canvas) is the ground instead of imageUrl, for a
// map drawn in cells.
// stampLayer ({sets, sheets}) bakes the map's decoration stamps into the
// ground, under groundCanopy (a cell map's tree crowns) when there is one.
export default function MapPreviewCanvas({mapData, availableUnitTypes, imageUrl, groundImage = null, groundCanopy = null, stampLayer = null, viewCenter = null, onExit}) {
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
    const {x, y} = startPositionFor(mapData, viewCenter);
    // isSvg comes from mapData.imageUrl - the repo-relative filename - not
    // the imageUrl prop above (an opaque blob:/data: URL used to actually
    // load the bytes), since that carries no file extension to sniff.
    const isSvg = Boolean(mapData.imageUrl?.toLowerCase().endsWith(".svg"));
    scene.loadMap(
      {feetDimensions: mapData.feetDimensions, barriers: mapData.barriers, connections: mapData.connections, fillPoints: mapData.fillPoints, units: mapData.units, imageUrl, isSvg, groundImage, groundCanopy, pixelDimensions: mapData.pixelDimensions,
        stamps: stampLayer && mapData.stamps?.length ? {placed: mapData.stamps, sets: stampLayer.sets, sheets: stampLayer.sheets} : null},
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
