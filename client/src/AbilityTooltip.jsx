import {useRef, useState} from "react";
import {createPortal} from "react-dom";

const SHOW_DELAY_MS = 500;

const tooltipStyle = {
  position: "fixed",
  zIndex: 100,
  background: "rgba(20,16,12,0.97)",
  border: "1px solid #556",
  borderRadius: 6,
  padding: "8px 12px",
  minWidth: 140,
  maxWidth: 280,
  pointerEvents: "none",
};

const nameStyle = {color: "#cce", fontSize: 14, fontWeight: "bold"};
const descriptionStyle = {color: "#aaa", fontSize: 12, marginTop: 4};
const hintStyle = {color: "#667", fontSize: 11, marginTop: 6};

// Wraps an ability/power button and shows its name (and description, if
// any) near the cursor after a short hover delay - mirrors ItemTooltip's
// mouse-tracked portal approach (App.jsx), but debounced: a mouse skating
// across a bar of action buttons shouldn't spawn a tooltip per button, only
// one it actually pauses on.
export function AbilityTooltip({ability, hint, children, style}) {
  const [pos, setPos] = useState(null);
  const timerRef = useRef(null);

  function clearTimer() {
    if (timerRef.current == null) return;
    clearTimeout(timerRef.current);
    timerRef.current = null;
  }

  function handleEnter(e) {
    const {clientX: x, clientY: y} = e;
    clearTimer();
    timerRef.current = setTimeout(() => setPos({x, y}), SHOW_DELAY_MS);
  }

  function handleMove(e) {
    if (!pos) return;
    setPos({x: e.clientX, y: e.clientY});
  }

  function handleLeave() {
    clearTimer();
    setPos(null);
  }

  if (!ability) return children;

  return (
    <span
      style={{display: "inline-block", ...style}}
      onMouseEnter={handleEnter}
      onMouseMove={handleMove}
      onMouseLeave={handleLeave}
    >
      {children}
      {pos && createPortal(
        <div style={{...tooltipStyle, left: pos.x + 16, top: pos.y + 16}}>
          <div style={nameStyle}>{ability.name}</div>
          {ability.description && <div style={descriptionStyle}>{ability.description}</div>}
          {hint && <div style={hintStyle}>{hint}</div>}
        </div>,
        document.body
      )}
    </span>
  );
}
