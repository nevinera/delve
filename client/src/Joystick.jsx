import { useEffect, useRef } from "react";
import nipplejs from "nipplejs";
import { angleToMovementKeys } from "./joystickAngle";

// Touch movement control: drives movementKeysRef exactly like WASD does
// (see KEY_MAP in App.jsx), so scene.js's prediction and the server's move
// handler don't need to know movement came from a stick instead of keys.
export function Joystick({ movementKeysRef, onChange, style }) {
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

    const applyKeys = (keys) => {
      movementKeysRef.current.clear();
      for (const key of keys) movementKeysRef.current.add(key);
      if (debug) console.log("[joystick] keys ->", keys);
      onChange();
    };

    if (debug) {
      manager.on("start", () => console.log("[joystick] start"));
      manager.on("destroyed", () => console.log("[joystick] destroyed"));
    }

    // This version of nipplejs (1.0.4) calls handlers with a single `evt`
    // argument (evt.type, evt.data) - not the classic two-arg (evt, data)
    // signature most nipplejs examples/docs show.
    manager.on("move", (evt) => {
      const data = evt.data;
      if (debug) console.log("[joystick] move raw angle.degree:", data.angle?.degree, "force:", data.force);
      if (!data.angle || data.force < 0.1) { applyKeys([]); return; }
      // data.angle.degree is already standard math convention (0deg=east,
      // 90deg=north) despite nipplejs's own internal "180 - raw" transform
      // (Joystick.ts) - that transform composes with its raw-angle
      // convention to cancel out, confirmed against its own test fixtures
      // (raw degree 90 = a physical drag up = their own 'up' label).
      applyKeys(angleToMovementKeys(data.angle.degree));
    });
    manager.on("end", () => {
      if (debug) console.log("[joystick] end");
      applyKeys([]);
    });

    return () => manager.destroy();
  }, [movementKeysRef, onChange]);

  return <div ref={zoneRef} style={style} />;
}
