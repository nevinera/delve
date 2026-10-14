import {useRef, useState} from "react";
import {createPortal} from "react-dom";
import "./styles/shared/hoverTooltip.css";

const SHOW_DELAY_MS = 500;

// Wraps an ability/power button and shows its name (and description, if
// any) near the cursor after a short hover delay - mirrors ItemTooltip's
// mouse-tracked portal approach (App.jsx), but debounced: a mouse skating
// across a bar of action buttons shouldn't spawn a tooltip per button, only
// one it actually pauses on.
export function AbilityTooltip({ability, hint, children, className, style}) {
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

  // Always wraps in the same span regardless of whether there's an ability
  // (just without hover handlers when there isn't) - an empty slot used to
  // skip the wrapper entirely, which broke layouts that size buttons via
  // flex on the wrapped element (the span never got flex:1, so a filled
  // slot next to an empty one could end up drastically differently sized).
  return (
    <span
      className={className}
      style={{display: "inline-block", ...style}}
      onMouseEnter={ability ? handleEnter : undefined}
      onMouseMove={ability ? handleMove : undefined}
      onMouseLeave={ability ? handleLeave : undefined}
    >
      {children}
      {ability && pos && createPortal(
        <div className="hover-tooltip" style={{left: pos.x + 16, top: pos.y + 16}}>
          <div className="hover-tooltip-name">{ability.name}</div>
          {ability.description && <div className="hover-tooltip-description">{ability.description}</div>}
          {hint && <div className="hover-tooltip-note">{hint}</div>}
        </div>,
        document.body
      )}
    </span>
  );
}
