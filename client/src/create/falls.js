import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { waterfallMeshes } from "../render/waterfalls.js";
import { cascadesOf, fallsOf } from "../v2/courses.js";
import { WATER_TYPES } from "../v2/water.js";
import { waterLookOf } from "./waterSurface.js";

// Courses' falls and their cascades' steps (v2/courses.js) within REACH_FT of the builder, drawn
// with the editor's waterfalls: a curtain from each lip arcing out to its foot, churning foam where
// it lands, and over falls, mist; all of them as one mesh for each material. They're found again
// when the water changes, and drawn again when that or which are near changes, at most every LOOK_S.

const REACH_FT = 1500;
const LOOK_S = 0.5;
const OUT = 0.25; // how far out from its lip a fall lands, as a share of how far it falls
const OUT_FT = [2, 20];
const POOL = 0.7; // how far round its foot its foam and mist reach, as a share of its width
const STEP_OUT = 0.4; // and for cascades' steps
const STEP_OUT_FT = 1;
const STEP_POOL = 0.3;
// What runs down the ground instead of falling: a sheet this far over it, from this far back from the
// lip, with a row this far apart and this many points across, going no farther than MOST_DOWN_FT.
const SHEET_LIFT_FT = 0.5;
const SHEET_BACK_FT = 1.5;
const SHEET_ROW_FT = 2;
const SHEET_ACROSS = 5;
const MOST_DOWN_FT = 120;

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
    // How falls are drawn goes by the biome they're in.
    if (this.renditions.biomeAreas !== this.areas) {
      this.areas = this.renditions.biomeAreas;
      this.drawn = "";
    }
    if (file !== this.file) {
      this.file = file;
      const drawn = (fall, step) => {
        const out = step ? Math.max(STEP_OUT_FT, STEP_OUT * (fall.top - fall.bottom)) : Math.min(OUT_FT[1], Math.max(OUT_FT[0], OUT * (fall.top - fall.bottom)));
        return {
          top: [fall.x, fall.top, fall.z],
          bottom: [fall.x + fall.along[0] * out, fall.bottom, fall.z + fall.along[1] * out],
          width: fall.width,
          pool: fall.width * (step ? STEP_POOL : POOL),
          mist: !step,
          source: fall,
        };
      };
      const of = (course, fall, step) => {
        const out = drawn(fall, step);
        out.type = WATER_TYPES.indexOf(course.type);
        return out;
      };
      this.falls = (file?.courses ?? []).flatMap((course) => [
        ...fallsOf(course).map((fall) => of(course, fall, false)),
        ...cascadesOf(course).flatMap(({ steps }) => steps.map((step) => of(course, step, true))),
      ]);
      this.drawn = "";
    }
    const near = this.falls.filter(({ top }) => Math.hypot(top[0] - x, top[2] - z) < REACH_FT);
    const drawn = near.map(({ top }) => top.join()).join(";");
    if (drawn === this.drawn) return;
    this.drawn = drawn;
    for (const mesh of this.group.children) mesh.geometry.dispose();
    this.group.clear();
    const byMaterial = new Map();
    for (const mesh of waterfallMeshes(near.map((fall) => this.dressed(fall)), [0, 0], this.renderer)) {
      if (!byMaterial.has(mesh.material)) byMaterial.set(mesh.material, []);
      byMaterial.get(mesh.material).push(mesh);
    }
    for (const [material, meshes] of byMaterial) {
      const merged = new meshes[0].constructor(mergeGeometries(meshes.map((mesh) => mesh.geometry)), material);
      for (const mesh of meshes) mesh.geometry.dispose();
      Object.assign(merged, { frustumCulled: false, renderOrder: meshes[0].renderOrder });
      this.group.add(merged);
    }
  }

  // `fall` as it's drawn in the biome at its lip: with a `sheet` in place of a curtain where what
  // runs there stays on the ground, { rows: rows of [x, y, z], look }.
  dressed(fall) {
    const r = this.renditions;
    const [x, top, z] = fall.top;
    const look = waterLookOf(fall.type, r.biomes.at(x, z));
    if (!look.surfaceFalls) return fall;
    const { along, width, bottom } = fall.source;
    const side = [-along[1] * width * 0.5, along[0] * width * 0.5];
    const rows = [];
    for (let down = -SHEET_BACK_FT; down <= MOST_DOWN_FT; down += SHEET_ROW_FT) {
      const row = [];
      for (let k = 0; k < SHEET_ACROSS; k++) {
        const t = (2 * k) / (SHEET_ACROSS - 1) - 1;
        const [px, pz] = [x + along[0] * down + side[0] * t, z + along[1] * down + side[1] * t];
        row.push([px, Math.min(top, Math.max(bottom, r.heightAt(px, pz) ?? bottom)) + SHEET_LIFT_FT, pz]);
      }
      rows.push(row);
      // Till it's reached the water at the foot.
      if (down > 0 && row.every(([, y]) => y <= bottom + SHEET_LIFT_FT + 0.01)) break;
    }
    return { ...fall, sheet: { rows, look } };
  }
}
