import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";
import { SceneManager } from "./game/scene";

const Canvas = forwardRef(function Canvas({
  zoneSourceUrl,
  units,
  selfIdentifier,
  characterTokenUrl,
  movementKeysRef,
  turnKeysRef,
  onFacingChange,
  onSelfPosition,
  onUnitClick,
  targetId,
}, ref) {
  const canvasRef = useRef(null);
  const managerRef = useRef(null);

  useImperativeHandle(ref, () => ({
    isInView: (mapX, mapY) => managerRef.current?.isInView(mapX, mapY) ?? true,
  }));

  useEffect(() => {
    const manager = new SceneManager(canvasRef.current, { movementKeysRef, turnKeysRef, onFacingChange, onSelfPosition, onUnitClick });
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

  useEffect(() => {
    managerRef.current?.setTarget(targetId);
  }, [targetId]);

  return (
    <canvas
      ref={canvasRef}
      style={{ flex: 1, display: "block", minHeight: 0, width: "100%", height: "100%" }}
    />
  );
});

export default Canvas;
