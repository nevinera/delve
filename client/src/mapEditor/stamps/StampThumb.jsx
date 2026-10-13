import {useEffect, useRef} from "react";
import {stampFrame} from "../../game/stamps";

// One frame of a stamp, fitted into a size x size square (for the palette).
export default function StampThumb({stamp, sheet, variant = 0, size = 48}) {
  const ref = useRef(null);
  useEffect(() => {
    const ctx = ref.current?.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, size, size);
    if (!sheet) return;
    const frame = stampFrame(stamp, {x: 0, y: 0, variant}, sheet);
    const fit = Math.min(size / frame.width, size / frame.height);
    const [w, h] = [frame.width * fit, frame.height * fit];
    ctx.drawImage(sheet, frame.x, frame.y, frame.width, frame.height, (size - w) / 2, (size - h) / 2, w, h);
  }, [stamp, sheet, variant, size]);
  return <canvas ref={ref} width={size} height={size} className="stamp-thumb" />;
}
