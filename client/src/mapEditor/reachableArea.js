// The part of a map a walker can get to from its entrances, as a grid
// flood-filled from each connection through open ground. Spots a walker
// can't stand on (off the map, inside a circle barrier, within `clearance`
// of a wall) block the fill, so ground walled off from every entrance -
// outside a dungeon's outer walls, say - isn't reachable.
const CELL = 1;

function distToSegment(p, a, b) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len2 = dx * dx + dy * dy;
  const t = len2 === 0 ? 0 : Math.min(1, Math.max(0, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2));
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

function markBlocked(blocked, cols, rows, box, blocks) {
  const x0 = Math.max(0, Math.floor(box.minX / CELL));
  const x1 = Math.min(cols - 1, Math.floor(box.maxX / CELL));
  const y0 = Math.max(0, Math.floor(box.minY / CELL));
  const y1 = Math.min(rows - 1, Math.floor(box.maxY / CELL));
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      if (blocks({x: (x + 0.5) * CELL, y: (y + 0.5) * CELL})) blocked[y * cols + x] = 1;
    }
  }
}

// seeds: [{x, y}] in feet. Returns {contains({x, y}), nearest(p) -> {x, y} | null}.
export function reachableArea(mapData, seeds, clearance) {
  const {width, height} = mapData.feetDimensions;
  const cols = Math.max(1, Math.ceil(width / CELL));
  const rows = Math.max(1, Math.ceil(height / CELL));
  const blocked = new Uint8Array(cols * rows);

  for (const b of mapData.barriers ?? []) {
    if (b.type === "circle" && b.location) {
      const r = b.radius + CELL;
      markBlocked(blocked, cols, rows, {minX: b.location.x - r, maxX: b.location.x + r, minY: b.location.y - r, maxY: b.location.y + r},
        (p) => Math.hypot(p.x - b.location.x, p.y - b.location.y) <= b.radius);
    } else if (b.type === "wall" && b.locations) {
      for (let i = 0; i + 1 < b.locations.length; i++) {
        const [a, c] = [b.locations[i], b.locations[i + 1]];
        const r = clearance + CELL;
        markBlocked(blocked, cols, rows,
          {minX: Math.min(a.x, c.x) - r, maxX: Math.max(a.x, c.x) + r, minY: Math.min(a.y, c.y) - r, maxY: Math.max(a.y, c.y) + r},
          (p) => distToSegment(p, a, c) < clearance);
      }
    }
  }

  const cellOf = (p) => ({x: Math.min(cols - 1, Math.max(0, Math.floor(p.x / CELL))), y: Math.min(rows - 1, Math.max(0, Math.floor(p.y / CELL)))});
  const reached = new Uint8Array(cols * rows);
  const stack = [];
  const visit = (x, y) => {
    const i = y * cols + x;
    if (x < 0 || y < 0 || x >= cols || y >= rows || blocked[i] || reached[i]) return;
    reached[i] = 1;
    stack.push([x, y]);
  };

  // A connection may sit right against a wall, so start from the closest open cell around it.
  for (const seed of seeds) {
    const c = cellOf(seed);
    let found = null;
    for (let radius = 0; radius <= 6 && !found; radius++) {
      for (let dy = -radius; dy <= radius && !found; dy++) {
        for (let dx = -radius; dx <= radius && !found; dx++) {
          const [x, y] = [c.x + dx, c.y + dy];
          if (x >= 0 && y >= 0 && x < cols && y < rows && !blocked[y * cols + x]) found = [x, y];
        }
      }
    }
    if (found) visit(...found);
  }
  while (stack.length) {
    const [x, y] = stack.pop();
    visit(x + 1, y);
    visit(x - 1, y);
    visit(x, y + 1);
    visit(x, y - 1);
  }

  return {
    contains(p) {
      if (p.x < 0 || p.y < 0 || p.x > width || p.y > height) return false;
      const c = cellOf(p);
      return reached[c.y * cols + c.x] === 1;
    },
  };
}
