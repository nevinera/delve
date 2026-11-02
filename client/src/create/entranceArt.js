import * as THREE from "three";
import { THIN_ROOF_FT } from "../v2/caves.js";
import { hash2, hashString } from "../world/noise.js";
import { isEntrance } from "./caveLayout.js";

// The collar round each entrance's mouth (caveLayout.js's entrances): a band round the tube where
// it meets the hillside, hiding the ragged edge where the ground's cells are cut away. A natural
// entrance's is rough rock, thicker here and thinner there; a mine's is squared timber. Drawn
// over the ground, not from in the earth.

const STEP_FT = 0.5; // how finely the tube is searched along for where it meets the ground
const REACH_FT = 3; // how far along the tube the collar reaches, either side of that
const INSET_FT = 0.6; // how far into the tube it starts
const LOOKS = {
  natural: { rgb: [112, 104, 96], thick: 2.6, rough: 1.8, points: 28 },
  mine: { rgb: [104, 76, 48], thick: 1.2, rough: 0, points: 28 },
};

// Round a tube's cross-section from one side of its floor over to the other, as [across, up] ft
// from the middle of its floor, with the way out from the tube at each: a mine's square, a
// natural one's an arch as wide as it is tall, as caveLayout.js carves them.
function section(style, W, count) {
  return Array.from({ length: count + 1 }, (_, i) => {
    const t = i / count;
    if (style === "mine") {
      // Up the right side, across the top, down the left.
      const s = t * 3;
      if (s <= 1) return { at: [W / 2, s * W], out: [1, 0] };
      if (s <= 2) return { at: [W / 2 - (s - 1) * W, W], out: [0, 1] };
      return { at: [-W / 2, (3 - s) * W], out: [-1, 0] };
    }
    const a = t * Math.PI;
    const [x, y] = [(W / 2) * Math.cos(a), W * Math.sin(a)];
    const n = [Math.cos(a) / (W / 2), Math.sin(a) / W];
    const length = Math.hypot(...n);
    return { at: [x, y], out: [n[0] / length, n[1] / length] };
  });
}

// An entrance's collar as { positions, colors, indices }, continent feet, or null where its tube
// never meets the ground. groundAt(x, z): the ground's height.
export function collarMesh(entrance, groundAt) {
  const { mouth, at, yaw, width: W, style, id } = entrance;
  const look = LOOKS[style] ?? LOOKS.natural;
  const a = (yaw * Math.PI) / 180;
  const along = [Math.sin(a), 0, Math.cos(a)];
  const side = [Math.cos(a), 0, -Math.sin(a)];
  const length = Math.hypot(at[0] - mouth[0], at[2] - mouth[2]);
  const drop = (mouth[1] - at[1]) / (length || 1);
  const seed = hashString(id ?? "entrance");
  // Continent feet `d` along the tube, `across` and `up` from its floor's middle line.
  const point = (d, across, up) => [mouth[0] + along[0] * d + side[0] * across, mouth[1] - drop * d + up, mouth[2] + along[2] * d + side[2] * across];
  const ring = section(style, W, look.points);
  // How far in each point of the section has rock enough over it that the tube's carved shut.
  const cuts = ring.map(({ at: [x, y] }) => {
    for (let d = 0; d <= length; d += STEP_FT) {
      const p = point(d, x, y);
      if (p[1] < groundAt(p[0], p[2]) - THIN_ROOF_FT) return d;
    }
    return null;
  });
  if (cuts.every((d) => d === null)) return null;
  const positions = [];
  const colors = [];
  const indices = [];
  const vertex = (p, rgb) => {
    positions.push(...p);
    colors.push(...rgb);
    return positions.length / 3 - 1;
  };
  // Each point's four corners: in and out from the tube, toward the mouth and away.
  const corners = ring.map(({ at: [x, y], out: [ox, oy] }, i) => {
    const d = cuts[i] ?? cuts.find((c) => c !== null);
    const thick = look.thick + look.rough * hash2(i, 0, seed);
    const shade = 0.85 + 0.3 * hash2(i, 1, seed);
    const rgb = look.rgb.map((v) => Math.min(1, (v / 255) * shade));
    const [ix, iy] = [x - ox * INSET_FT, y - oy * INSET_FT];
    const [fx, fy] = [x + ox * thick, y + oy * thick];
    const reach = REACH_FT + (look.rough ? hash2(i, 2, seed) : 0);
    return [point(d - reach, ix, iy), point(d + reach, ix, iy), point(d + reach, fx, fy), point(d - reach, fx, fy)].map((p) => vertex(p, rgb));
  });
  // Faces between each point and the next, all round the band.
  for (let i = 1; i < corners.length; i++) {
    const [p, q] = [corners[i - 1], corners[i]];
    for (let k = 0; k < 4; k++) {
      const [a0, a1, b0, b1] = [p[k], p[(k + 1) % 4], q[k], q[(k + 1) % 4]];
      indices.push(a0, b0, b1, a0, b1, a1);
    }
  }
  return { positions, colors, indices };
}

// The collars of a layout's entrances, made again when the entrances change.
export class EntranceArt {
  constructor(scene, layout, groundAt) {
    Object.assign(this, { layout, groundAt });
    this.group = new THREE.Group();
    scene.add(this.group);
    this.material = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true, side: THREE.DoubleSide });
    this.made = null; // the entrances and the ground at their mouths, as they were made
  }

  // Each frame: hidden from in the earth.
  tick(inEarth) {
    this.group.visible = !inEarth;
    const entrances = [...this.layout.nodes.values()].filter(isEntrance);
    const key = JSON.stringify(entrances.map((e) => [e.id, e.mouth, e.yaw, e.length, e.slope, e.width, e.style, this.groundAt(e.mouth[0], e.mouth[2])]));
    if (key === this.made) return;
    this.made = key;
    for (const mesh of [...this.group.children]) {
      this.group.remove(mesh);
      mesh.geometry.dispose();
    }
    for (const entrance of entrances) {
      const data = collarMesh(entrance, this.groundAt);
      if (!data) continue;
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute("position", new THREE.Float32BufferAttribute(data.positions, 3));
      geometry.setAttribute("color", new THREE.Float32BufferAttribute(data.colors, 3));
      geometry.setIndex(data.indices);
      geometry.computeVertexNormals();
      this.group.add(new THREE.Mesh(geometry, this.material));
    }
  }
}
