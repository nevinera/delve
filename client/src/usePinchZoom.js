import {useEffect, useRef} from "react";
import {pinchSpan, pinchView} from "./mapEditor/pinchZoom";

// Two-finger pinch-zoom (and pan) for a zoomable, pannable view. Returns
// capture-phase pointer handlers for the view's wrapper element, so they
// run ahead of anything inside it: a second finger calls onPinchStart (to
// cancel whatever the first finger started), and neither finger reaches
// the other handlers again until both lift. view is the current
// {zoom, offset}, or null while there's none; onPinch receives each new
// {zoom, offset}, at most once a frame.
export default function usePinchZoom(wrapperRef, view, {onPinch, onPinchStart, clampZoom}) {
  const touches = useRef(new Map());
  const pinch = useRef(null); // {distance, midpoint, zoom, offset} at the start of a pinch
  const frame = useRef(null);
  const pending = useRef(null); // the latest {zoom, offset}, not yet applied

  useEffect(() => () => {
    if (frame.current != null) cancelAnimationFrame(frame.current);
  }, []);

  // A touch whose up/cancel never reached the wrapper (released outside it,
  // or the wrapper remounted mid-touch) would otherwise linger in `touches`
  // forever, so every later two-finger gesture counts as three and never
  // pinches. Window-level listeners catch those releases.
  useEffect(() => {
    function release(e) {
      if (!touches.current.delete(e.pointerId)) return;
      if (touches.current.size === 0) pinch.current = null;
    }
    window.addEventListener("pointerup", release);
    window.addEventListener("pointercancel", release);
    return () => {
      window.removeEventListener("pointerup", release);
      window.removeEventListener("pointercancel", release);
    };
  }, []);

  function touchPoint(e) {
    const rect = wrapperRef.current.getBoundingClientRect();
    return {x: e.clientX - rect.left, y: e.clientY - rect.top};
  }

  function onPointerDownCapture(e) {
    if (e.pointerType !== "touch" || !wrapperRef.current || !view) return;
    touches.current.set(e.pointerId, touchPoint(e));
    if (touches.current.size !== 2) return;
    const [a, b] = [...touches.current.values()];
    pinch.current = {...pinchSpan(a, b), zoom: view.zoom, offset: view.offset};
    onPinchStart?.();
    e.stopPropagation();
  }

  function onPointerMoveCapture(e) {
    if (!touches.current.has(e.pointerId)) return;
    touches.current.set(e.pointerId, touchPoint(e));
    if (!pinch.current) return;
    e.stopPropagation();
    if (touches.current.size < 2) return;
    const [a, b] = [...touches.current.values()];
    pending.current = pinchView(pinch.current, pinchSpan(a, b), clampZoom);
    if (frame.current == null) {
      frame.current = requestAnimationFrame(() => {
        frame.current = null;
        if (pending.current) onPinch(pending.current);
      });
    }
  }

  function onPointerUpCapture(e) {
    if (!touches.current.delete(e.pointerId)) return;
    if (!pinch.current) return;
    e.stopPropagation();
    if (touches.current.size === 0) pinch.current = null;
  }

  return {onPointerDownCapture, onPointerMoveCapture, onPointerUpCapture, onPointerCancelCapture: onPointerUpCapture};
}
