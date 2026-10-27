import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { paletteColors } from "../world/builtObjects.js";
import { CELL_FT, COMPONENTS, FLOOR_FT, parseCell, roofHeight } from "../world/structures.js";
import { builtMaterial, tileTexture, tiledMaterial } from "./builtMeshes.js";

// Structures (world/structures.js) as meshes: floors as slabs under their level's height, walls as
// slabs along cell edges with their doors and windows left open, the foundation below the ground
// floor, and the components. Each storey is its own mesh, so the builder can fade the ones above
// the storey it's working on. Positions are feet from the anchor, y up from the base.

const OPENING_FT = 3; // how wide doors and windows are
const STEP_FT = 0.75; // about how tall a stair's steps are
const RAIL = { heightFt: 3, thicknessFt: 0.3, postFt: 0.35 };
const POST_FT = { posts: 0.6, stilts: 0.35 };
const ROOF_FT = 0.4; // how thick roofs are
const DIRECTIONS = [
  [0, -1],
  [1, 0],
  [0, 1],
  [-1, 0],
];

// An axis-aligned box from `min` to `max`, colored.
function box(min, max, color) {
  const size = max.map((v, i) => v - min[i]);
  const g = new THREE.BoxGeometry(...size).translate(...min.map((v, i) => v + size[i] / 2));
  return colored(g, color);
}

// Every part is unindexed, so roofs (built from triangles) merge with boxes.
function colored(geometry, color) {
  const g = geometry.index ? geometry.toNonIndexed() : geometry;
  g.deleteAttribute("uv");
  const rgb = new Float32Array(g.attributes.position.count * 3);
  for (let i = 0; i < rgb.length; i += 3) rgb.set([color.r, color.g, color.b], i);
  g.setAttribute("color", new THREE.BufferAttribute(rgb, 3));
  return g;
}

// A wall along an edge, from `bottom` to `top`, with its opening left out.
function wall(key, edge, thickness, bottom, top, height, color) {
  const [x, z, side] = key.split(",");
  const half = (CELL_FT + thickness) / 2;
  const o = OPENING_FT / 2;
  // Spans along the wall (from its middle) and up, each a slab.
  const spans = [];
  if (edge.opening) {
    spans.push([-half, -o, bottom, top], [o, half, bottom, top], [-o, o, bottom, height + edge.sill], [-o, o, height + edge.top, top]);
  } else spans.push([-half, half, bottom, top]);
  const [mx, mz] = side === "n" ? [(Number(x) + 0.5) * CELL_FT, Number(z) * CELL_FT] : [Number(x) * CELL_FT, (Number(z) + 0.5) * CELL_FT];
  const t = thickness / 2;
  return spans
    .filter(([a, b, lo, hi]) => b - a > 1e-3 && hi - lo > 1e-3)
    .map(([a, b, lo, hi]) => (side === "n" ? box([mx + a, lo, mz - t], [mx + b, hi, mz + t], color) : box([mx - t, lo, mz + a], [mx + t, hi, mz + b], color)));
}

// A flight's geometry: solid steps, or a solid slope for a ramp.
function flight(c, structure, color) {
  const height = c.level * structure.storeyFt;
  const rise = c.rise ?? structure.storeyFt;
  const run = c.run * CELL_FT;
  const across = (c.width ?? 1) * CELL_FT;
  const parts = [];
  if (c.type === "ramp") {
    const g = box([0, height - FLOOR_FT, 0], [run, height + rise, across], color);
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) if (p.getY(i) > height) p.setY(i, height + (rise * p.getX(i)) / run);
    parts.push(g);
  } else {
    const steps = Math.max(1, Math.round(rise / STEP_FT));
    for (let k = 0; k < steps; k++) parts.push(box([(k * run) / steps, height - FLOOR_FT, 0], [((k + 1) * run) / steps, height + ((k + 1) * rise) / steps, across], color));
  }
  // From the flight's own frame (x up the run, z to its right) into the structure's.
  const [fx, fz] = DIRECTIONS[c.facing];
  const [rx, rz] = DIRECTIONS[(c.facing + 1) % 4];
  const ox = (c.at[0] + 0.5) * CELL_FT - (fx + rx) * (CELL_FT / 2);
  const oz = (c.at[1] + 0.5) * CELL_FT - (fz + rz) * (CELL_FT / 2);
  const m = new THREE.Matrix4().set(fx, 0, rx, ox, 0, 1, 0, 0, fz, 0, rz, oz, 0, 0, 0, 1);
  return parts.map((g) => g.applyMatrix4(m));
}

// A railing's rails along its edges, with a post at each end.
function railing(c, structure, color) {
  const height = c.level * structure.storeyFt;
  const parts = [];
  for (const key of c.edges) {
    const [x, z, side] = key.split(",").map((v, i) => (i < 2 ? Number(v) : v));
    const [a, b] = side === "n" ? [[x, z], [x + 1, z]] : [[x, z], [x, z + 1]];
    const [ax, az, bx, bz] = [...a, ...b].map((v) => v * CELL_FT);
    const t = RAIL.thicknessFt / 2;
    parts.push(box([Math.min(ax, bx) - t, height + RAIL.heightFt - 0.25, Math.min(az, bz) - t], [Math.max(ax, bx) + t, height + RAIL.heightFt, Math.max(az, bz) + t], color));
    const p = RAIL.postFt / 2;
    for (const [px, pz] of [
      [ax, az],
      [bx, bz],
    ]) {
      parts.push(box([px - p, height, pz - p], [px + p, height + RAIL.heightFt, pz + p], color));
    }
  }
  return parts;
}

// A span's deck, and its railings.
function span(c, structure, color) {
  const deck = flight({ ...c, type: "ramp", rise: 0 }, structure, color);
  const edges = Object.keys(COMPONENTS.span.walk(c, structure).edges);
  return [...deck, ...railing({ ...c, edges }, structure, color)];
}

// Triangles as a colored geometry: [[a, b, c], ...] of [x, y, z] points.
function triangles(list, color) {
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(list.flat(2), 3));
  g.computeVertexNormals();
  return colored(g, color);
}

// A roof: its top over its cells and overhang, a slab ROOF_FT thick, and the walls filling up
// from its storey's top to its slopes along its cells' sides (a gable's ends, a lean-to's high
// side).
function roof(c, structure, color, endColor, endThickness) {
  const height = roofHeight(c, structure);
  const o = c.overhangFt;
  const [x0, z0] = c.at.map((v) => v * CELL_FT);
  const [x1, z1] = [x0 + c.size[0] * CELL_FT, z0 + c.size[1] * CELL_FT];
  const [w, d] = [x1 - x0, z1 - z0];
  // Where the slopes change: the ridge, and a hip's corners.
  const xs = [x0 - o, x1 + o];
  const zs = [z0 - o, z1 + o];
  if (c.shape === "gable") (c.ridge === "z" ? xs : zs).push(c.ridge === "z" ? (x0 + x1) / 2 : (z0 + z1) / 2);
  if (c.shape === "hip") {
    if (w >= d) xs.push(x0 + d / 2, x1 - d / 2), zs.push((z0 + z1) / 2);
    else zs.push(z0 + w / 2, z1 - w / 2), xs.push((x0 + x1) / 2);
  }
  const sorted = (list) => [...new Set(list.map((v) => Math.round(v * 1000) / 1000))].sort((a, b) => a - b);
  const [gx, gz] = [sorted(xs), sorted(zs)];
  const top = (x, z, drop = 0) => [x, height(x, z) - drop, z];
  const faces = [];
  for (let i = 0; i + 1 < gx.length; i++) {
    for (let j = 0; j + 1 < gz.length; j++) {
      const [xa, xb, za, zb] = [gx[i], gx[i + 1], gz[j], gz[j + 1]];
      // Split along whichever diagonal the roof bends along, so each triangle lies in one slope.
      const middle = height((xa + xb) / 2, (za + zb) / 2);
      const across = Math.abs((height(xa, za) + height(xb, zb)) / 2 - middle) < 1e-6;
      const quad = across
        ? [
            [[xa, za], [xa, zb], [xb, zb]],
            [[xa, za], [xb, zb], [xb, za]],
          ]
        : [
            [[xa, za], [xa, zb], [xb, za]],
            [[xa, zb], [xb, zb], [xb, za]],
          ];
      for (const tri of quad) {
        faces.push(tri.map(([x, z]) => top(x, z)));
        faces.push([...tri].reverse().map(([x, z]) => top(x, z, ROOF_FT)));
      }
    }
  }
  // Its edges, top to bottom, facing out.
  const ring = [...gx.map((x) => [x, gz[0]]), ...gz.slice(1).map((z) => [gx.at(-1), z]), ...[...gx].reverse().slice(1).map((x) => [x, gz.at(-1)]), ...[...gz].reverse().slice(1).map((z) => [gx[0], z])];
  for (let k = 0; k + 1 < ring.length; k++) {
    const [[ax, az], [bx, bz]] = [ring[k], ring[k + 1]];
    faces.push([top(ax, az), top(bx, bz, ROOF_FT), top(bx, bz)], [top(ax, az), top(ax, az, ROOF_FT), top(bx, bz, ROOF_FT)]);
  }
  const parts = [triangles(faces, color)];
  // The walls up to the slopes, along each side of its cells, a slab per stretch between breaks.
  const base = (c.level + 1) * structure.storeyFt;
  const t = endThickness / 2;
  const sides = [
    [gx.filter((x) => x >= x0 && x <= x1), (x) => [x, z0], "x"],
    [gx.filter((x) => x >= x0 && x <= x1), (x) => [x, z1], "x"],
    [gz.filter((z) => z >= z0 && z <= z1), (z) => [x0, z], "z"],
    [gz.filter((z) => z >= z0 && z <= z1), (z) => [x1, z], "z"],
  ];
  for (const [stops, at, axis] of sides) {
    for (let k = 0; k + 1 < stops.length; k++) {
      const [[ax, az], [bx, bz]] = [at(stops[k]), at(stops[k + 1])];
      const [ha, hb] = [height(ax, az), height(bx, bz)];
      if (Math.max(ha, hb) - base < 0.01) continue;
      const slab = axis === "x" ? box([ax, base - FLOOR_FT, az - t], [bx, Math.max(ha, hb), az + t], endColor) : box([ax - t, base - FLOOR_FT, az], [ax + t, Math.max(ha, hb), bz], endColor);
      const p = slab.attributes.position;
      for (let i = 0; i < p.count; i++) {
        if (p.getY(i) <= base) continue;
        const along = axis === "x" ? (p.getX(i) - ax) / (bx - ax) : (p.getZ(i) - az) / (bz - az);
        p.setY(i, ha + (hb - ha) * along - ROOF_FT / 2);
      }
      parts.push(slab);
    }
  }
  return parts;
}

const DRAW = { stairs: flight, ramp: flight, railing, span };

// The foundation under the ground floor, reaching `depthFt` below the base.
function foundation(structure, cells, depthFt, color) {
  const { kind } = structure.foundation;
  const top = -FLOOR_FT;
  if (kind === "plinth") return cells.map(([x, z]) => box([x * CELL_FT, -depthFt, z * CELL_FT], [(x + 1) * CELL_FT, top, (z + 1) * CELL_FT], color));
  const corners = new Set(cells.flatMap(([x, z]) => [`${x},${z}`, `${x + 1},${z}`, `${x},${z + 1}`, `${x + 1},${z + 1}`]));
  const p = POST_FT[kind] / 2;
  return [...corners].map((key) => {
    const [x, z] = parseCell(key).map((v) => v * CELL_FT);
    return box([x - p, -depthFt, z - p], [x + p, top, z + p], color);
  });
}

// Which way a wall's inside faces: toward the side with floor, both ways between two floored
// cells, or neither (null) with floor on neither side.
function insideOf(key, floor) {
  const [x, z, side] = key.split(",");
  const [a, b] = side === "n" ? [`${x},${Number(z) - 1}`, `${x},${z}`] : [`${Number(x) - 1},${z}`, `${x},${z}`];
  const [hasA, hasB] = [floor.has(a), floor.has(b)];
  if (hasA && hasB) return "both";
  if (!hasA && !hasB) return null;
  const toward = hasB ? 1 : -1;
  return side === "n" ? new THREE.Vector3(0, 0, toward) : new THREE.Vector3(toward, 0, 0);
}

// A tiled image's overlay over parts: each triangle mapped in feet over the two axes it faces
// least along, a copy every `every` feet, with its jitter. parts: [{ g, tile }].
function overlay(parts) {
  const positions = [];
  const uvs = [];
  const jitters = [];
  const [a, b, c] = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];
  for (const { g, tile } of parts) {
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i += 3) {
      a.fromBufferAttribute(p, i);
      b.fromBufferAttribute(p, i + 1);
      c.fromBufferAttribute(p, i + 2);
      const n = b.clone().sub(a).cross(c.clone().sub(a)).normalize();
      const [ax, ay, az] = [Math.abs(n.x), Math.abs(n.y), Math.abs(n.z)];
      const flat = ax >= ay && ax >= az ? (q) => [q.z, q.y] : ay >= az ? (q) => [q.x, q.z] : (q) => [q.x, q.y];
      for (const q of [a, b, c]) {
        positions.push(q.x, q.y, q.z);
        uvs.push(...flat(q).map((v) => v / tile.every));
        jitters.push(tile.jitter ?? 0);
      }
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setAttribute("jitter", new THREE.Float32BufferAttribute(jitters, 1));
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  return geometry;
}

// Splits a part's triangles by which of its material's tiles they wear: a wall's inside faces
// wear `inside` if the material has one. Returns [{ g, tile }].
function tiled(part, material) {
  const { g, inside } = part;
  if (!material?.tile && !material?.inside) return [];
  const insideTile = material.inside ?? material.tile;
  if (!inside || insideTile === material.tile) return material.tile ? [{ g, tile: material.tile }] : [];
  const p = g.attributes.position;
  const lists = { out: [], in: [] };
  const [a, b, c] = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];
  for (let i = 0; i < p.count; i += 3) {
    a.fromBufferAttribute(p, i);
    b.fromBufferAttribute(p, i + 1);
    c.fromBufferAttribute(p, i + 2);
    const n = b.clone().sub(a).cross(c.clone().sub(a)).normalize();
    const facesIn = inside === "both" ? Math.abs(n.y) < 0.5 : n.dot(inside) > 0.5;
    lists[facesIn ? "in" : "out"].push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z);
  }
  return [
    [lists.out, material.tile],
    [lists.in, insideTile],
  ]
    .filter(([list, tile]) => list.length && tile)
    .map(([list, tile]) => {
      const part = new THREE.BufferGeometry();
      part.setAttribute("position", new THREE.Float32BufferAttribute(list, 3));
      return { g: part, tile };
    });
}

// The structure's geometry by storey: Map of level -> { base, overlays }: base (position, normal,
// color) with `params` overriding its parameter colors, and overlays [{ image, geometry }] for its
// materials' tiled images, found by `imageOf(id)`. The foundation reaches `depthFt` under level 0.
export function structureGeometries(structure, { params, depthFt = 2, imageOf = () => undefined } = {}) {
  const colors = paletteColors(structure, params).map((hex) => new THREE.Color(hex));
  const colorOf = (name) => colors[structure.materials[name]?.color] ?? new THREE.Color(0xff00ff);
  const out = new Map();
  for (const storey of structure.storeys) {
    const height = storey.level * structure.storeyFt;
    const cells = storey.floor.map(parseCell);
    const floor = new Set(storey.floor);
    const parts = []; // { g, material, inside }
    const add = (list, material, inside = null) => parts.push(...list.map((g) => ({ g, material, inside })));
    add(
      cells.map(([x, z]) => box([x * CELL_FT, height - FLOOR_FT, z * CELL_FT], [(x + 1) * CELL_FT, height, (z + 1) * CELL_FT], colorOf(structure.floor))),
      structure.floor,
    );
    for (const [key, edge] of Object.entries(storey.edges)) {
      const material = structure.materials[edge.material];
      if (material) add(wall(key, edge, material.thicknessFt, height - FLOOR_FT, height + structure.storeyFt, height, colorOf(edge.material)), edge.material, insideOf(key, floor));
    }
    for (const c of structure.components) {
      if (c.level !== storey.level) continue;
      const made = c.material ?? structure.floor;
      if (c.type === "roof") {
        const ends = c.ends ?? Object.values(storey.edges)[0]?.material ?? structure.floor;
        const [slopes, ...walls] = roof(c, structure, colorOf(made), colorOf(ends), structure.materials[ends]?.thicknessFt ?? 1);
        add([slopes], made);
        add(walls, ends);
      } else if (DRAW[c.type]) add(DRAW[c.type](c, structure, colorOf(made)), made);
    }
    if (storey.level === 0 && cells.length) add(foundation(structure, cells, depthFt, colorOf(structure.foundation.material)), structure.foundation.material);
    if (!parts.length) continue;
    const base = mergeGeometries(parts.map((p) => p.g));
    base.computeBoundingSphere();
    // The overlays, one per image.
    const byImage = new Map(); // image -> [{ g, tile }]
    for (const part of parts) {
      for (const piece of tiled(part, structure.materials[part.material])) {
        const image = imageOf(piece.tile.image);
        if (!image) continue;
        if (!byImage.has(image)) byImage.set(image, []);
        byImage.get(image).push(piece);
      }
    }
    out.set(storey.level, { base, overlays: [...byImage].map(([image, list]) => ({ image, geometry: overlay(list) })) });
  }
  return out;
}

// The structure as a group with a group per storey (userData.level) of meshes, each with its own
// material: the storey, and its tiled images over it.
export function structureGroup(structure, options = {}) {
  const group = new THREE.Group();
  const colors = paletteColors(structure, options.params);
  for (const [level, { base, overlays }] of structureGeometries(structure, options)) {
    const storey = new THREE.Group();
    storey.userData.level = level;
    storey.add(new THREE.Mesh(base, builtMaterial()));
    for (const { image, geometry } of overlays) storey.add(new THREE.Mesh(geometry, tiledMaterial(tileTexture(image, colors))));
    group.add(storey);
  }
  return group;
}

export function disposeStructureGroup(group) {
  group.traverse((mesh) => {
    if (!mesh.isMesh) return;
    mesh.geometry.dispose();
    mesh.material.map?.dispose();
    mesh.material.dispose();
  });
}
