import {useEffect, useRef, useState} from "react";
import {hitStamp, rotationToward, scaleToward, stampBox, stampCorners, stampHandles} from "./stampGeometry";
import StampsPanel from "./StampsPanel";

// Screen pixels: how big the handles are, and how far the rotate handle
// sits out from the stamp.
const HANDLE_RADIUS = 7;
const HANDLE_REACH = 22;
const ROTATE_STEP = 15;

// The Stamps tab (see plans/decoration-stamps.md): palettes of the zone's
// stamp sets to place from, and on the canvas, picking, moving, rotating
// and scaling the map's stamps. Returns {editing} for MapCanvas's
// overlayEditing (null when the tab isn't active) and {panel} for the
// sidebar.
//
// stamps is the map's placed stamps, stampLayer {sets, sheets} the zone's;
// onMapChange(fn) edits the map (a MapDraft); pixelDimensions and
// feetDimensions convert the canvas's pixels to feet. renderSetAdder({close})
// (optional) renders a way to add a set to the zone.
export function useStampsTab({active, stamps, stampLayer, onMapChange, pixelDimensions, feetDimensions, renderSetAdder = null}) {
  const [armed, setArmed] = useState(null);
  const [selected, setSelected] = useState(null);
  const [hovered, setHovered] = useState(null);
  const [varyRotation, setVaryRotation] = useState(false);
  const dragRef = useRef(null);
  const zoomRef = useRef(1);
  const sets = stampLayer?.sets ?? {};
  const sheets = stampLayer?.sheets ?? {};
  const feetPerPixel = pixelDimensions && feetDimensions ? feetDimensions.width / pixelDimensions.width : 1;
  const selectedStamp = selected !== null ? stamps[selected] : null;

  // A selection past the end (an undo, a removal elsewhere) clears.
  useEffect(() => {
    if (selected !== null && selected >= stamps.length) setSelected(null);
  }, [selected, stamps.length]);

  useEffect(() => {
    if (!active) {
      setArmed(null);
      setHovered(null);
    }
  }, [active]);

  const update = (index, fields) => onMapChange((d) => d.updateStamp(index, fields));
  const remove = (index) => {
    onMapChange((d) => d.removeStamp(index));
    setSelected(null);
  };
  const move = (index, to) => {
    const target = Math.max(0, Math.min(to, stamps.length - 1));
    if (target === index) return;
    onMapChange((d) => d.moveStamp(index, target));
    setSelected(target);
  };
  const rotateBy = (index, degrees) => {
    const rotation = ((((stamps[index].rotation ?? 0) + degrees) % 360) + 360) % 360;
    update(index, {rotation: rotation || undefined});
  };

  // Delete removes the selected stamp, [ and ] turn it, Escape lets go of
  // the armed stamp, then the selection.
  useEffect(() => {
    if (!active) return undefined;
    function onKeyDown(e) {
      if (e.target instanceof HTMLElement && e.target.closest("input, select, textarea, [contenteditable]")) return;
      if (e.key === "Escape") {
        if (armed) setArmed(null);
        else setSelected(null);
      } else if (selected === null) {
        return;
      } else if (e.key === "Delete" || e.key === "Backspace") {
        e.preventDefault();
        remove(selected);
      } else if (e.key === "[" || e.key === "]") {
        rotateBy(selected, e.key === "]" ? ROTATE_STEP : -ROTATE_STEP);
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  });

  const toFeet = (pixel) => ({x: pixel.x * feetPerPixel, y: pixel.y * feetPerPixel});
  const handleFeet = () => (HANDLE_RADIUS * 1.5 * feetPerPixel) / zoomRef.current;
  const reachFeet = () => (HANDLE_REACH * feetPerPixel) / zoomRef.current;
  const round = (n) => Math.round(n * 10) / 10;

  function onPointer(phase, pixel, event) {
    const point = pixel && toFeet(pixel);
    if (phase === "down") {
      const box = selectedStamp && stampBox(sets, sheets, selectedStamp);
      if (box) {
        const {rotate, scale} = stampHandles(selectedStamp, box, reachFeet());
        const near = (p) => Math.hypot(p.x - point.x, p.y - point.y) <= handleFeet();
        if (near(rotate)) {
          dragRef.current = {kind: "rotate", index: selected};
          return true;
        }
        if (near(scale)) {
          dragRef.current = {kind: "scale", index: selected, box};
          return true;
        }
      }
      if (armed) {
        const rotation = varyRotation ? Math.floor(Math.random() * 360) : 0;
        onMapChange((d) => d.addStamp({stamp: armed, x: round(point.x), y: round(point.y), ...(rotation ? {rotation} : {})}));
        setSelected(stamps.length);
        return true;
      }
      const hit = hitStamp(stamps, sets, sheets, point);
      if (hit < 0) {
        setSelected(null);
        return false;
      }
      setSelected(hit);
      dragRef.current = {kind: "move", index: hit, dx: stamps[hit].x - point.x, dy: stamps[hit].y - point.y};
      return true;
    }
    if (phase === "drag" && dragRef.current) {
      const drag = dragRef.current;
      const stamp = stamps[drag.index];
      if (!stamp) return true;
      if (drag.kind === "move") update(drag.index, {x: round(point.x + drag.dx), y: round(point.y + drag.dy)});
      if (drag.kind === "rotate") update(drag.index, {rotation: rotationToward(stamp, point, event?.shiftKey) || undefined});
      if (drag.kind === "scale") {
        const scale = scaleToward(stamp, stampBox(sets, sheets, stamp) ?? drag.box, point);
        update(drag.index, {scale: scale === 1 ? undefined : scale});
      }
      return true;
    }
    if (phase === "hover") {
      const hit = point ? hitStamp(stamps, sets, sheets, point) : -1;
      setHovered(hit < 0 ? null : hit);
      return false;
    }
    dragRef.current = null;
    return false;
  }

  function overlay({zoom}) {
    zoomRef.current = zoom;
    if (!pixelDimensions) return null;
    const px = (p) => `${p.x / feetPerPixel},${p.y / feetPerPixel}`;
    const outline = (index, className) => {
      const box = stampBox(sets, sheets, stamps[index]);
      return box && <polygon className={className} points={stampCorners(stamps[index], box).map(px).join(" ")} />;
    };
    const box = selectedStamp && stampBox(sets, sheets, selectedStamp);
    const handles = box && stampHandles(selectedStamp, box, reachFeet());
    const r = HANDLE_RADIUS / zoom;
    const top = box && stampHandles(selectedStamp, box, 0).rotate;
    return (
      <svg className="map-canvas-stamp-overlay" width={pixelDimensions.width} height={pixelDimensions.height} style={{"--stroke": `${1.5 / zoom}px`}}>
        {hovered !== null && hovered !== selected && outline(hovered, "stamp-hover")}
        {selected !== null && outline(selected, "stamp-selected")}
        {handles && (
          <>
            <line className="stamp-handle-arm" x1={top.x / feetPerPixel} y1={top.y / feetPerPixel} x2={handles.rotate.x / feetPerPixel} y2={handles.rotate.y / feetPerPixel} />
            <circle className="stamp-handle" aria-label="Rotate stamp" cx={handles.rotate.x / feetPerPixel} cy={handles.rotate.y / feetPerPixel} r={r} />
            <rect className="stamp-handle" aria-label="Scale stamp" x={handles.scale.x / feetPerPixel - r} y={handles.scale.y / feetPerPixel - r} width={r * 2} height={r * 2} />
          </>
        )}
      </svg>
    );
  }

  const editing = active ? {overlay, onPointer, cursor: armed ? "crosshair" : hovered !== null ? "move" : undefined} : null;
  const panel = (
    <StampsPanel
      sets={sets} sheets={sheets} stamps={stamps}
      armed={armed} onArm={(key) => setArmed(armed === key ? null : key)}
      varyRotation={varyRotation} onVaryRotation={setVaryRotation}
      selected={selected} onUpdate={update} onRemove={remove} onMove={move}
      renderSetAdder={renderSetAdder}
    />
  );
  return {editing, panel};
}
