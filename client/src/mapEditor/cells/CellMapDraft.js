// Owns a cellMap being drawn in the map editor's Cells tab, and every edit
// the tab can make to it (see docs/schema/map.md#cellmap). Immutable, like
// MapDraft: every edit returns a new CellMapDraft.
import {hexDistance, neighbor} from "../../cellMap/hexGrid";
import {THEMES} from "../../cellMap/format";

// Trail points are kept to this many decimal places of a cell.
const POINT_PLACES = 2;

export class CellMapDraft {
  constructor(data) {
    this.data = data;
  }

  // An all-meadow (the theme's first terrain) map.
  static blank({theme = "glade", cols, rows, seed = 1}) {
    const fill = Object.keys(THEMES[theme].terrains)[0];
    return new CellMapDraft({version: 1, theme, grid: {type: THEMES[theme].grids[0], cols, rows}, seed, cells: Array.from({length: rows}, () => fill.repeat(cols)), trails: []});
  }

  get grid() {
    return this.data.grid;
  }

  get trails() {
    return this.data.trails ?? [];
  }

  with(fields) {
    return new CellMapDraft({...this.data, ...fields});
  }

  cellAt(col, row) {
    return this.data.cells[row]?.[col];
  }

  inside(col, row) {
    return col >= 0 && row >= 0 && col < this.grid.cols && row < this.grid.rows;
  }

  // ---- Cells ----

  // Sets every cell within brush - 1 steps of (col, row) to ch.
  paint(col, row, ch, brush = 1) {
    const reach = brush - 1;
    const changes = [];
    for (let c = col - reach; c <= col + reach; c++) {
      for (let r = row - reach - 1; r <= row + reach + 1; r++) {
        if (this.inside(c, r) && hexDistance([col, row], [c, r]) <= reach) changes.push([c, r]);
      }
    }
    return this.setCells(changes, ch);
  }

  // Sets the cell at (col, row), and every cell like it joined to it, to ch.
  fill(col, row, ch) {
    const from = this.cellAt(col, row);
    if (from === undefined || from === ch) return this;
    const seen = new Set([`${col},${row}`]);
    const queue = [[col, row]];
    for (let i = 0; i < queue.length; i++) {
      for (let edge = 0; edge < 6; edge++) {
        const [c, r] = neighbor(...queue[i], edge);
        const key = `${c},${r}`;
        if (seen.has(key) || this.cellAt(c, r) !== from) continue;
        seen.add(key);
        queue.push([c, r]);
      }
    }
    return this.setCells(queue, ch);
  }

  setCells(changes, ch) {
    const rows = new Map();
    for (const [c, r] of changes) {
      if (this.cellAt(c, r) === ch) continue;
      if (!rows.has(r)) rows.set(r, [...this.data.cells[r]]);
      rows.get(r)[c] = ch;
    }
    if (!rows.size) return this;
    return this.with({cells: this.data.cells.map((line, r) => (rows.has(r) ? rows.get(r).join("") : line))});
  }

  // Keeps the bottom-left corner in place: rows come and go at the top,
  // columns at the right. Map feet run up from the bottom-left, so walls,
  // units and connections stay over the same cells. New cells are the
  // theme's first terrain; trails move with their cells.
  resize({cols = this.grid.cols, rows = this.grid.rows}) {
    const fill = Object.keys(THEMES[this.data.theme].terrains)[0];
    const added = rows - this.grid.rows;
    const kept = added >= 0 ? this.data.cells : this.data.cells.slice(-added);
    const cells = [...Array.from({length: Math.max(0, added)}, () => ""), ...kept].map((line) => line.slice(0, cols).padEnd(cols, fill));
    const trails = this.trails.map((trail) => ({...trail, points: trail.points.map(([col, row]) => [col, row + added])}));
    return this.with({grid: {...this.grid, cols, rows}, cells, ...(this.data.trails ? {trails} : {})});
  }

  // ---- Look ----

  setSeed(seed) {
    return this.with({seed});
  }

  // null goes back to the theme's color.
  setColor(key, value) {
    const colors = {...this.data.colors};
    if (value) colors[key] = value;
    else delete colors[key];
    const {colors: _old, ...rest} = this.data;
    return new CellMapDraft(Object.keys(colors).length ? {...rest, colors} : rest);
  }

  // ---- Trails ----

  addTrail(points, width = 0.8) {
    return this.with({trails: [...this.trails, {width, points: points.map(roundPoint)}]});
  }

  removeTrail(index) {
    return this.with({trails: this.trails.filter((_, i) => i !== index)});
  }

  setTrailWidth(index, width) {
    return this.updateTrail(index, (trail) => ({...trail, width}));
  }

  insertTrailPoint(index, at, point) {
    return this.updateTrail(index, (trail) => ({...trail, points: [...trail.points.slice(0, at), roundPoint(point), ...trail.points.slice(at)]}));
  }

  moveTrailPoint(index, at, point) {
    return this.updateTrail(index, (trail) => ({...trail, points: trail.points.map((p, i) => (i === at ? roundPoint(point) : p))}));
  }

  // A trail left with one point goes too.
  removeTrailPoint(index, at) {
    const points = this.trails[index].points.filter((_, i) => i !== at);
    return points.length < 2 ? this.removeTrail(index) : this.updateTrail(index, (trail) => ({...trail, points}));
  }

  updateTrail(index, fn) {
    return this.with({trails: this.trails.map((trail, i) => (i === index ? fn(trail) : trail))});
  }
}

const roundPoint = (point) => point.map((n) => Number(n.toFixed(POINT_PLACES)));
