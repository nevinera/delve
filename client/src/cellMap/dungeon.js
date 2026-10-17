// The dungeon look: square cells drawn as flagstone rooms and corridors in
// rock, with straight inked walls. A scene (pure data, in feet, so it's
// testable and the same map always builds the same one) and a painter,
// instead of the woodland renderer's (scene.js, paint.js). Cell terrains
// are floor ("meadow"), rubble ("tallGrass"), puddles ("marsh"), water and
// wall ("trees").
import {CELL_SIZE, gridOf} from "./grid";
import {hash01} from "./random";
import {terrainAt} from "./format";
import {regionLoops} from "./regions";
import {bridgeDeck} from "./bridges";
import {paintBridges} from "./paint";

const WALL_INK = 0.45; // feet
const SHADOW_WIDTH = 1.4; // feet, each side of the wall's line
const GROUT_INK = 0.08;
const STONES_PER_CELL = 4;
const HATCHES_PER_EDGE = 3;

const grid = gridOf("square");

// Looks the dungeon renderer's themes vary on (style.dungeon): "flagstone"
// or "planks" floors, rock hatching, rubble stones, puddles on the "marsh"
// cells, and the chance a floor cell has a patch of moss.
const DEFAULT_LOOK = {floor: "flagstone", hatch: true, rubble: true, puddles: true, moss: 0};

export function buildDungeonScene(map, look = {}) {
  const options = {...DEFAULT_LOOK, ...look};
  const {seed} = map;
  const cs = CELL_SIZE;
  const {cols, rows} = map.grid;
  const size = grid.mapSize(map.grid, cs);
  const at = (c, r) => terrainAt(map, c, r);
  const scene = {...size, cellSize: cs, cells: {meadow: [], tallGrass: [], marsh: [], water: []}, stones: [], puddles: [], ripples: [], hatches: [], planks: [], moss: [], walls: [], water: [], trails: [], bridges: []};

  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const terrain = at(col, row);
      const h = (salt) => hash01(seed, col, row, salt);
      const {x, y} = grid.cellCenter(col, row, cs);
      if (terrain === "trees") {
        if (options.hatch) scene.hatches.push(...hatchesFor(map, col, row, h, cs));
        continue;
      }
      scene.cells[terrain].push({x: x - cs / 2, y: y - cs / 2});
      if (options.floor === "planks" && terrain !== "water") scene.planks.push(...plankSeams(x - cs / 2, y - cs / 2, cs, h));
      if (options.moss && terrain !== "water" && h(120) < options.moss) {
        scene.moss.push({x: x + (h(121) - 0.5) * 0.6 * cs, y: y + (h(122) - 0.5) * 0.6 * cs, rx: cs * (0.15 + 0.2 * h(123)), ry: cs * (0.12 + 0.15 * h(124)), turn: h(125) * Math.PI});
      }
      if (terrain === "tallGrass" && options.rubble) {
        for (let i = 0; i < STONES_PER_CELL; i++) {
          scene.stones.push({x: x + (h(10 + i * 5) - 0.5) * 0.85 * cs, y: y + (h(11 + i * 5) - 0.5) * 0.85 * cs, radius: cs * (0.07 + 0.09 * h(12 + i * 5)), turn: h(13 + i * 5) * Math.PI, sides: 5 + Math.floor(h(14 + i * 5) * 3)});
        }
      } else if (terrain === "marsh" && options.puddles) {
        const count = 1 + Math.floor(h(40) * 2);
        for (let i = 0; i < count; i++) {
          scene.puddles.push({x: x + (h(41 + i * 4) - 0.5) * 0.6 * cs, y: y + (h(42 + i * 4) - 0.5) * 0.6 * cs, rx: cs * (0.18 + 0.17 * h(43 + i * 4)), ry: cs * (0.12 + 0.12 * h(44 + i * 4))});
        }
      } else if (terrain === "water" && h(60) < 0.6) {
        scene.ripples.push({x: x + (h(61) - 0.5) * 0.5 * cs, y: y + (h(62) - 0.5) * 0.5 * cs, length: cs * (0.3 + 0.2 * h(63))});
      }
    }
  }

  const feet = (loop) => loop.map((p) => grid.latticeFeet(p, cs));
  // Walls are the outline of everything that isn't rock.
  scene.walls = regionLoops(map, "open", undefined, (c, r) => (at(c, r) === "trees" ? "rock" : "open")).map(feet);
  scene.water = regionLoops(map, "water").map(feet);
  scene.trails = (map.trails ?? []).map(({width, points}) => ({width: width * cs, points: points.map(([c, r]) => grid.cellPoint(c, r, cs))}));
  scene.bridges = (map.bridges ?? []).map((b) => bridgeDeck(b, "square"));
  return scene;
}

// The seams of a cell's floorboards: a board a foot wide per row, with a
// butt joint at a different place along each.
function plankSeams(left, top, cs, h) {
  const out = [];
  const boards = Math.round(cs);
  for (let i = 0; i < boards; i++) {
    const y = top + (i * cs) / boards;
    if (i > 0) out.push({x1: left, y1: y, x2: left + cs, y2: y});
    const x = left + cs * (0.15 + 0.7 * h(130 + i));
    out.push({x1: x, y1: y, x2: x, y2: y + cs / boards});
  }
  return out;
}

// Short diagonal strokes in a rock cell, along each edge it shares with open
// ground: the hatching that shades a wall's far side.
function hatchesFor(map, col, row, h, cs) {
  const out = [];
  for (let edge = 0; edge < grid.edges; edge++) {
    const [nc, nr] = grid.neighbor(col, row, edge);
    if (terrainAt(map, nc, nr) === "trees") continue;
    const [dx, dy] = [nc - col, nr - row];
    for (let i = 0; i < HATCHES_PER_EDGE; i++) {
      const along = (i + 0.3 + 0.4 * h(80 + edge * 8 + i)) / HATCHES_PER_EDGE - 0.5;
      const depth = 0.12 + 0.3 * h(90 + edge * 8 + i);
      const x = (col + 0.5 + dx * (0.5 - depth) - dy * along) * cs;
      const y = (row + 0.5 + dy * (0.5 - depth) + dx * along) * cs;
      const len = cs * (0.18 + 0.12 * h(100 + edge * 8 + i));
      out.push({x1: x - len * 0.5, y1: y - len * 0.5, x2: x + len * 0.5, y2: y + len * 0.5});
    }
  }
  return out;
}

function loopPath(ctx, loops) {
  ctx.beginPath();
  for (const loop of loops) {
    loop.forEach(({x, y}, i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
    ctx.closePath();
  }
}

export function paintDungeon(ctx, scene, pixelsPerFoot, style) {
  const {palette} = style;
  const cs = scene.cellSize;
  ctx.save();
  ctx.setTransform(pixelsPerFoot, 0, 0, pixelsPerFoot, 0, 0);
  ctx.beginPath();
  ctx.rect(0, 0, scene.width, scene.height);
  ctx.clip();
  ctx.lineJoin = "round";
  ctx.lineCap = "round";

  ctx.fillStyle = palette.forest;
  ctx.fillRect(0, 0, scene.width, scene.height);

  // Rock's hatching, under the floor's edge.
  ctx.strokeStyle = palette.ink;
  ctx.lineWidth = 0.12;
  ctx.globalAlpha = 0.55;
  ctx.beginPath();
  for (const {x1, y1, x2, y2} of scene.hatches) {
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
  }
  ctx.stroke();
  ctx.globalAlpha = 1;

  ctx.save();
  loopPath(ctx, scene.walls);
  ctx.clip("evenodd");
  ctx.fillStyle = palette.meadow;
  ctx.fillRect(0, 0, scene.width, scene.height);
  for (const terrain of ["tallGrass", "marsh"]) {
    ctx.fillStyle = palette[terrain];
    ctx.beginPath();
    for (const {x, y} of scene.cells[terrain]) ctx.rect(x, y, cs, cs);
    ctx.fill();
  }
  paintTrails(ctx, scene.trails, palette);

  ctx.strokeStyle = palette.grout;
  ctx.lineWidth = GROUT_INK;
  ctx.beginPath();
  if (scene.planks.length) {
    for (const {x1, y1, x2, y2} of scene.planks) {
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
    }
  } else {
    for (const terrain of ["meadow", "tallGrass", "marsh"]) {
      for (const {x, y} of scene.cells[terrain]) ctx.rect(x, y, cs, cs);
    }
  }
  ctx.stroke();

  if (scene.moss.length) {
    ctx.fillStyle = palette.moss;
    ctx.globalAlpha = 0.45;
    ctx.beginPath();
    for (const {x, y, rx, ry, turn} of scene.moss) {
      ctx.moveTo(x + rx, y);
      ctx.ellipse(x, y, rx, ry, turn, 0, Math.PI * 2);
    }
    ctx.fill();
    ctx.globalAlpha = 1;
  }

  paintWater(ctx, scene, palette);
  paintStones(ctx, scene, palette);

  // The wall's shadow falls on the floor beside it.
  ctx.strokeStyle = palette.shadow;
  ctx.lineWidth = SHADOW_WIDTH * 2;
  loopPath(ctx, scene.walls);
  ctx.stroke();
  ctx.restore();

  ctx.strokeStyle = palette.ink;
  ctx.lineWidth = WALL_INK;
  loopPath(ctx, scene.walls);
  ctx.stroke();

  paintBridges(ctx, scene.bridges, {...style, shadowOffset: {x: 0.3, y: 0.45}, tuftInk: 0.1, crownInk: 0.16}, cs);
  ctx.restore();
}

function paintTrails(ctx, trails, palette) {
  ctx.strokeStyle = palette.worn;
  ctx.globalAlpha = 0.5;
  for (const {width, points} of trails) {
    ctx.lineWidth = width;
    ctx.beginPath();
    points.forEach(({x, y}, i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
}

function paintWater(ctx, scene, palette) {
  loopPath(ctx, scene.water);
  ctx.fillStyle = palette.water;
  ctx.fill("evenodd");
  ctx.strokeStyle = palette.waterRim;
  ctx.lineWidth = 0.35;
  ctx.stroke();
  ctx.strokeStyle = palette.waterRim;
  ctx.lineWidth = 0.1;
  ctx.beginPath();
  for (const {x, y, length} of scene.ripples) {
    ctx.moveTo(x - length / 2, y);
    ctx.quadraticCurveTo(x - length / 4, y - 0.4, x, y);
    ctx.quadraticCurveTo(x + length / 4, y + 0.4, x + length / 2, y);
  }
  ctx.stroke();
  ctx.fillStyle = palette.water;
  ctx.globalAlpha = 0.5;
  ctx.beginPath();
  for (const {x, y, rx, ry} of scene.puddles) {
    ctx.moveTo(x + rx, y);
    ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
  }
  ctx.fill();
  ctx.globalAlpha = 1;
}

function paintStones(ctx, scene, palette) {
  ctx.fillStyle = palette.stone;
  ctx.strokeStyle = palette.ink;
  ctx.lineWidth = 0.08;
  for (const {x, y, radius, turn, sides} of scene.stones) {
    ctx.beginPath();
    for (let i = 0; i < sides; i++) {
      const a = turn + (i * Math.PI * 2) / sides;
      ctx.lineTo(x + Math.cos(a) * radius, y + Math.sin(a) * radius);
    }
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  }
}
