import {useEffect, useRef} from "react";
import {drawStamps} from "../../game/stamps";

// A map's decoration stamps, drawn over its ground in the canvas's pixel
// box (see MapCanvas): placed is the map's stamps, sets the zone's, sheets
// their loaded images (see useStampSheets). Redrawn whenever they change.
export default function StampCanvas({placed, sets, sheets, pixelDimensions, feetDimensions, dimmed = false}) {
  const ref = useRef(null);
  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas?.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    drawStamps(ctx, placed, sets, sheets, pixelDimensions.width / feetDimensions.width);
  }, [placed, sets, sheets, pixelDimensions.width, pixelDimensions.height, feetDimensions.width]);
  return (
    <canvas
      ref={ref}
      className="map-canvas-stamps"
      width={pixelDimensions.width}
      height={pixelDimensions.height}
      style={dimmed ? {opacity: 0.5} : undefined}
    />
  );
}
