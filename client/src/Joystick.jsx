import { useEffect, useRef } from "react";
import nipplejs from "nipplejs";

// Generic touch-stick wrapper around nipplejs - reports each move as the raw
// nipplejs event data (angle/force/vector) via onMove, and calls onEnd when
// released or dragged back into the deadzone. Callers decide what the stick
// controls (movementKeysRef for discrete WASD-style movement, a continuous
// vector ref for camera look, etc.) rather than this component assuming one.
// `horizontal` locks the knob to left/right, and swaps the round base for
// a left/right track so the stick reads as one-axis.
export function Joystick({ onMove, onEnd, style, horizontal = false }) {
  const zoneRef = useRef(null);

  useEffect(() => {
    if (!zoneRef.current) return undefined;

    const debug = new URLSearchParams(window.location.search).has("debugJoystick");
    if (debug) {
      const rect = zoneRef.current.getBoundingClientRect();
      console.log("[joystick] creating manager, zone rect:", rect);
    }

    const manager = nipplejs.create({
      zone: zoneRef.current,
      mode: "static",
      position: { left: "50%", top: "50%" },
      color: horizontal ? { front: "white", back: "transparent" } : "white",
      size: 100,
      lockX: horizontal,
    });

    if (debug) {
      manager.on("start", () => console.log("[joystick] start"));
      manager.on("destroyed", () => console.log("[joystick] destroyed"));
    }

    // This version of nipplejs (1.0.4) calls handlers with a single `evt`
    // argument (evt.type, evt.data) - not the classic two-arg (evt, data)
    // signature most nipplejs examples/docs show.
    manager.on("move", (evt) => {
      const data = evt.data;
      if (debug) console.log("[joystick] move", { angle: data.angle?.degree, force: data.force, vector: data.vector });
      if (!data.angle || data.force < 0.1) { onEnd?.(); return; }
      onMove?.(data);
    });
    manager.on("end", () => {
      if (debug) console.log("[joystick] end");
      onEnd?.();
    });

    return () => manager.destroy();
  }, [onMove, onEnd, horizontal]);

  return (
    <div ref={zoneRef} style={style}>
      {horizontal && (
        <div data-testid="joystick-horizontal-track" aria-hidden="true" style={styles.track}>
          <span>◀</span>
          <span>▶</span>
        </div>
      )}
    </div>
  );
}

const styles = {
  // Under the knob (nipplejs draws at z-index 999), centered where it rests.
  track: {
    position: "absolute",
    left: "50%",
    top: "50%",
    width: 108,
    height: 44,
    marginLeft: -54,
    marginTop: -22,
    boxSizing: "border-box",
    borderRadius: 22,
    border: "2px solid rgba(255, 255, 255, 0.35)",
    background: "rgba(255, 255, 255, 0.08)",
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "0 8px",
    color: "rgba(255, 255, 255, 0.5)",
    fontSize: 12,
    pointerEvents: "none",
  },
};
