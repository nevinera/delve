import { useEffect, useRef } from "react";
import nipplejs from "nipplejs";

// Generic touch-stick wrapper around nipplejs - reports each move as the raw
// nipplejs event data (angle/force/vector) via onMove, and calls onEnd when
// released or dragged back into the deadzone. Callers decide what the stick
// controls (movementKeysRef for discrete WASD-style movement, a continuous
// vector ref for camera look, etc.) rather than this component assuming one.
export function Joystick({ onMove, onEnd, style }) {
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
      color: "white",
      size: 100,
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
  }, [onMove, onEnd]);

  return <div ref={zoneRef} style={style} />;
}
