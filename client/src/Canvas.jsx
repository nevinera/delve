import { useEffect, useRef } from "react";
import { SceneManager } from "./game/scene";

export default function Canvas({
  zoneSourceUrl,
  units,
  selfIdentifier,
  characterTokenUrl,
  movementKeysRef,
  turnKeysRef,
  onFacingChange,
  onSelfPosition,
}) {
  const canvasRef = useRef(null);
  const managerRef = useRef(null);

  useEffect(() => {
    const manager = new SceneManager(canvasRef.current, { movementKeysRef, turnKeysRef, onFacingChange, onSelfPosition });
    managerRef.current = manager;
    manager.handleResize();
    manager.startLoop();
    manager.loadZone(zoneSourceUrl);

    const observer = new ResizeObserver(() => manager.handleResize());
    observer.observe(canvasRef.current);

    return () => {
      observer.disconnect();
      manager.dispose();
    };
  }, []);

  useEffect(() => {
    managerRef.current?.updateUnits(units, selfIdentifier, characterTokenUrl);
  }, [units]);

  return (
    <canvas
      ref={canvasRef}
      style={{ flex: 1, display: "block", minHeight: 0, width: "100%", height: "100%" }}
    />
  );
}
