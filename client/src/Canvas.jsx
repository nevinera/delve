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
  onUnitRightClick,
  onUnitHover,
  targetId,
  lootableUnitIds,
}, ref) {
  const canvasRef = useRef(null);
  const managerRef = useRef(null);

  useImperativeHandle(ref, () => ({
    isInView: (mapX, mapY) => managerRef.current?.isInView(mapX, mapY) ?? true,
    playGraphicEffects: (effects, positions, baseUrl, travelOverrideMs) =>
      managerRef.current?.playGraphicEffects(effects, positions, baseUrl, travelOverrideMs),
  }));

  useEffect(() => {
    const manager = new SceneManager(canvasRef.current, { movementKeysRef, turnKeysRef, onFacingChange, onSelfPosition, onUnitClick, onUnitRightClick, onUnitHover });
    managerRef.current = manager;
    manager.handleResize();
    manager.startLoop();
    manager.loadZone(zoneSourceUrl);

    const observer = new ResizeObserver(() => manager.handleResize());
    observer.observe(canvasRef.current.parentElement);

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

  useEffect(() => {
    managerRef.current?.setLootableUnits(lootableUnitIds ?? new Set());
  }, [lootableUnitIds]);

  return (
    <canvas
      ref={canvasRef}
      style={{ display: "block" }}
    />
  );
});

export default Canvas;
