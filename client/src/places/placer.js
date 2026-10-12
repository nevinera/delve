// The placer: applies places' population plans (their `population`
// annotations; see population.js and docs/population.md) to a map, adding
// units and NCUs. It only adds: units already in a place count toward its
// density, and running it again adds nothing new. Deterministic: the same
// map and plans place the same units. Pure.
import {STEP, placeGrid} from "./ground";
import {parsePopulation} from "./population";
import {hasLineOfSight} from "../game/collision";
import {CELL_SIZE, cellPoint} from "../cellMap/hexGrid";

// How far (feet) a unit or connection may be from a place's open ground and
// still count as in it (as zone-outline counts them).
const REACH = 7.5;
// Feet kept clear around a map's connections, so players don't arrive into
// a fight.
const CONNECTION_CLEARANCE = 20;
// Feet either side of a trail units keep off, outside dense places.
const TRAIL_MARGIN = 7.5;
// A boss takes up the room of this many encounters.
const BOSS_WEIGHT = 2;
// Feet from a group's first member to the rest.
const GROUP_SPREAD = 5;
const DEFAULT_TOKEN_RADIUS = 1.5;
const NCU_TOKEN_RADIUS = 2;

// {map, placed: [{place, units, ncus, notes}], errors}: map is a copy with
// the new units and NCUs. options: unitTypes ({key: {tokenRadius}}, the
// zone's), unitIds and ncuIds (Sets of identifiers already used in the zone;
// the new ones are added to them).
export function placeMap(map, {unitTypes = {}, unitIds = new Set(), ncuIds = new Set()} = {}) {
  const places = map.places ?? [];
  const errors = [];
  const placed = [];
  const plans = places.map((place) => {
    if (place.annotations?.population === undefined) return null;
    const {plan, errors: planErrors} = parsePopulation(place.annotations.population);
    const unknown = [...plan.mix, ...plan.bosses].map((m) => m.unitType).filter((t) => !(t in unitTypes));
    for (const error of planErrors) errors.push(`${map.identifier}/${place.identifier}: ${error}`);
    for (const type of new Set(unknown)) errors.push(`${map.identifier}/${place.identifier}: no unit type ${type} in the zone`);
    return planErrors.length || unknown.length ? null : plan;
  });
  if (!plans.some(Boolean) || !map.feetDimensions) return {map, placed, errors};

  const ground = groundOf(map);
  const units = [...(map.units ?? [])];
  const ncus = [...(map.ncus ?? [])];
  const groupIds = new Set(units.map((u) => u.groupIdentifier).filter(Boolean));
  // Where everything already stands, for spacing.
  const occupied = [...units, ...ncus].filter((u) => u.position).map((u) => ({x: u.position.x, y: u.position.y}));

  places.forEach((place, index) => {
    const plan = plans[index];
    if (!plan) return;
    const cells = ground.cellsOf(index);
    if (!cells.length) return;
    const rng = seeded(`${map.identifier}/${place.identifier}`);
    const here = units.filter((u) => u.position && ground.placeNear(u.position.x, u.position.y) === index);
    const notes = [];
    let encounters = new Set(here.map((u) => u.groupIdentifier || u.identifier)).size;
    const before = {units: units.length, ncus: ncus.length};
    const radiusOf = (type) => unitTypes[type]?.tokenRadius ?? DEFAULT_TOKEN_RADIUS;
    const spacing = Math.max(10, Math.min(40, Math.sqrt(1000 / Math.max(plan.density, 0.05)) * 0.75));
    const free = (x, y, gap) => occupied.every((p) => Math.hypot(p.x - x, p.y - y) >= gap) && ground.awayFromConnections(x, y);

    // Set pieces first, at the place's most open spots near its middle.
    const middle = centroid(cells, ground);
    const bestSpot = (radius, gap) => {
      let best = null;
      for (const cell of cells) {
        const clearance = ground.clearance[cell];
        if (clearance < radius + 2) continue;
        const [x, y] = ground.center(cell);
        if (!free(x, y, gap)) continue;
        const score = Math.min(clearance, 15) - Math.hypot(x - middle.x, y - middle.y) * 0.1;
        if (!best || score > best.score) best = {x, y, score, cell};
      }
      return best;
    };
    for (const boss of plan.bosses) {
      encounters += BOSS_WEIGHT - 1;
      if (here.some((u) => u.unitType === boss.unitType)) continue;
      const spot = bestSpot(radiusOf(boss.unitType), spacing / 2);
      if (!spot) {
        notes.push(`no room for boss ${boss.unitType}`);
        continue;
      }
      units.push(unit(map, place, boss.unitType, spot, plan.hostility, movementAt(boss.movement, spot, radiusOf(boss.unitType), ground, index, rng), null, unitIds, rng));
      occupied.push(spot);
      encounters += 1;
    }
    for (const spec of plan.ncus) {
      if (ncuIds.has(spec.identifier)) continue;
      const spot = bestSpot(NCU_TOKEN_RADIUS, 8);
      if (!spot) {
        notes.push(`no room for NCU ${spec.identifier}`);
        continue;
      }
      ncus.push(ncu(spec, spot, ground, index, rng));
      ncuIds.add(spec.identifier);
      occupied.push(spot);
    }

    // Then the mix, up to the density, off the trail unless it's dense.
    const target = Math.round((plan.density * cells.length * STEP * STEP) / 1000);
    const offTrail = plan.density < 1;
    const order = shuffle(cells, rng);
    const candidates = offTrail ? [...order.filter((c) => !ground.trail[c]), ...order.filter((c) => ground.trail[c])] : order;
    const needed = Math.max(0, target - encounters);
    let wanted = needed;
    for (const gap of [spacing, spacing * 0.6]) {
      for (const cell of candidates) {
        if (wanted <= 0) break;
        const [x, y] = jitter(ground.center(cell), rng);
        const first = pick(plan.mix, rng);
        const type = first.unitType;
        if (ground.clearance[cell] < radiusOf(type) + 1 || !ground.isIn(x, y, index) || !free(x, y, gap)) continue;
        const size = plan.groups[0] + Math.floor(rng() * (plan.groups[1] - plan.groups[0] + 1));
        const group = size > 1 ? groupId(map, place, groupIds) : null;
        const members = [{x, y}];
        for (let k = 1; k < size; k++) {
          const angle = (2 * Math.PI * k) / (size - 1) + rng() * 0.5;
          const spot = {x: x + Math.cos(angle) * GROUP_SPREAD, y: y + Math.sin(angle) * GROUP_SPREAD};
          if (ground.isIn(spot.x, spot.y, index) && ground.clearanceAt(spot.x, spot.y) >= DEFAULT_TOKEN_RADIUS + 1) members.push(spot);
        }
        members.forEach((spot, k) => {
          const member = k === 0 ? first : pick(plan.mix, rng);
          const movement = group ? groupMovement(plan.movement, spot, radiusOf(member.unitType), ground, index, rng) : movementAt(plan.movement, spot, radiusOf(member.unitType), ground, index, rng);
          units.push(unit(map, place, member.unitType, spot, member.hostility ?? plan.hostility, movement, group, unitIds, rng));
        });
        occupied.push({x, y});
        wanted--;
      }
    }
    if (wanted > 0) notes.push(`room for only ${needed - wanted} of the ${needed} encounters wanted`);
    placed.push({place: place.identifier, units: units.length - before.units, ncus: ncus.length - before.ncus, notes});
  });

  return {map: {...map, units, ncus}, placed, errors};
}

// ---- Ground ----

// The grid (see ground.js) with what placing needs: each cell's clearance
// (feet to the nearest filled ground or wall), trail cells, and the map's
// connections to keep clear of.
function groundOf(map) {
  const {cols, rows, label, center: centerOf} = placeGrid(map);
  const {height} = map.feetDimensions;
  const cellAt = (x, y) => {
    const [c, r] = [Math.floor(x / STEP), Math.floor(y / STEP)];
    return c >= 0 && r >= 0 && c < cols && r < rows ? r * cols + c : -1;
  };
  const center = (cell) => centerOf(cell % cols, Math.floor(cell / cols));

  // Clearance: breadth-first from filled cells and walls.
  const blocked = new Uint8Array(cols * rows);
  label.forEach((own, cell) => { if (own === -2) blocked[cell] = 1; });
  for (const barrier of map.barriers ?? []) {
    if (barrier.type === "wall") {
      const locs = barrier.locations ?? [];
      for (let i = 0; i + 1 < locs.length; i++) mark(locs[i], locs[i + 1], (x, y) => { const cell = cellAt(x, y); if (cell >= 0) blocked[cell] = 1; });
    } else if (barrier.type === "circle" && barrier.location) {
      const {x, y} = barrier.location;
      const reach = Math.ceil((barrier.radius ?? 0) / STEP);
      for (let r = -reach; r <= reach; r++) for (let c = -reach; c <= reach; c++) {
        const cell = cellAt(x + c * STEP, y + r * STEP);
        if (cell >= 0 && Math.hypot(c * STEP, r * STEP) <= (barrier.radius ?? 0)) blocked[cell] = 1;
      }
    }
  }
  const clearance = new Float32Array(cols * rows).fill(Infinity);
  const queue = [];
  blocked.forEach((b, cell) => { if (b) { clearance[cell] = 0; queue.push(cell); } });
  for (let i = 0; i < queue.length; i++) {
    const cell = queue[i];
    const [c, r] = [cell % cols, Math.floor(cell / cols)];
    for (const [dc, dr, d] of [[1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1], [1, 1, Math.SQRT2], [1, -1, Math.SQRT2], [-1, 1, Math.SQRT2], [-1, -1, Math.SQRT2]]) {
      const [nc, nr] = [c + dc, r + dr];
      if (nc < 0 || nr < 0 || nc >= cols || nr >= rows) continue;
      const next = nr * cols + nc;
      const value = clearance[cell] + d * STEP;
      if (value < clearance[next]) {
        clearance[next] = value;
        queue.push(next);
      }
    }
  }
  // The map's edge is filled ground too.
  for (let cell = 0; cell < cols * rows; cell++) {
    const [x, y] = center(cell);
    clearance[cell] = Math.min(clearance[cell], x, y, map.feetDimensions.width - x, height - y);
  }

  const trail = new Uint8Array(cols * rows);
  for (const {points} of map.cellMap?.trails ?? []) {
    for (let i = 0; i + 1 < points.length; i++) {
      const [a, b] = [points[i], points[i + 1]].map((p) => cellPoint(...p, CELL_SIZE)).map((p) => ({x: p.x, y: height - p.y}));
      mark(a, b, (x, y) => {
        const reach = Math.ceil(TRAIL_MARGIN / STEP);
        const [c0, r0] = [Math.floor(x / STEP), Math.floor(y / STEP)];
        for (let r = r0 - reach; r <= r0 + reach; r++) for (let c = c0 - reach; c <= c0 + reach; c++) {
          if (c >= 0 && r >= 0 && c < cols && r < rows && Math.hypot((c + 0.5) * STEP - x, (r + 0.5) * STEP - y) <= TRAIL_MARGIN) trail[r * cols + c] = 1;
        }
      });
    }
  }

  const connections = (map.connections ?? []).map((c) => (c.type === "line" && c.start && c.end ? {x: (c.start.x + c.end.x) / 2, y: (c.start.y + c.end.y) / 2} : c.location ?? c.position)).filter(Boolean);
  const walls = (map.barriers ?? []).map((b) => ({...b, blocksSight: true}));

  const placeNear = (x, y) => {
    let best = null;
    const reach = Math.ceil(REACH / STEP);
    const [c0, r0] = [Math.floor(x / STEP), Math.floor(y / STEP)];
    for (let r = r0 - reach; r <= r0 + reach; r++) for (let c = c0 - reach; c <= c0 + reach; c++) {
      if (c < 0 || r < 0 || c >= cols || r >= rows || label[r * cols + c] < 0) continue;
      const d = Math.hypot((c + 0.5) * STEP - x, (r + 0.5) * STEP - y);
      if (d <= REACH && (!best || d < best.d)) best = {d, place: label[r * cols + c]};
    }
    return best ? best.place : -1;
  };

  return {
    center,
    clearance,
    trail,
    walls,
    placeNear,
    cellsOf: (index) => label.reduce((out, own, cell) => (own === index ? (out.push(cell), out) : out), []),
    isIn: (x, y, index) => label[cellAt(x, y)] === index,
    clearanceAt: (x, y) => { const cell = cellAt(x, y); return cell < 0 || label[cell] < 0 ? 0 : clearance[cell]; },
    awayFromConnections: (x, y) => connections.every((p) => Math.hypot(p.x - x, p.y - y) >= CONNECTION_CLEARANCE),
  };
}

// Calls at(x, y) every half step along a to b.
function mark(a, b, at) {
  const steps = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / (STEP / 2)));
  for (let k = 0; k <= steps; k++) at(a.x + ((b.x - a.x) * k) / steps, a.y + ((b.y - a.y) * k) / steps);
}

function centroid(cells, ground) {
  let [sx, sy] = [0, 0];
  for (const cell of cells) {
    const [x, y] = ground.center(cell);
    sx += x;
    sy += y;
  }
  return {x: sx / cells.length, y: sy / cells.length};
}

// ---- Units ----

function unit(map, place, unitType, spot, hostility, movement, group, unitIds, rng) {
  let n = 1;
  const base = `${map.identifier}-${place.identifier}-${unitType}`;
  while (unitIds.has(`${base}-${n}`)) n++;
  const identifier = `${base}-${n}`;
  unitIds.add(identifier);
  return {
    identifier,
    unitType,
    position: {x: round(spot.x), y: round(spot.y), angle: Math.round(rng() * 360)},
    hostility,
    movement,
    ...(group ? {groupIdentifier: group} : {}),
  };
}

function ncu(spec, spot, ground, index, rng) {
  return {
    identifier: spec.identifier,
    name: spec.name,
    tokenImageUrl: spec.tokenImageUrl,
    tokenRadius: NCU_TOKEN_RADIUS,
    position: {x: round(spot.x), y: round(spot.y), angle: Math.round(rng() * 360)},
    movement: movementAt(spec.movement, spot, NCU_TOKEN_RADIUS, ground, index, rng),
    dialogue: {entry: [{node: "greeting"}], nodes: {greeting: {text: spec.greeting ?? `${spec.name} nods.`}}},
  };
}

function groupId(map, place, groupIds) {
  let n = 1;
  while (groupIds.has(`${map.identifier}-${place.identifier}-g${n}`)) n++;
  const id = `${map.identifier}-${place.identifier}-g${n}`;
  groupIds.add(id);
  return id;
}

// A unit's movement at spot, from the plan's: wandering no further than its
// clearance allows (still if that's too little), or patrolling to another
// spot in the place it can walk straight to (wandering if there's none).
function movementAt(movement, spot, radius, ground, index, rng) {
  if (movement.type === "patrol") {
    const to = patrolEnd(spot, radius, ground, index, rng);
    if (to) {
      return {
        type: "patrol", choose: "return",
        steps: [spot, to].map((p) => ({position: {x: round(p.x), y: round(p.y), angle: 0}, movementRate: 0.4, waitTime: [2, 5]})),
      };
    }
    movement = {type: "wander", radius: 10};
  }
  if (movement.type === "wander") {
    const room = Math.min(movement.radius, ground.clearanceAt(spot.x, spot.y) - radius - 1);
    if (room >= 2) return {type: "wander", location: {x: round(spot.x), y: round(spot.y)}, radius: round(room), speed: [0.2, 0.4], waitTime: [2, 6]};
  }
  return {type: "still"};
}

// A group's members wander a little, so the group stays together.
function groupMovement(movement, spot, radius, ground, index, rng) {
  if (movement.type === "still") return movement;
  return movementAt({type: "wander", radius: Math.min(4, movement.radius ?? 4)}, spot, radius, ground, index, rng);
}

function patrolEnd(from, radius, ground, index, rng) {
  for (let tries = 0; tries < 40; tries++) {
    const angle = rng() * 2 * Math.PI;
    const length = 20 + rng() * 25;
    const to = {x: from.x + Math.cos(angle) * length, y: from.y + Math.sin(angle) * length};
    if (!ground.isIn(to.x, to.y, index) || !hasLineOfSight(from.x, from.y, to.x, to.y, ground.walls)) continue;
    let clear = true;
    mark(from, to, (x, y) => { if (ground.clearanceAt(x, y) < radius + 0.5) clear = false; });
    if (clear) return to;
  }
  return null;
}

// ---- Randomness ----

function seeded(text) {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  let a = h >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffle(list, rng) {
  const out = [...list];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

function pick(mix, rng) {
  const total = mix.reduce((sum, m) => sum + m.weight, 0);
  let roll = rng() * total;
  for (const m of mix) {
    roll -= m.weight;
    if (roll < 0) return m;
  }
  return mix[mix.length - 1];
}

function jitter([x, y], rng) {
  return [x + (rng() - 0.5) * STEP * 0.8, y + (rng() - 0.5) * STEP * 0.8];
}

const round = (n) => Math.round(n * 100) / 100;
