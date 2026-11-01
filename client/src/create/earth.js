import * as THREE from "three";

// What's drawn in the earth, while the builder's in its rock: the points of the planning grid
// round the camera, three grids of them, fading with distance, the two coarser joined by faint
// white lines; none of it over the ground.

// Each grid: a point every `every` ft, seen out to `out` ft, `px` across, and `lines` whether its
// points are joined.
const GRIDS = [
  { every: 128, out: 1024, px: 4, rgb: [0.35, 0.5, 0.75], lines: true },
  { every: 32, out: 256, px: 3, rgb: [0.3, 0.42, 0.62], lines: true },
  { every: 8, out: 64, px: 2, rgb: [0.26, 0.36, 0.52], lines: false },
];
const LINE_RGB = [0.08, 0.08, 0.08];

export class Earth {
  // groundAt(x, z): the ground's height.
  constructor(scene, groundAt) {
    this.groundAt = groundAt;
    this.group = new THREE.Group();
    this.group.visible = false;
    scene.add(this.group);
    this.made = null; // the 8 ft cube the grids were made round
    this.grids = GRIDS.map(({ px }) => {
      const material = new THREE.PointsMaterial({ size: px, sizeAttenuation: false, vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false });
      const points = new THREE.Points(new THREE.BufferGeometry(), material);
      points.frustumCulled = false;
      this.group.add(points);
      return points;
    });
    const lineMaterial = new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false });
    this.lines = GRIDS.map(({ lines }) => {
      if (!lines) return null;
      const segments = new THREE.LineSegments(new THREE.BufferGeometry(), lineMaterial);
      segments.frustumCulled = false;
      this.group.add(segments);
      return segments;
    });
  }

  // Each frame: shown while the builder's in the earth, round the camera.
  tick(camera, shown) {
    this.group.visible = shown;
    if (!shown) return;
    const c = camera.position;
    const cube = [c.x, c.y, c.z].map((v) => Math.floor(v / 8)).join(",");
    if (cube !== this.made) this.make(c, cube);
  }

  make(c, cube) {
    this.made = cube;
    GRIDS.forEach(({ every, out, rgb }, level) => {
      const n = Math.ceil(out / every);
      const base = [c.x, c.y, c.z].map((v) => Math.round(v / every) * every);
      const fade = (p) => Math.max(0, 1 - Math.hypot(p[0] - c.x, p[1] - c.y, p[2] - c.z) / out) ** 3;
      const [positions, colors, ends, shades] = [[], [], [], []];
      for (let i = -n; i <= n; i++) {
        for (let j = -n; j <= n; j++) {
          for (let k = -n; k <= n; k++) {
            const p = [base[0] + i * every, base[1] + j * every, base[2] + k * every];
            const f = fade(p);
            const ground = this.groundAt(p[0], p[2]);
            if (!f || p[1] >= ground) continue;
            positions.push(...p);
            colors.push(...rgb.map((v) => v * f));
            if (!this.lines[level]) continue;
            // To the next point along each way, where both ends are seen.
            for (let axis = 0; axis < 3; axis++) {
              const q = [...p];
              q[axis] += every;
              // Up to the ground, where it reaches it.
              if (axis === 1) q[1] = Math.min(q[1], ground);
              else if (q[1] >= this.groundAt(q[0], q[2])) continue;
              const g = fade(q);
              if (!g) continue;
              ends.push(...p, ...q);
              shades.push(...LINE_RGB.map((v) => v * f * f), ...LINE_RGB.map((v) => v * g * g));
            }
          }
        }
      }
      this.grids[level].geometry.dispose();
      this.grids[level].geometry = made(positions, colors);
      if (!this.lines[level]) return;
      this.lines[level].geometry.dispose();
      this.lines[level].geometry = made(ends, shades);
    });
  }
}

const made = (positions, colors) => {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
  return geometry;
};
