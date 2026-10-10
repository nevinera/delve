// A big generated map for timing the renderer at the sizes real maps will
// be: smooth value noise, thresholded into forest and meadow.
import {hash01} from "../random";

export function stressTestMap(size = 200, seed = 5) {
  const noise = (x, y) => {
    const x0 = Math.floor(x);
    const y0 = Math.floor(y);
    const fx = smooth(x - x0);
    const fy = smooth(y - y0);
    const v = (dx, dy) => hash01(seed, x0 + dx, y0 + dy);
    return lerp(lerp(v(0, 0), v(1, 0), fx), lerp(v(0, 1), v(1, 1), fx), fy);
  };
  const cells = [];
  for (let row = 0; row < size; row++) {
    let line = "";
    for (let col = 0; col < size; col++) {
      const n = 0.65 * noise(col / 14, row / 14) + 0.35 * noise(col / 5 + 100, row / 5);
      line += n > 0.45 ? "T" : ".";
    }
    cells.push(line);
  }
  return {format: "cellmap", version: 1, name: `Stress test (${size}×${size})`, grid: {type: "hex", cols: size, rows: size, cellSize: 5}, seed, cells};
}

const smooth = (t) => t * t * (3 - 2 * t);
const lerp = (a, b, t) => a + (b - a) * t;
