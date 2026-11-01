import * as THREE from "three";

// What's drawn in the earth, while the builder's in its rock: the points of the planning grid
// round the camera, three grids of them, fading with distance.

// Each grid: a point every `every` ft, seen out to `out` ft, `px` across.
const GRIDS = [
  { every: 128, out: 1024, px: 4, rgb: [0.35, 0.5, 0.75] },
  { every: 32, out: 256, px: 3, rgb: [0.3, 0.42, 0.62] },
  { every: 8, out: 64, px: 2, rgb: [0.26, 0.36, 0.52] },
];

export class Earth {
  constructor(scene) {
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
      const [positions, colors] = [[], []];
      for (let i = -n; i <= n; i++) {
        for (let j = -n; j <= n; j++) {
          for (let k = -n; k <= n; k++) {
            const p = [base[0] + i * every, base[1] + j * every, base[2] + k * every];
            const fade = Math.max(0, 1 - Math.hypot(p[0] - c.x, p[1] - c.y, p[2] - c.z) / out) ** 2;
            if (!fade) continue;
            positions.push(...p);
            colors.push(...rgb.map((v) => v * fade));
          }
        }
      }
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
      geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
      this.grids[level].geometry.dispose();
      this.grids[level].geometry = geometry;
    });
  }
}
