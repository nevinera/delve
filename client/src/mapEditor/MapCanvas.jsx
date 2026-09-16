import {useEffect, useRef, useState} from "react";
import {pixelToFeet, feetToPixel, feetSpacingToPixelsX, feetSpacingToPixelsY} from "./mapCoords";
import {collectSnapPoints, nearestSnapPoint} from "./mapSnap";
import BarrierShapes from "./BarrierShapes";
import ConnectionShapes from "./ConnectionShapes";
import UnitShapes from "./UnitShapes";
import GroupShapes from "./GroupShapes";
import MovementShapes from "./MovementShapes";
import MapPreviewCanvas from "./MapPreviewCanvas";

// Connections need a required, zone-unique `identifier` the moment they're
// created (unlike barriers, which have none) - this picks the first unused
// "connection-N" rather than leaving it blank, so a freshly placed
// connection is already valid; the author can rename it in the sidebar.
function nextConnectionIdentifier(connections) {
  const existing = new Set(connections.map((c) => c.identifier));
  let n = connections.length + 1;
  while (existing.has(`connection-${n}`)) n++;
  return `connection-${n}`;
}

const MIN_ZOOM = 0.05;
// Used before an image/wrapper size is available to compute the real cap
// (see maxZoom below), and as a floor under it for a tiny map.
const FALLBACK_MAX_ZOOM = 4;
// The real max zoom cap: however far in you can go, the canvas's shorter
// screen dimension should still show at least this many feet of the map -
// see maxZoom, which is why MAX_ZOOM isn't a fixed constant any more.
const MIN_VISIBLE_FEET_AT_MAX_ZOOM = 40;
const ZOOM_STEP = 1.25; // per click of the +/- buttons
const GRID_SPACING_FEET = 5;
const DEFAULT_UNIT_RADIUS_FEET = 2; // matches UnitShapes' own fallback, for the drag-to-face preview's arrow cap
const MIN_FACING_DRAG_FEET = 3; // below this, a placement drag is treated as a plain click - facing defaults to 0

function hasBothAxes(dimensions) {
  return dimensions?.width && dimensions?.height;
}

// (dx, dy) feet -> degrees, 0 = north (+y), clockwise positive - matches
// docs/schema/common.md's Position.angle convention exactly, same formula
// as simulateMovement.js's facingTowardDeg.
function facingDegrees(dx, dy) {
  const deg = (Math.atan2(dx, dy) * 180) / Math.PI;
  return ((deg % 360) + 360) % 360;
}
// Wheel zoom is proportional to deltaY rather than one full ZOOM_STEP per
// event - a single mouse-wheel notch (deltaY ~100) lands around a gentle
// ~8% zoom instead of the buttons' 25%; a trackpad's much smaller
// per-event deltas scale down accordingly. Clamped per event so one large
// delta spike (some mice report much bigger notches) can't jump too far.
const WHEEL_ZOOM_SENSITIVITY = 0.0008;
const MAX_WHEEL_FACTOR_PER_EVENT = 1.25;
const KEYBOARD_PAN_SPEED = 500; // screen px/sec, independent of zoom - see the WASD panning effect
// W/A/S/D -> [dx, dy] the *content* shifts by (offset.x/y) while that key
// is held - W is "the camera moves up/north," which reads on screen as the
// content sliding down, same convention a top-down game camera would use.
const PAN_KEY_DIRECTIONS = {
  KeyW: [0, 1], KeyS: [0, -1],
  KeyA: [1, 0], KeyD: [-1, 0],
};

// Top-down pan/zoom viewport for the map background image, plus barrier
// placement/editing (slice 3). Panning is a plain CSS transform on a
// content div holding the image at native pixel size (not native scroll,
// not an SVG viewBox); barriers/connections/units draw into the same
// untransformed pixel-space content div, so their own coordinates are
// always just raw image pixels (converted from the feet-space values the
// schema actually stores, via mapCoords.js).
//
// The toolbar is two rows - row 1 (navigation/view: back, zoom) is always
// present; row 2 (replace image) once there's an image loaded. Barrier
// creation (Add Wall/Add Circle) lives in BarriersPanel's sidebar instead
// of a canvas tool-mode row - "add-circle" is still a tool this component
// tracks (a drag on the map sets a circle's center/radius), but it's
// entered externally via the `tool`/`onToolChange` props, not a button here.
export default function MapCanvas({
  image, displayImageUrl, imageError, onImageFile, backUrl, mapData, dispatch,
  selectedBarrierIndex, onSelectBarrier, hoveredBarrierIndex, hoveredPoint, placement, onPlacePoint, onCancelPlacement,
  selectedConnectionIndex, onSelectConnection, hoveredConnectionIndex,
  connectionPlacement, onPlaceConnectionField, onCancelConnectionPlacement,
  selectedUnitIndex, onSelectUnit, hoveredUnitIndex, onHoverUnit, pendingUnitType, availableUnitTypes = {},
  unitPlacement, onPlaceUnitPosition, onCancelUnitPlacement,
  patrolStepPlacement, onPlacePatrolStep, onCancelPatrolStepPlacement,
  wanderLocationPlacement, onPlaceWanderLocation, onCancelWanderLocationPlacement,
  hoveredPatrolStep, expandedUnitIndices,
  groupingMode, onToggleGroupMember, hoveredGroupIdentifier,
  simulating = false, onToggleSimulate, simSpeed = 1, onSimSpeedChange,
  previewing = false, onTogglePreview,
  tool = "select", onToolChange,
}) {
  const wrapperRef = useRef(null);
  const replaceInputRef = useRef(null);
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState({x: 0, y: 0});
  const [cursorPixel, setCursorPixel] = useState(null); // {x, y} in content (image) pixel space, or null off-canvas
  // "select" (the default - drag/select existing shapes) or a single-shot
  // add-tool entered externally via the `tool`/`onToolChange` props (see
  // BarriersPanel/ConnectionsPanel's "+" buttons): "add-circle",
  // "add-point-connection", "add-line-connection". Each reverts back to
  // "select" on its own once it's placed one thing (or been cancelled).
  // Walls don't have a canvas draw-tool - see BarriersPanel's pill-based
  // placement instead.
  const [drawingCircle, setDrawingCircle] = useState(null); // {location: {x, y}, radius} while add-circle is in progress
  const [drawingLine, setDrawingLine] = useState(null); // {start: {x, y}, end: {x, y}} while add-line-connection is in progress
  // {position: {x, y}, current: {x, y}} while add-unit's placement drag is
  // in progress - `position` (set on pointerdown) is where the unit lands;
  // `current` tracks the live pointer, used both for the facing preview
  // arrow and, on release, to compute the unit's own facing angle.
  const [drawingUnit, setDrawingUnit] = useState(null);
  const dragRef = useRef(null); // {startX, startY, startOffset} while a pan drag is in progress
  const panRafRef = useRef(null); // pending requestAnimationFrame id, or null
  const pendingOffsetRef = useRef(null); // latest not-yet-applied offset from pointermove
  const zoomRafRef = useRef(null); // pending requestAnimationFrame id, or null
  const pendingZoomRef = useRef(null); // {factor, cursorX, cursorY} accumulated since the last flush
  // {type: "wall-point", barrierIndex, pointIndex} | {type: "circle-move" | "circle-resize", barrierIndex} | null
  const barrierDragRef = useRef(null);
  // {type: "point-move", connectionIndex} | {type: "line-endpoint", connectionIndex, endpoint: "start" | "end"} | null
  const connectionDragRef = useRef(null);
  // {unitIndex} | null - a unit only ever moves as a whole (no sub-handles).
  const unitDragRef = useRef(null);
  const panKeysRef = useRef(new Set()); // currently-held WASD KeyboardEvent.code values
  const panKeysLoopRef = useRef(null); // pending requestAnimationFrame id while any pan key is held, or null
  const panKeysLastTimeRef = useRef(null);

  const feetDimensions = mapData.feetDimensions;
  const canDrawBarriers = hasBothAxes(feetDimensions);

  // How far zoom can go: whichever of the wrapper's screen dimensions is
  // shorter should still show at least MIN_VISIBLE_FEET_AT_MAX_ZOOM feet of
  // the map at max zoom - computed fresh (not a fixed constant) since it
  // depends on the wrapper's current on-screen size and the image's own
  // px/ft ratio, which can differ per axis (see feetSpacingToPixelsX/Y) -
  // uses whichever axis the shorter screen dimension corresponds to.
  function maxZoom() {
    if (!image || !wrapperRef.current || !canDrawBarriers) return FALLBACK_MAX_ZOOM;
    const wrapper = wrapperRef.current;
    const shorterIsWidth = wrapper.clientWidth <= wrapper.clientHeight;
    const shorterPx = shorterIsWidth ? wrapper.clientWidth : wrapper.clientHeight;
    const pxPerFoot = shorterIsWidth
      ? image.pixelDimensions.width / feetDimensions.width
      : image.pixelDimensions.height / feetDimensions.height;
    const zoomFor40Feet = shorterPx / (MIN_VISIBLE_FEET_AT_MAX_ZOOM * pxPerFoot);
    return Math.max(FALLBACK_MAX_ZOOM, zoomFor40Feet);
  }

  function clampZoom(zoom) {
    return Math.min(maxZoom(), Math.max(MIN_ZOOM, zoom));
  }

  // Native pointermove/wheel both fire far more often than the screen
  // repaints - coalesce each to one state update per frame instead of one
  // per event, so a fast drag/scroll doesn't queue up more re-renders than
  // there are frames to show them in (most visible on a large map image,
  // where each render has real paint cost - see .map-canvas-content's
  // will-change too).
  useEffect(() => {
    return () => {
      if (panRafRef.current != null) cancelAnimationFrame(panRafRef.current);
      if (zoomRafRef.current != null) cancelAnimationFrame(zoomRafRef.current);
    };
  }, []);

  // Zooms by `factor` (> 1 in, < 1 out) around the wrapper's own center -
  // used by the +/- buttons and their keyboard equivalents (unlike wheel
  // zoom, which anchors on the cursor - there's no cursor position for
  // either of these, so the center is the sensible fixed point). Same
  // offset-compensation math as the wheel handler's own zoom, just a fixed
  // anchor instead of the cursor's.
  function zoomAroundCenter(factor) {
    const wrapper = wrapperRef.current;
    if (!wrapper) return;
    const anchorX = wrapper.clientWidth / 2;
    const anchorY = wrapper.clientHeight / 2;
    setZoom((prevZoom) => {
      const nextZoom = clampZoom(prevZoom * factor);
      setOffset((prevOffset) => ({
        x: anchorX - ((anchorX - prevOffset.x) / prevZoom) * nextZoom,
        y: anchorY - ((anchorY - prevOffset.y) / prevZoom) * nextZoom,
      }));
      return nextZoom;
    });
  }

  // "Contain" fit: the smaller of the two axis scales, so the whole image
  // is visible regardless of its aspect ratio versus the wrapper's - fitting
  // to width alone (as this once did) overflows the wrapper's height for
  // any image relatively taller than the wrapper. Whichever axis has
  // leftover space (the one that *didn't* determine the scale) gets
  // centered rather than left flush at the top-left corner.
  function computeFit() {
    if (!image || !wrapperRef.current) return {zoom: 1, offset: {x: 0, y: 0}};
    const wrapper = wrapperRef.current;
    const scaleX = wrapper.clientWidth / image.pixelDimensions.width;
    const scaleY = wrapper.clientHeight / image.pixelDimensions.height;
    const zoom = clampZoom(Math.min(scaleX, scaleY));
    const offset = {
      x: (wrapper.clientWidth - image.pixelDimensions.width * zoom) / 2,
      y: (wrapper.clientHeight - image.pixelDimensions.height * zoom) / 2,
    };
    return {zoom, offset};
  }

  function applyFit() {
    const {zoom: nextZoom, offset: nextOffset} = computeFit();
    setZoom(nextZoom);
    setOffset(nextOffset);
  }

  // Re-fit whenever a new image loads (including the first one) - a
  // previous image's pan/zoom has no bearing on a differently-sized image.
  useEffect(() => {
    if (!image) return;
    applyFit();
    // computeFit reads wrapperRef/image fresh each call; only the image identity should re-trigger this.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [image]);

  // Native (not React's onWheel) so preventDefault reliably stops page
  // scroll/browser zoom - React may attach wheel listeners passively.
  // Both setters use the functional-update form so this closure (only
  // re-created when the wrapper element itself changes, i.e. on image
  // load/replace) never reads stale zoom/offset from an earlier render.
  useEffect(() => {
    const wrapper = wrapperRef.current;
    if (!wrapper) return;

    function onWheel(e) {
      e.preventDefault();
      const rect = wrapper.getBoundingClientRect();
      const cursorX = e.clientX - rect.left;
      const cursorY = e.clientY - rect.top;
      const rawFactor = Math.exp(-e.deltaY * WHEEL_ZOOM_SENSITIVITY);
      const factor = Math.min(MAX_WHEEL_FACTOR_PER_EVENT, Math.max(1 / MAX_WHEEL_FACTOR_PER_EVENT, rawFactor));

      // Several wheel events (a trackpad especially) can arrive before the
      // next frame - accumulate their factors (multiplicatively - each is
      // its own scale multiplier) and keep the latest cursor position,
      // rather than doing a full setZoom+setOffset render per event.
      pendingZoomRef.current = {
        factor: (pendingZoomRef.current?.factor ?? 1) * factor,
        cursorX,
        cursorY,
      };

      if (zoomRafRef.current == null) {
        zoomRafRef.current = requestAnimationFrame(() => {
          zoomRafRef.current = null;
          const pending = pendingZoomRef.current;
          pendingZoomRef.current = null;

          setZoom((prevZoom) => {
            const nextZoom = clampZoom(prevZoom * pending.factor);
            setOffset((prevOffset) => ({
              x: pending.cursorX - ((pending.cursorX - prevOffset.x) / prevZoom) * nextZoom,
              y: pending.cursorY - ((pending.cursorY - prevOffset.y) / prevZoom) * nextZoom,
            }));
            return nextZoom;
          });
        });
      }
    }

    wrapper.addEventListener("wheel", onWheel, {passive: false});
    return () => wrapper.removeEventListener("wheel", onWheel);
  }, [image]);

  // WASD pans the map, +/- zoom it - deliberately *not* gated behind
  // "nothing else armed" the way MapEditor's B/C/L/P hotkeys are, since the
  // whole point is panning/zooming while a boundary/connection placement is
  // already in progress (mouse busy placing points, keyboard free to
  // reposition the view). Held WASD keys drive a requestAnimationFrame loop
  // (same shape as MapPreviewScene's own movement key handling) for smooth
  // continuous panning; +/- just do one ZOOM_STEP per keydown, same as
  // their buttons - the browser's own key-repeat gives a "held" feel for
  // free, no separate loop needed. Disabled during Walk Preview - WASD
  // means something else entirely there (MapPreviewScene's own listeners),
  // and this component doesn't unmount while previewing, just swaps in
  // MapPreviewCanvas as a sibling.
  useEffect(() => {
    function isEditableTarget(t) {
      return t instanceof HTMLElement && (
        t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT" || t.isContentEditable
      );
    }

    function stepPan(now) {
      const dt = panKeysLastTimeRef.current == null ? 0 : (now - panKeysLastTimeRef.current) / 1000;
      panKeysLastTimeRef.current = now;
      let dx = 0, dy = 0;
      for (const code of panKeysRef.current) {
        const [kx, ky] = PAN_KEY_DIRECTIONS[code];
        dx += kx;
        dy += ky;
      }
      if (dx !== 0 || dy !== 0) {
        const mag = Math.hypot(dx, dy); // normalize diagonals (e.g. W+D) to the same speed as a single key
        const dist = KEYBOARD_PAN_SPEED * dt;
        setOffset((o) => ({x: o.x + (dx / mag) * dist, y: o.y + (dy / mag) * dist}));
      }
      panKeysLoopRef.current = panKeysRef.current.size > 0 ? requestAnimationFrame(stepPan) : null;
      if (panKeysLoopRef.current == null) panKeysLastTimeRef.current = null;
    }

    function onKeyDown(e) {
      if (previewing || !image || isEditableTarget(e.target)) return;

      if (PAN_KEY_DIRECTIONS[e.code]) {
        panKeysRef.current.add(e.code);
        if (panKeysLoopRef.current == null) {
          panKeysLastTimeRef.current = null;
          panKeysLoopRef.current = requestAnimationFrame(stepPan);
        }
        return;
      }

      // "=" alongside "+" - zooming in shouldn't require holding Shift.
      if (e.key === "+" || e.key === "=") zoomAroundCenter(ZOOM_STEP);
      else if (e.key === "-" || e.key === "_") zoomAroundCenter(1 / ZOOM_STEP);
    }
    function onKeyUp(e) {
      panKeysRef.current.delete(e.code);
    }

    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("keyup", onKeyUp);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("keyup", onKeyUp);
      if (panKeysLoopRef.current != null) cancelAnimationFrame(panKeysLoopRef.current);
      panKeysRef.current.clear();
      panKeysLoopRef.current = null;
      panKeysLastTimeRef.current = null;
    };
  }, [image, previewing]);

  // Screen (client) coordinates -> image-pixel coordinates, inverting the
  // current pan/zoom transform.
  function contentPixelFromClient(clientX, clientY) {
    const rect = wrapperRef.current.getBoundingClientRect();
    return {x: (clientX - rect.left - offset.x) / zoom, y: (clientY - rect.top - offset.y) / zoom};
  }

  // Screen coordinates -> feet coordinates (what the schema actually
  // stores for barrier/connection/unit positions) - null when there's no
  // feetDimensions to convert against yet.
  function feetFromClient(clientX, clientY) {
    if (!canDrawBarriers) return null;
    const px = contentPixelFromClient(clientX, clientY);
    return pixelToFeet(px.x, px.y, image.pixelDimensions, feetDimensions);
  }

  // Pulls `feet` onto an existing barrier/connection point within
  // SNAP_RADIUS_FEET, so two things meant to share a corner actually do -
  // `exclude` (see mapSnap.js) keeps the point currently being
  // placed/dragged from snapping to itself. Shift disables this per-gesture.
  function snapFeet(feet, exclude, shiftKey) {
    if (!feet || shiftKey) return feet;
    const match = nearestSnapPoint(collectSnapPoints(mapData, exclude), feet);
    return match ? {x: match.x, y: match.y} : feet;
  }

  // A circle is single-shot - whether or not the drag actually produced one
  // (a plain click with no drag leaves radius 0 and commits nothing), the
  // tool always reverts to "select" afterward, same as BarriersPanel's
  // "+ Add Wall"/"+ Add Circle" only ever adding one thing per click.
  function commitCircle() {
    if (drawingCircle && drawingCircle.radius > 0) {
      dispatch({type: "ADD_ENTRY", section: "barriers", entry: {type: "circle", location: drawingCircle.location, radius: drawingCircle.radius}});
    }
    setDrawingCircle(null);
    onToolChange?.("select");
  }

  // A line connection is single-shot too - a plain click (start === end)
  // commits nothing, same as circle's zero-radius guard.
  function commitLineConnection() {
    if (drawingLine && (drawingLine.start.x !== drawingLine.end.x || drawingLine.start.y !== drawingLine.end.y)) {
      dispatch({
        type: "ADD_ENTRY", section: "connections",
        entry: {identifier: nextConnectionIdentifier(mapData.connections), type: "line", start: drawingLine.start, end: drawingLine.end},
      });
    }
    setDrawingLine(null);
    onToolChange?.("select");
  }

  // A drag of at least MIN_FACING_DRAG_FEET sets the unit's facing toward
  // where the pointer was released; anything shorter (including a plain
  // click, position === current) is treated as "didn't mean to set a
  // facing" and defaults to 0, same as before this drag gesture existed.
  function commitUnit() {
    if (drawingUnit) {
      const {position, current} = drawingUnit;
      const dx = current.x - position.x, dy = current.y - position.y;
      const angle = Math.hypot(dx, dy) >= MIN_FACING_DRAG_FEET ? facingDegrees(dx, dy) : 0;
      dispatch({
        type: "ADD_ENTRY", section: "units",
        entry: {unitType: pendingUnitType, position: {x: position.x, y: position.y, angle}, hostility: "hostile", currentHpFraction: 1.0, movement: {type: "still"}},
      });
    }
    setDrawingUnit(null);
    onToolChange?.("select");
  }

  // Esc backs out of an armed-but-not-yet-used add-tool (e.g. a sidebar
  // button was clicked by mistake) - there's no "Select" button to fall
  // back on otherwise. Only while nothing's actually being dragged yet;
  // once a drag has started, releasing the pointer is what commits/cancels
  // it (see commitCircle/commitLineConnection/commitUnit).
  useEffect(() => {
    const armed = (tool === "add-circle" && !drawingCircle) || tool === "add-point-connection"
      || (tool === "add-line-connection" && !drawingLine) || (tool === "add-unit" && !drawingUnit);
    if (!armed) return;

    function onKeyDown(e) {
      if (e.key === "Escape") onToolChange?.("select");
    }

    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [tool, drawingCircle, drawingLine, drawingUnit, onToolChange]);

  // Point placement (from BarriersPanel's "+" buttons) cancels the same
  // way: Escape, or a click anywhere outside the map - except a click on
  // another "+" button, which is itself a request to start placing
  // somewhere else and should win, not get raced by this canceling back to
  // null on the very same click (see BarriersPanel.jsx).
  useEffect(() => {
    if (!placement) return;

    function onKeyDown(e) {
      if (e.key === "Escape") onCancelPlacement();
    }

    function onDocPointerDown(e) {
      if (wrapperRef.current?.contains(e.target)) return;
      if (e.target.closest?.(".map-point-plus")) return;
      onCancelPlacement();
    }

    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("pointerdown", onDocPointerDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("pointerdown", onDocPointerDown);
    };
  }, [placement, onCancelPlacement]);

  // Same cancellation pattern as wall-point placement above, but for
  // re-placing a single already-existing connection field (see
  // ConnectionsPanel's CoordinateButton) - a click on another coordinate
  // pill should win over this one canceling itself, not race it.
  useEffect(() => {
    if (!connectionPlacement) return;

    function onKeyDown(e) {
      if (e.key === "Escape") onCancelConnectionPlacement();
    }

    function onDocPointerDown(e) {
      if (wrapperRef.current?.contains(e.target)) return;
      if (e.target.closest?.(".map-connection-field-btn")) return;
      onCancelConnectionPlacement();
    }

    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("pointerdown", onDocPointerDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("pointerdown", onDocPointerDown);
    };
  }, [connectionPlacement, onCancelConnectionPlacement]);

  // Same cancellation pattern again, for re-placing a unit's position (see
  // UnitsPanel's PositionButton).
  useEffect(() => {
    if (!unitPlacement) return;

    function onKeyDown(e) {
      if (e.key === "Escape") onCancelUnitPlacement();
    }

    function onDocPointerDown(e) {
      if (wrapperRef.current?.contains(e.target)) return;
      if (e.target.closest?.(".map-unit-position-btn")) return;
      onCancelUnitPlacement();
    }

    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("pointerdown", onDocPointerDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("pointerdown", onDocPointerDown);
    };
  }, [unitPlacement, onCancelUnitPlacement]);

  // Same cancellation pattern again, for a patrol step's position - "insert"
  // (from a "+" pill, same class/convention as WallPoints') auto-advances to
  // the gap right after it on each click, so a run of clicks lays down
  // consecutive waypoints; "edit" (from clicking an existing step's pill)
  // replaces just that one and exits.
  useEffect(() => {
    if (!patrolStepPlacement) return;

    function onKeyDown(e) {
      if (e.key === "Escape") onCancelPatrolStepPlacement();
    }

    function onDocPointerDown(e) {
      if (wrapperRef.current?.contains(e.target)) return;
      if (e.target.closest?.(".map-point-plus, .map-patrol-step-pill")) return;
      onCancelPatrolStepPlacement();
    }

    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("pointerdown", onDocPointerDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("pointerdown", onDocPointerDown);
    };
  }, [patrolStepPlacement, onCancelPatrolStepPlacement]);

  // Same cancellation pattern again, for re-placing a wander zone's location
  // (see UnitsPanel's WanderLocationButton) - single-shot, like a unit's own
  // position pill.
  useEffect(() => {
    if (!wanderLocationPlacement) return;

    function onKeyDown(e) {
      if (e.key === "Escape") onCancelWanderLocationPlacement();
    }

    function onDocPointerDown(e) {
      if (wrapperRef.current?.contains(e.target)) return;
      if (e.target.closest?.(".map-wander-location-btn")) return;
      onCancelWanderLocationPlacement();
    }

    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("pointerdown", onDocPointerDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("pointerdown", onDocPointerDown);
    };
  }, [wanderLocationPlacement, onCancelWanderLocationPlacement]);

  function startDragWallPoint(barrierIndex, pointIndex, e) {
    // stopPropagation first, always - even while simulating (read-only)
    // blocks the actual selection/drag, the click on this shape still
    // shouldn't fall through and bubble to the wrapper's own pointerdown
    // handler, which would otherwise arm a pan from here instead.
    e.stopPropagation();
    if (simulating) return;
    onSelectBarrier(barrierIndex);
    barrierDragRef.current = {type: "wall-point", barrierIndex, pointIndex};
    e.currentTarget.setPointerCapture?.(e.pointerId);
  }

  function startDragCircleMove(barrierIndex, e) {
    e.stopPropagation();
    if (simulating) return;
    onSelectBarrier(barrierIndex);
    barrierDragRef.current = {type: "circle-move", barrierIndex};
    e.currentTarget.setPointerCapture?.(e.pointerId);
  }

  function startDragCircleResize(barrierIndex, e) {
    e.stopPropagation();
    if (simulating) return;
    barrierDragRef.current = {type: "circle-resize", barrierIndex};
    e.currentTarget.setPointerCapture?.(e.pointerId);
  }

  function startDragConnectionPoint(connectionIndex, e) {
    e.stopPropagation();
    if (simulating) return;
    onSelectConnection(connectionIndex);
    connectionDragRef.current = {type: "point-move", connectionIndex};
    e.currentTarget.setPointerCapture?.(e.pointerId);
  }

  function startDragConnectionEndpoint(connectionIndex, endpoint, e) {
    e.stopPropagation();
    if (simulating) return;
    connectionDragRef.current = {type: "line-endpoint", connectionIndex, endpoint};
    e.currentTarget.setPointerCapture?.(e.pointerId);
  }

  function startDragUnit(unitIndex, e) {
    e.stopPropagation();
    if (simulating) return;
    // Grouping mode hijacks every unit click into a membership toggle -
    // no select/drag while it's active (see MapEditor's toggleGroupMember).
    if (groupingMode) {
      onToggleGroupMember(unitIndex);
      return;
    }
    onSelectUnit(unitIndex);
    unitDragRef.current = {unitIndex};
    e.currentTarget.setPointerCapture?.(e.pointerId);
  }

  function handlePointerDown(e) {
    if (!image) return;
    // No separate `simulating` guard needed here - MapEditor's
    // startSimulation already clears every placement state and forces
    // `tool` back to "select" before simulating starts (and the sidebar
    // that could re-arm one of them is hidden while it's active), so every
    // branch below is already unreachable; this always falls through to
    // ordinary panning, which stays available during simulation. The six
    // startDrag* handlers below (reachable by clicking an existing shape
    // regardless of the sidebar) are what actually need their own guards.

    if (placement) {
      const exclude = placement.mode === "edit"
        ? {kind: "wall-point", barrierIndex: placement.barrierIndex, pointIndex: placement.pointIndex}
        : null;
      const feet = snapFeet(feetFromClient(e.clientX, e.clientY), exclude, e.shiftKey);
      if (feet) onPlacePoint(feet);
      return;
    }

    if (connectionPlacement) {
      const {connectionIndex, field} = connectionPlacement;
      const exclude = field === "position"
        ? {kind: "connection-point", connectionIndex}
        : {kind: "connection-endpoint", connectionIndex, endpoint: field};
      const feet = snapFeet(feetFromClient(e.clientX, e.clientY), exclude, e.shiftKey);
      if (feet) onPlaceConnectionField(feet);
      return;
    }

    if (unitPlacement) {
      // Not snapped - see the "add-unit" tool below for why.
      const feet = feetFromClient(e.clientX, e.clientY);
      if (feet) onPlaceUnitPosition(feet);
      return;
    }

    if (patrolStepPlacement) {
      // Not snapped, same reasoning as unit placement above.
      const feet = feetFromClient(e.clientX, e.clientY);
      if (feet) onPlacePatrolStep(feet);
      return;
    }

    if (wanderLocationPlacement) {
      const feet = feetFromClient(e.clientX, e.clientY);
      if (feet) onPlaceWanderLocation(feet);
      return;
    }

    if (tool === "add-circle") {
      const feet = snapFeet(feetFromClient(e.clientX, e.clientY), null, e.shiftKey);
      if (!feet) return;
      setDrawingCircle({location: feet, radius: 0});
      e.currentTarget.setPointerCapture(e.pointerId);
      return;
    }

    if (tool === "add-point-connection") {
      const feet = snapFeet(feetFromClient(e.clientX, e.clientY), null, e.shiftKey);
      if (feet) {
        dispatch({
          type: "ADD_ENTRY", section: "connections",
          entry: {identifier: nextConnectionIdentifier(mapData.connections), type: "point", position: {x: feet.x, y: feet.y, angle: 0}, fuzzRadius: 2, fuzzAngle: 90},
        });
      }
      onToolChange?.("select");
      return;
    }

    if (tool === "add-line-connection") {
      const feet = snapFeet(feetFromClient(e.clientX, e.clientY), null, e.shiftKey);
      if (!feet) return;
      setDrawingLine({start: feet, end: feet});
      e.currentTarget.setPointerCapture(e.pointerId);
      return;
    }

    if (tool === "add-unit") {
      // Not snapped - a unit's position isn't meant to coincide with a
      // barrier corner or connection point the way those snap to each other.
      // A plain click (no further drag) commits immediately with facing 0,
      // same as before - the drag is only for the (optional) facing
      // gesture, see commitUnit.
      const feet = feetFromClient(e.clientX, e.clientY);
      if (!feet) return;
      setDrawingUnit({position: feet, current: feet});
      e.currentTarget.setPointerCapture(e.pointerId);
      return;
    }

    dragRef.current = {startX: e.clientX, startY: e.clientY, startOffset: offset};
    e.currentTarget.setPointerCapture(e.pointerId);
  }

  // Cursor readout: independent of whether a pan drag is in progress, so it
  // tracks the mouse on plain hover too. Inverts the current offset/zoom to
  // recover the image-pixel coordinate under the cursor - a plain state
  // update (not rAF-throttled like pan/zoom) since updating a short text
  // readout has no meaningful paint cost.
  function updateCursorPixel(e) {
    if (!image || !wrapperRef.current) return;
    setCursorPixel(contentPixelFromClient(e.clientX, e.clientY));
  }

  function handlePointerMove(e) {
    updateCursorPixel(e);

    if (barrierDragRef.current) {
      const feet = feetFromClient(e.clientX, e.clientY);
      if (!feet) return;
      const {type, barrierIndex} = barrierDragRef.current;
      const barrier = mapData.barriers[barrierIndex];
      if (type === "wall-point") {
        const {pointIndex} = barrierDragRef.current;
        const snapped = snapFeet(feet, {kind: "wall-point", barrierIndex, pointIndex}, e.shiftKey);
        const nextLocations = barrier.locations.map((loc, i) => (i === pointIndex ? snapped : loc));
        dispatch({type: "UPDATE_ENTRY_FIELD", section: "barriers", index: barrierIndex, field: "locations", value: nextLocations});
      } else if (type === "circle-move") {
        const snapped = snapFeet(feet, {kind: "circle", barrierIndex}, e.shiftKey);
        dispatch({type: "UPDATE_ENTRY_FIELD", section: "barriers", index: barrierIndex, field: "location", value: snapped});
      } else if (type === "circle-resize") {
        // Not snapped - a resize handle traces the circle's edge, not a
        // discrete point meant to coincide with anything else.
        const dx = feet.x - barrier.location.x;
        const dy = feet.y - barrier.location.y;
        dispatch({type: "UPDATE_ENTRY_FIELD", section: "barriers", index: barrierIndex, field: "radius", value: Math.sqrt(dx * dx + dy * dy)});
      }
      return;
    }

    if (connectionDragRef.current) {
      const feet = feetFromClient(e.clientX, e.clientY);
      if (!feet) return;
      const {type, connectionIndex} = connectionDragRef.current;
      const connection = mapData.connections[connectionIndex];
      if (type === "point-move") {
        const snapped = snapFeet(feet, {kind: "connection-point", connectionIndex}, e.shiftKey);
        dispatch({type: "UPDATE_ENTRY_FIELD", section: "connections", index: connectionIndex, field: "position", value: {...connection.position, x: snapped.x, y: snapped.y}});
      } else if (type === "line-endpoint") {
        const {endpoint} = connectionDragRef.current;
        const snapped = snapFeet(feet, {kind: "connection-endpoint", connectionIndex, endpoint}, e.shiftKey);
        dispatch({type: "UPDATE_ENTRY_FIELD", section: "connections", index: connectionIndex, field: endpoint, value: snapped});
      }
      return;
    }

    if (unitDragRef.current) {
      const feet = feetFromClient(e.clientX, e.clientY);
      if (!feet) return;
      const {unitIndex} = unitDragRef.current;
      const unit = mapData.units[unitIndex];
      dispatch({type: "UPDATE_ENTRY_FIELD", section: "units", index: unitIndex, field: "position", value: {...unit.position, x: feet.x, y: feet.y}});
      return;
    }

    if (tool === "add-circle" && drawingCircle) {
      // The center (set on pointerdown) is already snapped - the radius
      // drag itself traces a circle's edge, not a point to snap.
      const feet = feetFromClient(e.clientX, e.clientY);
      if (!feet) return;
      const dx = feet.x - drawingCircle.location.x;
      const dy = feet.y - drawingCircle.location.y;
      setDrawingCircle((current) => ({...current, radius: Math.sqrt(dx * dx + dy * dy)}));
      return;
    }

    if (tool === "add-line-connection" && drawingLine) {
      const rawFeet = feetFromClient(e.clientX, e.clientY);
      if (!rawFeet) return;
      let feet = snapFeet(rawFeet, null, e.shiftKey);
      // Snapping "end" onto the same point as "start" would make the line
      // uncommittable (see commitLineConnection's zero-length guard) -
      // fall back to the raw position rather than silently discarding the
      // drag.
      if (feet.x === drawingLine.start.x && feet.y === drawingLine.start.y) feet = rawFeet;
      setDrawingLine((current) => ({...current, end: feet}));
      return;
    }

    if (tool === "add-unit" && drawingUnit) {
      // Not snapped, same reasoning as the position itself above.
      const feet = feetFromClient(e.clientX, e.clientY);
      if (!feet) return;
      setDrawingUnit((current) => ({...current, current: feet}));
      return;
    }

    if (!dragRef.current) return;
    const {startX, startY, startOffset} = dragRef.current;
    // Always record the latest position (cheap, no re-render) - only the
    // *scheduling* of the state update is throttled to one per frame, via
    // panRafRef below, so a fast drag never applies a stale mid-frame
    // position once the pending frame actually fires.
    pendingOffsetRef.current = {x: startOffset.x + (e.clientX - startX), y: startOffset.y + (e.clientY - startY)};

    if (panRafRef.current == null) {
      panRafRef.current = requestAnimationFrame(() => {
        panRafRef.current = null;
        setOffset(pendingOffsetRef.current);
      });
    }
  }

  function handlePointerUp() {
    dragRef.current = null;
    barrierDragRef.current = null;
    connectionDragRef.current = null;
    unitDragRef.current = null;
    if (tool === "add-circle" && drawingCircle) commitCircle();
    if (tool === "add-line-connection" && drawingLine) commitLineConnection();
    if (tool === "add-unit" && drawingUnit) commitUnit();
  }

  function handlePointerLeave() {
    handlePointerUp();
    setCursorPixel(null);
  }

  function handleFileInputChange(e) {
    const file = e.target.files[0];
    if (file) onImageFile(file);
  }

  function handleDrop(e) {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file) onImageFile(file);
  }

  // Live "where would this land" preview while wall-point placement is
  // active - lets the author see the resulting wall shape, including the
  // not-yet-placed point, as they move the mouse before committing with a
  // click. Snapped like a real placement would be, but not shift-aware
  // (there's no live modifier-key tracking outside an actual pointer
  // event) - always previews as if snapping were on.
  const placementPreviewLocations = (() => {
    if (!placement || !cursorPixel || !hasBothAxes(feetDimensions)) return null;
    const barrier = mapData.barriers[placement.barrierIndex];
    if (!barrier || barrier.type !== "wall") return null;
    const hoverFeet = pixelToFeet(cursorPixel.x, cursorPixel.y, image.pixelDimensions, feetDimensions);
    const {locations} = barrier;

    if (placement.mode === "edit") {
      // Exclude the point being edited from its own snap candidates -
      // otherwise it'd always "snap" right back to wherever it already is.
      const exclude = {kind: "wall-point", barrierIndex: placement.barrierIndex, pointIndex: placement.pointIndex};
      const previewPoint = snapFeet(hoverFeet, exclude, false);
      return locations.map((loc, i) => (i === placement.pointIndex ? previewPoint : loc));
    }

    const previewPoint = snapFeet(hoverFeet, null, false);
    return [...locations.slice(0, placement.pointIndex), previewPoint, ...locations.slice(placement.pointIndex)];
  })();

  // Same live "where would this land" preview as placementPreviewLocations
  // above, for a patrol step - not snapped though (see handlePointerDown's
  // patrolStepPlacement branch: a step's position isn't meant to snap to a
  // barrier/connection point the way those snap to each other).
  const patrolStepPreviewPositions = (() => {
    if (!patrolStepPlacement || !cursorPixel || !hasBothAxes(feetDimensions)) return null;
    const unit = mapData.units[patrolStepPlacement.unitIndex];
    if (!unit || unit.movement?.type !== "patrol") return null;
    const positions = (unit.movement.steps ?? []).map((step) => step.position);
    const hoverFeet = pixelToFeet(cursorPixel.x, cursorPixel.y, image.pixelDimensions, feetDimensions);

    if (patrolStepPlacement.mode === "edit") {
      return positions.map((pos, i) => (i === patrolStepPlacement.stepIndex ? hoverFeet : pos));
    }

    const {stepIndex} = patrolStepPlacement;
    return [...positions.slice(0, stepIndex), hoverFeet, ...positions.slice(stepIndex)];
  })();

  // Every armed interactive mode gets a status readout and a crosshair
  // cursor (below) - wall/connection-field placement had this already;
  // the single-shot add-tools (armed from BarriersPanel/ConnectionsPanel's
  // "+" buttons, but with no visible change until now) didn't, which made
  // it impossible to tell whether a sidebar click had actually armed
  // anything before the next click on the map.
  const placingStatusText = placement || connectionPlacement || unitPlacement || patrolStepPlacement || wanderLocationPlacement
    ? "Placing Points"
    : {
      "add-circle": "Placing Circle - drag on the map",
      "add-point-connection": "Placing Point Connection - click the map",
      "add-line-connection": "Placing Line Connection - drag on the map",
      "add-unit": "Placing Unit - click the map",
    }[tool];
  const isPlacing = !!placingStatusText;

  return (
    <div className="map-canvas-area">
      <div className="map-canvas-toolbar-row">
        <a href={backUrl} className="map-canvas-back-link">← Back</a>
        {image && (
          <div className="map-toolbar-button-group">
            <button type="button" onClick={() => zoomAroundCenter(1 / ZOOM_STEP)}>−</button>
            <button type="button" onClick={applyFit}>Fit</button>
            <button type="button" onClick={() => zoomAroundCenter(ZOOM_STEP)}>+</button>
          </div>
        )}
        {image && mapData.units.length > 0 && (
          <div className="map-toolbar-button-group map-simulate-group">
            <button
              type="button" className={simulating ? "map-simulate-active" : ""}
              disabled={previewing}
              onClick={() => onToggleSimulate?.()}
            >
              {simulating ? "Stop Simulating" : "Simulate Units"}
            </button>
            {simulating && (
              <label className="map-simulate-speed">
                {simSpeed}x
                <input
                  type="range" min="1" max="10" step="1" value={simSpeed}
                  onChange={(e) => onSimSpeedChange?.(parseInt(e.target.value, 10))}
                />
              </label>
            )}
          </div>
        )}
        {image && canDrawBarriers && (
          <div className="map-toolbar-button-group map-preview-group">
            <button
              type="button" className={previewing ? "map-simulate-active" : ""}
              disabled={simulating}
              onClick={() => onTogglePreview?.()}
            >
              {previewing ? "Exit Walk Preview" : "Walk Preview"}
            </button>
          </div>
        )}
        {isPlacing && <span className="map-canvas-placing-status">{placingStatusText}</span>}
      </div>
      {image && (
        <div className="map-canvas-toolbar-row">
          <button type="button" className="map-canvas-replace" onClick={() => replaceInputRef.current?.click()}>
            Replace image
          </button>
          <input
            ref={replaceInputRef} type="file" accept="image/*"
            className="map-canvas-replace-input" onChange={handleFileInputChange}
          />
        </div>
      )}
      {imageError && <div className="map-canvas-error">{imageError}</div>}
      {previewing ? (
        <MapPreviewCanvas mapData={mapData} availableUnitTypes={availableUnitTypes} imageUrl={image.url} onExit={() => onTogglePreview?.()} />
      ) : image ? (
        <div
          ref={wrapperRef}
          className={`map-canvas-wrapper${isPlacing ? " map-canvas-wrapper-placing" : ""}`}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerLeave={handlePointerLeave}
        >
          <div
            className="map-canvas-content"
            style={{transform: `translate(${offset.x}px, ${offset.y}px) scale(${zoom})`}}
          >
            <img
              // displayImageUrl swaps in a higher-res rasterized bitmap for
              // an SVG source (see MapEditor's own effect) - image.url
              // itself stays the raw asset, used for saving and the walk
              // preview. width/height stay exactly image.pixelDimensions
              // regardless (the coordinate space every overlay below uses),
              // whichever URL is actually painted into that box.
              src={displayImageUrl ?? image.url}
              width={image.pixelDimensions.width}
              height={image.pixelDimensions.height}
              draggable={false}
              alt=""
            />
            {hasBothAxes(feetDimensions) && (
              <svg
                className="map-canvas-grid"
                width={image.pixelDimensions.width}
                height={image.pixelDimensions.height}
              >
                <defs>
                  <pattern
                    id="map-canvas-grid-pattern"
                    width={feetSpacingToPixelsX(GRID_SPACING_FEET, image.pixelDimensions, feetDimensions)}
                    height={feetSpacingToPixelsY(GRID_SPACING_FEET, image.pixelDimensions, feetDimensions)}
                    patternUnits="userSpaceOnUse"
                  >
                    <path
                      d={`M ${feetSpacingToPixelsX(GRID_SPACING_FEET, image.pixelDimensions, feetDimensions)} 0 L 0 0 0 ${feetSpacingToPixelsY(GRID_SPACING_FEET, image.pixelDimensions, feetDimensions)}`}
                      fill="none" stroke="rgba(255,255,255,0.35)" strokeWidth="1"
                    />
                  </pattern>
                </defs>
                <rect width="100%" height="100%" fill="url(#map-canvas-grid-pattern)" />
              </svg>
            )}
            {canDrawBarriers && mapData.barriers.length > 0 && (
              <BarrierShapes
                barriers={mapData.barriers}
                pixelDimensions={image.pixelDimensions}
                feetDimensions={feetDimensions}
                tool={tool}
                selectedIndex={selectedBarrierIndex}
                hoveredIndex={hoveredBarrierIndex}
                hoveredPoint={hoveredPoint}
                onSelect={onSelectBarrier}
                onStartDragPoint={startDragWallPoint}
                onStartDragCircleMove={startDragCircleMove}
                onStartDragCircleResize={startDragCircleResize}
              />
            )}
            {canDrawBarriers && placementPreviewLocations && (
              <svg className="map-canvas-shapes map-canvas-placement-preview" width={image.pixelDimensions.width} height={image.pixelDimensions.height}>
                {placementPreviewLocations.length >= 2 && (
                  <polyline
                    points={placementPreviewLocations.map((loc) => {
                      const p = feetToPixel(loc.x, loc.y, image.pixelDimensions, feetDimensions);
                      return `${p.x},${p.y}`;
                    }).join(" ")}
                    fill="none" stroke="#ffde7a" strokeWidth={3} strokeDasharray="6,4"
                  />
                )}
                {(() => {
                  const pending = placementPreviewLocations[placement.pointIndex];
                  const p = feetToPixel(pending.x, pending.y, image.pixelDimensions, feetDimensions);
                  return <circle cx={p.x} cy={p.y} r={4} fill="#ffde7a" />;
                })()}
              </svg>
            )}
            {canDrawBarriers && patrolStepPreviewPositions && (
              <svg className="map-canvas-shapes map-canvas-placement-preview" width={image.pixelDimensions.width} height={image.pixelDimensions.height}>
                {patrolStepPreviewPositions.length >= 2 && (
                  <polyline
                    points={patrolStepPreviewPositions.map((pos) => {
                      const p = feetToPixel(pos.x, pos.y, image.pixelDimensions, feetDimensions);
                      return `${p.x},${p.y}`;
                    }).join(" ")}
                    fill="none" stroke="#ff9800" strokeWidth={3} strokeDasharray="1,6" strokeLinecap="round"
                  />
                )}
                {(() => {
                  const pending = patrolStepPreviewPositions[patrolStepPlacement.stepIndex];
                  const p = feetToPixel(pending.x, pending.y, image.pixelDimensions, feetDimensions);
                  return <circle cx={p.x} cy={p.y} r={4} fill="#ff9800" />;
                })()}
              </svg>
            )}
            {canDrawBarriers && drawingCircle && drawingCircle.radius > 0 && (
              <svg className="map-canvas-shapes" width={image.pixelDimensions.width} height={image.pixelDimensions.height}>
                <circle
                  cx={feetToPixel(drawingCircle.location.x, drawingCircle.location.y, image.pixelDimensions, feetDimensions).x}
                  cy={feetToPixel(drawingCircle.location.x, drawingCircle.location.y, image.pixelDimensions, feetDimensions).y}
                  r={feetSpacingToPixelsX(drawingCircle.radius, image.pixelDimensions, feetDimensions)}
                  fill="rgba(255,222,122,0.15)" stroke="#ffde7a" strokeWidth={3} strokeDasharray="6,4"
                />
              </svg>
            )}
            {canDrawBarriers && mapData.connections.length > 0 && (
              <ConnectionShapes
                connections={mapData.connections}
                pixelDimensions={image.pixelDimensions}
                feetDimensions={feetDimensions}
                tool={tool}
                selectedIndex={selectedConnectionIndex}
                hoveredIndex={hoveredConnectionIndex}
                onSelect={onSelectConnection}
                onStartDragPoint={startDragConnectionPoint}
                onStartDragEndpoint={startDragConnectionEndpoint}
              />
            )}
            {canDrawBarriers && drawingLine && (
              <svg className="map-canvas-shapes" width={image.pixelDimensions.width} height={image.pixelDimensions.height}>
                <line
                  x1={feetToPixel(drawingLine.start.x, drawingLine.start.y, image.pixelDimensions, feetDimensions).x}
                  y1={feetToPixel(drawingLine.start.x, drawingLine.start.y, image.pixelDimensions, feetDimensions).y}
                  x2={feetToPixel(drawingLine.end.x, drawingLine.end.y, image.pixelDimensions, feetDimensions).x}
                  y2={feetToPixel(drawingLine.end.x, drawingLine.end.y, image.pixelDimensions, feetDimensions).y}
                  stroke="#8fe3fa" strokeWidth={3} strokeDasharray="6,4"
                />
              </svg>
            )}
            {canDrawBarriers && mapData.units.length > 0 && (
              <MovementShapes
                units={mapData.units}
                pixelDimensions={image.pixelDimensions}
                feetDimensions={feetDimensions}
                availableUnitTypes={availableUnitTypes}
                hoveredPatrolStep={hoveredPatrolStep}
                hoveredUnitIndex={hoveredUnitIndex}
                expandedUnitIndices={expandedUnitIndices}
              />
            )}
            {canDrawBarriers && mapData.units.length > 0 && (
              <UnitShapes
                units={mapData.units}
                pixelDimensions={image.pixelDimensions}
                feetDimensions={feetDimensions}
                tool={tool}
                availableUnitTypes={availableUnitTypes}
                selectedIndex={selectedUnitIndex}
                hoveredIndex={hoveredUnitIndex}
                onSelect={onSelectUnit}
                onStartDrag={startDragUnit}
                onHoverUnit={onHoverUnit}
              />
            )}
            {canDrawBarriers && (
              <GroupShapes
                units={mapData.units}
                pixelDimensions={image.pixelDimensions}
                feetDimensions={feetDimensions}
                availableUnitTypes={availableUnitTypes}
                groupIdentifier={groupingMode?.groupIdentifier ?? hoveredGroupIdentifier}
              />
            )}
            {canDrawBarriers && drawingUnit && (() => {
              const start = feetToPixel(drawingUnit.position.x, drawingUnit.position.y, image.pixelDimensions, feetDimensions);
              const rawEnd = feetToPixel(drawingUnit.current.x, drawingUnit.current.y, image.pixelDimensions, feetDimensions);
              const vx = rawEnd.x - start.x, vy = rawEnd.y - start.y;
              const dragPixelLength = Math.hypot(vx, vy);
              if (dragPixelLength === 0) return null;
              // Capped at 2x the unit's own radius (feet, converted to this
              // map's px/ft scale) - the drag itself can go arbitrarily far
              // (that's what decides the committed angle, see commitUnit),
              // but the preview arrow only ever needs to show direction.
              const tokenRadiusFeet = availableUnitTypes[pendingUnitType]?.tokenRadius ?? DEFAULT_UNIT_RADIUS_FEET;
              const maxPixelLength = feetSpacingToPixelsX(tokenRadiusFeet * 2, image.pixelDimensions, feetDimensions);
              const length = Math.min(dragPixelLength, maxPixelLength);
              const ux = vx / dragPixelLength, uy = vy / dragPixelLength;
              const tipX = start.x + ux * length, tipY = start.y + uy * length;
              // A small hand-drawn arrowhead (two short segments back from
              // the tip) - simpler than an SVG marker, matches this file's
              // existing preference for plain shapes over defs/markers.
              // Proportional to the (already-capped) shaft length, not a
              // flat pixel size - a low-density map (few image-px per foot)
              // can cap the shaft itself at just a few pixels, and a fixed
              // 8px head would then dwarf the whole arrow.
              const headLength = Math.min(8, length * 0.4), headSpread = 0.5;
              const headAngle = Math.atan2(uy, ux);
              const leftX = tipX - headLength * Math.cos(headAngle - headSpread);
              const leftY = tipY - headLength * Math.sin(headAngle - headSpread);
              const rightX = tipX - headLength * Math.cos(headAngle + headSpread);
              const rightY = tipY - headLength * Math.sin(headAngle + headSpread);
              return (
                <svg className="map-canvas-shapes" width={image.pixelDimensions.width} height={image.pixelDimensions.height}>
                  <line x1={start.x} y1={start.y} x2={tipX} y2={tipY} stroke="#ff3b3b" strokeWidth={1} />
                  <polyline points={`${leftX},${leftY} ${tipX},${tipY} ${rightX},${rightY}`} fill="none" stroke="#ff3b3b" strokeWidth={1} />
                </svg>
              );
            })()}
          </div>
        </div>
      ) : (
        <div className="map-canvas-dropzone" onDrop={handleDrop} onDragOver={(e) => e.preventDefault()}>
          <label>
            Choose a map image, or drop one here (under 25MB)
            <input type="file" accept="image/*" onChange={handleFileInputChange} />
          </label>
        </div>
      )}
      {image && (
        <div className="map-canvas-status-bar">
          {cursorPixel ? (
            <>
              <span>{Math.round(cursorPixel.x)}, {Math.round(cursorPixel.y)} px</span>
              {hasBothAxes(feetDimensions) && (() => {
                const feet = pixelToFeet(cursorPixel.x, cursorPixel.y, image.pixelDimensions, feetDimensions);
                return <span>{feet.x.toFixed(1)}, {feet.y.toFixed(1)} ft</span>;
              })()}
            </>
          ) : (
            <span>—</span>
          )}
        </div>
      )}
    </div>
  );
}
