import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";
import { SceneManager } from "./game/scene";

const Canvas = forwardRef(function Canvas({
  zoneSourceUrl,
  zoneSourceSha,
  units,
  ncus,
  groundAreas,
  questNcus,
  activeQuests,
  zoneIdentifier,
  selfIdentifier,
  characterTokenUrl,
  movementKeysRef,
  turnKeysRef,
  cameraStickRef,
  cameraSensitivityRef,
  onFacingChange,
  onCanvasResize,
  onSelfPosition,
  positionForMoveSeq,
  onUnitClick,
  onUnitRightClick,
  onUnitHover,
  onNcuRightClick,
  onInteractableRightClick,
  targetId,
  attacking,
  lootableUnitIds,
  statusCatalog,
  stockAssets,
}, ref) {
  const canvasRef = useRef(null);
  const managerRef = useRef(null);

  useImperativeHandle(ref, () => ({
    isInView: (mapX, mapY) => managerRef.current?.isInView(mapX, mapY) ?? true,
    ncuInfo: (zoneNcuIdentifier) => managerRef.current?.ncuInfo(zoneNcuIdentifier) ?? null,
    interactableInfo: (identifier) => managerRef.current?.interactableInfo(identifier) ?? null,
    playGraphicEffects: (effects, positions, baseUrl, travelOverrideMs) =>
      managerRef.current?.playGraphicEffects(effects, positions, baseUrl, travelOverrideMs),
  }));

  useEffect(() => {
    const manager = new SceneManager(canvasRef.current, { movementKeysRef, turnKeysRef, cameraStickRef, cameraSensitivityRef, onFacingChange, onCanvasResize, onSelfPosition, positionForMoveSeq, onUnitClick, onUnitRightClick, onUnitHover, onNcuRightClick, onInteractableRightClick });
    managerRef.current = manager;
    manager.handleResize();
    manager.startLoop();
    manager.loadZone(zoneSourceUrl, zoneSourceSha);

    const observer = new ResizeObserver(() => manager.handleResize());
    observer.observe(canvasRef.current.parentElement);

    return () => {
      observer.disconnect();
      manager.dispose();
    };
  }, []);

  useEffect(() => {
    managerRef.current?.updateUnits(units, selfIdentifier, characterTokenUrl);
    managerRef.current?.syncStatusAuras(units, statusCatalog ?? {}, stockAssets);
  }, [units, statusCatalog, stockAssets]);

  useEffect(() => {
    managerRef.current?.syncGroundAreas(groundAreas ?? [], stockAssets);
  }, [groundAreas, units, stockAssets]);

  useEffect(() => {
    managerRef.current?.updateNcus(ncus ?? {});
  }, [ncus, units]);

  useEffect(() => {
    managerRef.current?.setNcuQuestMarkers(questNcus ?? new Set());
  }, [questNcus]);

  useEffect(() => {
    managerRef.current?.setInteractableQuests(activeQuests ?? {}, zoneIdentifier);
  }, [activeQuests, zoneIdentifier]);

  useEffect(() => {
    managerRef.current?.setTarget(targetId);
  }, [targetId]);

  useEffect(() => {
    managerRef.current?.setAttacking(attacking);
  }, [attacking]);

  useEffect(() => {
    managerRef.current?.setLootableUnits(lootableUnitIds ?? new Set());
  }, [lootableUnitIds]);

  return (
    <canvas
      ref={canvasRef}
      style={{ display: "block", touchAction: "none" }}
    />
  );
});

export default Canvas;
