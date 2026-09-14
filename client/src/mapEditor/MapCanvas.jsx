import {useEffect, useRef, useState} from "react";
import {pixelToFeet, feetSpacingToPixelsX, feetSpacingToPixelsY} from "./mapCoords";

const MIN_ZOOM = 0.05;
const MAX_ZOOM = 4;
const ZOOM_STEP = 1.25; // per click of the +/- buttons
const GRID_SPACING_FEET = 5;

function hasBothAxes(dimensions) {
  return dimensions?.width && dimensions?.height;
}
// Wheel zoom is proportional to deltaY rather than one full ZOOM_STEP per
// event - a single mouse-wheel notch (deltaY ~100) lands around a gentle
// ~8% zoom instead of the buttons' 25%; a trackpad's much smaller
// per-event deltas scale down accordingly. Clamped per event so one large
// delta spike (some mice report much bigger notches) can't jump too far.
const WHEEL_ZOOM_SENSITIVITY = 0.0008;
const MAX_WHEEL_FACTOR_PER_EVENT = 1.25;

function clampZoom(zoom) {
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom));
}

// Top-down pan/zoom viewport for the map background image. Panning is a
// plain CSS transform on a content div holding the image at native pixel
// size (not native scroll, not an SVG viewBox) - drag-to-pan works
// regardless of tool/zoom, and every future slice (grid, barriers,
// connections, units) draws into the same untransformed pixel-space content
// div, so their own coordinates are always just raw image pixels.
//
// The toolbar is two rows - row 1 (navigation/view: back, zoom) is always
// present; row 2 (editing actions: replace image today, tool-mode buttons
// in later slices) only once there's something to put there.
export default function MapCanvas({image, imageError, onImageFile, backUrl, feetDimensions}) {
  const wrapperRef = useRef(null);
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState({x: 0, y: 0});
  const [cursorPixel, setCursorPixel] = useState(null); // {x, y} in content (image) pixel space, or null off-canvas
  const dragRef = useRef(null); // {startX, startY, startOffset} while a pan drag is in progress
  const panRafRef = useRef(null); // pending requestAnimationFrame id, or null
  const pendingOffsetRef = useRef(null); // latest not-yet-applied offset from pointermove
  const zoomRafRef = useRef(null); // pending requestAnimationFrame id, or null
  const pendingZoomRef = useRef(null); // {factor, cursorX, cursorY} accumulated since the last flush

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

  function handlePointerDown(e) {
    if (!image) return;
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
    const rect = wrapperRef.current.getBoundingClientRect();
    setCursorPixel({
      x: (e.clientX - rect.left - offset.x) / zoom,
      y: (e.clientY - rect.top - offset.y) / zoom,
    });
  }

  function handlePointerMove(e) {
    updateCursorPixel(e);

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

  return (
    <div className="map-canvas-area">
      <div className="map-canvas-toolbar-row">
        <a href={backUrl} className="map-canvas-back-link">← Back</a>
        {image && (
          <div className="map-toolbar-button-group">
            <button type="button" onClick={() => setZoom((z) => clampZoom(z / ZOOM_STEP))}>−</button>
            <button type="button" onClick={applyFit}>Fit</button>
            <button type="button" onClick={() => setZoom((z) => clampZoom(z * ZOOM_STEP))}>+</button>
          </div>
        )}
      </div>
      {image && (
        <div className="map-canvas-toolbar-row">
          <label className="map-canvas-replace">
            Replace image
            <input type="file" accept="image/*" onChange={handleFileInputChange} />
          </label>
        </div>
      )}
      {imageError && <div className="map-canvas-error">{imageError}</div>}
      {image ? (
        <div
          ref={wrapperRef}
          className="map-canvas-wrapper"
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
              src={image.url}
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
