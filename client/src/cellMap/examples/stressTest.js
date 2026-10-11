// A big generated map for timing the renderer at the sizes real maps will
// be: smooth value noise, thresholded into forest and the kinds of meadow,
// with a few winding trails across it.
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
      const ground = noise(col / 9 + 300, row / 9 + 300);
      line += n > 0.45 ? "T" : ground < 0.3 ? "~" : ground > 0.68 ? "%" : ".";
    }
    cells.push(line);
  }
  const trails = TRAILS.map(([period, phase, offset]) => ({
    width: 0.9,
    points: Array.from({length: Math.ceil(size / 3) + 1}, (_, i) => {
      const col = Math.min(size, i * 3);
      return [col, offset * size + 0.12 * size * Math.sin(col / period + phase)];
    }),
  }));
  return {format: "cellmap", version: 1, name: `Stress test (${size}×${size})`, grid: {type: "hex", cols: size, rows: size, cellSize: 5}, seed, cells, trails};
}

// [period, phase, offset] for each trail: a sine across the map, in cells.
const TRAILS = [[19, 0, 0.25], [27, 2, 0.55], [15, 4, 0.8]];

const smooth = (t) => t * t * (3 - 2 * t);
const lerp = (a, b, t) => a + (b - a) * t;
