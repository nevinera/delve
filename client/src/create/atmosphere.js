import * as THREE from "three";
import { SEA_LEVEL_FT } from "../v2/sizes.js";
import { VOXEL_FT } from "../v2/caves.js";
import { FAR_FT } from "./ground.js";
import { Overhead } from "./overhead.js";
import { Earth } from "./earth.js";

// The light and air round the camera: the sky, the sun, and fog that closes in where the ground
// drawn ends; murky close in under water; and dark in the rock under the ground, with the ground
// over it drawn as a ceiling and nothing on it. The camera's near plane moves out as it goes up.

const SKY = 0x9cc4e4;
const UNDERGROUND = 0x000000; // the sky, with the camera under the ground
const OVERHEAD_EVERY_MS = 1000; // how often the ground drawn over the camera underground's read again
// Where fog starts and closes in, as shares of how far off ground's drawn.
const FOG = { near: 0.5, far: 1.02 };
const [NEAR_FT, NEAR_PER_FT, NEAR_MOST_FT] = [0.5, 0.001, 100]; // the camera's near plane, by how high it is
const UNDERWATER = { color: 0x1d4f5c, nearFt: -10, farFt: 70 }; // the fog with the camera under water

export class Atmosphere {
  // `shown` are what the camera in the rock hides: { ground, caves, sea, falls, things, scatter,
  // clutter, surfaces }. `parts` times reading the ceiling.
  constructor({ scene, camera, renditions, shown, groundAt, waterAt, ghost, parts }) {
    Object.assign(this, { scene, camera, shown, groundAt, waterAt, ghost, parts });
    scene.background = new THREE.Color(SKY);
    scene.fog = new THREE.Fog(SKY, FAR_FT * FOG.near, FAR_FT * FOG.far);
    scene.add(new THREE.HemisphereLight(0xdde8ff, 0x55503c, 1.6));
    this.sun = new THREE.DirectionalLight(0xfff2dd, 1.8);
    this.sun.position.set(0.5, 1, 0.3);
    scene.add(this.sun, this.sun.target);
    this.overhead = new Overhead(scene, (x, z) => renditions.heightAt(x, z));
    this.earth = new Earth(scene, (x, z) => groundAt(x, z));
    this.lastOverhead = 0;
  }

  // With the builder at x, z.
  tick(now, x, z) {
    const { scene, camera, shown } = this;
    const { ground, caves } = shown;
    // The ground drawn ends ground.reach across from the builder, so fog closes in there, as far
    // off as that is from the camera, high up too. High up, the camera's near plane's further
    // off, to keep the far ground from flickering.
    const back = Math.hypot(camera.position.x - x, camera.position.z - z);
    const high = Math.max(0, camera.position.y - (this.groundAt(x, z) ?? SEA_LEVEL_FT));
    scene.fog.near = Math.hypot(ground.reach * FOG.near + back, high);
    scene.fog.far = Math.hypot(ground.reach * FOG.far + back, high);
    const near = Math.min(NEAR_MOST_FT, Math.max(NEAR_FT, high * NEAR_PER_FT));
    if (Math.abs(camera.near - near) > near * 0.1) {
      camera.near = near;
      camera.updateProjectionMatrix();
    }
    // Under water, murky, close in.
    const surface = this.waterAt(camera.position.x, camera.position.z);
    const under = surface != null && camera.position.y < surface;
    // In the rock under the ground, dark, the ground over it drawn as a ceiling (overhead), and
    // nothing on it. In a cave's air the world's drawn as ever, so it shows out of the mouth.
    const [cx, cz] = [camera.position.x, camera.position.z];
    const buried = camera.position.y < this.groundAt(cx, cz) && caves.solid(cx, camera.position.y, cz) && !caves.mouth(Math.floor(cx / VOXEL_FT), Math.floor(cz / VOXEL_FT));
    ground.group.visible = !buried;
    caves.groundGroup.visible = !buried;
    // In the rock, the caves' outlines show.
    caves.show("lines", buried);
    caves.fromEarth(this.ghost());
    const again = now - this.lastOverhead > OVERHEAD_EVERY_MS;
    if (again) this.lastOverhead = now;
    this.parts.time("overhead", () => this.overhead.tick(buried, x, z, again));
    this.earth.tick(camera, this.ghost());
    for (const one of [shown.sea.mesh, shown.falls.group, shown.things.group, shown.things.outlines]) one.visible = !buried;
    if (buried) for (const one of [shown.scatter.group, shown.clutter.group, shown.surfaces.group]) one.visible = false;
    const sky = buried ? UNDERGROUND : under ? UNDERWATER.color : SKY;
    scene.fog.color.set(sky);
    scene.background.set(sky);
    if (under) [scene.fog.near, scene.fog.far] = [UNDERWATER.nearFt, UNDERWATER.farFt];
    this.sun.position.set(x + 500, 1000, z + 300);
    this.sun.target.position.set(x, 0, z);
  }
}
