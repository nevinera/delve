import * as THREE from "three";
import { waterfallMeshes } from "../editor/waterfalls.js";
import { fallsOf } from "../v2/courses.js";

// Courses' falls (v2/courses.js's fallsOf) within REACH_FT of the builder, drawn with the editor's
// waterfalls: a curtain from each lip arcing out to its foot, churning foam where it lands, and
// mist. They're found again when the water changes, and drawn again when that or which are near
// changes, at most every LOOK_S.

const REACH_FT = 1500;
const LOOK_S = 0.5;
const OUT = 0.25; // how far out from its lip a fall lands, as a share of how far it falls
const OUT_FT = [2, 20];
const POOL = 0.7; // how far round its foot its foam and mist reach, as a share of its width

export class Falls {
  constructor(scene, renditions, renderer) {
    Object.assign(this, { renditions, renderer });
    this.group = new THREE.Group();
    scene.add(this.group);
    this.file = null; // the water file the falls were found in
    this.falls = [];
    this.drawn = "";
    this.since = LOOK_S;
  }

  // Each frame, with the builder at continent feet (x, z).
  tick(dt, x, z) {
    if ((this.since += dt) < LOOK_S) return;
    this.since = 0;
    const file = this.renditions.waterFile;
    if (file !== this.file) {
      this.file = file;
      this.falls = (file?.courses ?? []).flatMap((course) =>
        fallsOf(course).map((fall) => {
          const out = Math.min(OUT_FT[1], Math.max(OUT_FT[0], OUT * (fall.top - fall.bottom)));
          return {
            top: [fall.x, fall.top, fall.z],
            bottom: [fall.x + fall.along[0] * out, fall.bottom, fall.z + fall.along[1] * out],
            width: fall.width,
            pool: fall.width * POOL,
          };
        }),
      );
      this.drawn = "";
    }
    const near = this.falls.filter(({ top }) => Math.hypot(top[0] - x, top[2] - z) < REACH_FT);
    const drawn = near.map(({ top }) => top.join()).join(";");
    if (drawn === this.drawn) return;
    this.drawn = drawn;
    for (const mesh of this.group.children) mesh.geometry.dispose();
    this.group.clear();
    for (const mesh of waterfallMeshes(near, [0, 0], this.renderer)) {
      mesh.frustumCulled = false;
      this.group.add(mesh);
    }
  }
}
