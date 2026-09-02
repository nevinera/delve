import {forwardRef, useEffect, useImperativeHandle, useRef} from "react";
import {PreviewSceneManager} from "./previewScene";

const AbilityPreviewCanvas = forwardRef(function AbilityPreviewCanvas({selfTokenUrl, targetTokenUrl, targetDistanceFt}, ref) {
  const canvasRef = useRef(null);
  const managerRef = useRef(null);

  useImperativeHandle(ref, () => ({
    playGraphicEffects: (effects, positions, baseUrl, travelOverrideMs) =>
      managerRef.current?.playGraphicEffects(effects, positions, baseUrl, travelOverrideMs),
    positions: () => managerRef.current?.positions(),
  }));

  useEffect(() => {
    const manager = new PreviewSceneManager(canvasRef.current);
    managerRef.current = manager;
    manager.handleResize();
    manager.startLoop();

    const observer = new ResizeObserver(() => manager.handleResize());
    observer.observe(canvasRef.current.parentElement);

    return () => {
      observer.disconnect();
      manager.dispose();
    };
  }, []);

  useEffect(() => {
    managerRef.current?.setTokenUrls(selfTokenUrl, targetTokenUrl);
  }, [selfTokenUrl, targetTokenUrl]);

  useEffect(() => {
    managerRef.current?.setTargetDistance(targetDistanceFt);
  }, [targetDistanceFt]);

  return <canvas ref={canvasRef} style={{display: "block"}} />;
});

export default AbilityPreviewCanvas;
