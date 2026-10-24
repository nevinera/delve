import * as THREE from "three";

const MIN_DIST = 1.5;
const MAX_DIST = 90;
const MIN_PITCH = -1.2; // below the pivot, looking up
const MAX_PITCH = 1.45;
const DRAG_RAD_PER_PX = 0.006;
const PIVOT_HEIGHT = 5.6;
const CLEARANCE = 0.8; // how far the camera keeps off the ground
const ZOOM_OUT_RATE = 3; // per second, easing back after a collision
const FOLLOW_RATE = 1.6; // rad/s the camera swings behind a moving character
const HIDE_PLAYER_DIST = 2.5;

// A WoW-style third-person camera: orbits a pivot at the character's head
// on an arm of `distance`, pulled in when terrain or a building gets in
// between, and eased back out afterwards.
//
// Mouse: left-drag orbits the camera; right-drag orbits and turns the
// character with it; both buttons run forward; wheel zooms. Touch:
// one-finger drag orbits, pinch zooms.
export class WowCamera {
  constructor(camera, element) {
    this.camera = camera;
    this.yaw = 0; // camera looks along (sin yaw, cos yaw)
    this.pitch = 0.32;
    this.distance = 30; // what the player asked for
    this.actual = 30; // after collision
    this.buttons = 0;
    this.enabled = true;
    this.dragged = false;
    this.touches = new Map();
    this.pinch = null;
    this.bind(element);
  }

  get mouselook() {
    return (this.buttons & 2) !== 0;
  }

  get bothButtons() {
    return (this.buttons & 3) === 3;
  }

  bind(el) {
    el.addEventListener("contextmenu", (e) => e.preventDefault());
    el.addEventListener("pointerdown", (e) => {
      if (!this.enabled) return;
      if (e.pointerType === "mouse") {
        this.buttons = e.buttons;
        el.setPointerCapture(e.pointerId);
      } else {
        this.touches.set(e.pointerId, {x: e.clientX, y: e.clientY});
        if (this.touches.size === 2) this.pinch = this.pinchDistance();
      }
    });
    el.addEventListener("pointermove", (e) => {
      if (!this.enabled) return;
      if (e.pointerType === "mouse") {
        this.buttons = e.buttons;
        if (this.buttons & 3) this.rotate(e.movementX, e.movementY);
        return;
      }
      const t = this.touches.get(e.pointerId);
      if (!t) return;
      const dx = e.clientX - t.x, dy = e.clientY - t.y;
      t.x = e.clientX;
      t.y = e.clientY;
      if (this.touches.size === 1) this.rotate(dx, dy);
      else if (this.touches.size === 2) {
        const d = this.pinchDistance();
        if (this.pinch) this.zoom(this.pinch / d);
        this.pinch = d;
      }
    });
    const up = (e) => {
      if (e.pointerType === "mouse") this.buttons = e.buttons;
      this.touches.delete(e.pointerId);
      if (this.touches.size < 2) this.pinch = null;
    };
    el.addEventListener("pointerup", up);
    el.addEventListener("pointercancel", up);
    el.addEventListener("wheel", (e) => {
      if (!this.enabled) return;
      e.preventDefault();
      this.zoom(Math.pow(1.0015, e.deltaY));
    }, {passive: false});
  }

  pinchDistance() {
    const [a, b] = [...this.touches.values()];
    return Math.hypot(a.x - b.x, a.y - b.y);
  }

  rotate(dx, dy) {
    this.yaw -= dx * DRAG_RAD_PER_PX;
    this.pitch = Math.min(MAX_PITCH, Math.max(MIN_PITCH, this.pitch + dy * DRAG_RAD_PER_PX));
  }

  zoom(factor) {
    this.distance = Math.min(MAX_DIST, Math.max(MIN_DIST, this.distance * factor));
    if (this.distance < this.actual) this.actual = this.distance;
  }

  // Swings the camera toward being behind a character facing `heading`.
  follow(heading, dt) {
    let diff = heading - this.yaw;
    diff = Math.atan2(Math.sin(diff), Math.cos(diff));
    this.yaw += Math.sign(diff) * Math.min(Math.abs(diff), FOLLOW_RATE * dt);
  }

  // Places the camera. blocked(x, y, z) says whether a point is inside
  // something solid. Returns the pivot it looked at.
  update(target, dt, world, blocked) {
    const pivot = new THREE.Vector3(target.x, target.y + PIVOT_HEIGHT, target.z);
    const back = new THREE.Vector3(
      -Math.sin(this.yaw) * Math.cos(this.pitch),
      Math.sin(this.pitch),
      -Math.cos(this.yaw) * Math.cos(this.pitch),
    );
    // Walk the arm outward; stop short of the first solid thing.
    let reach = this.distance;
    for (let d = 0.5; d <= this.distance; d += 0.5) {
      const x = pivot.x + back.x * d, y = pivot.y + back.y * d, z = pivot.z + back.z * d;
      if (y < world.heightAt(x, z) + CLEARANCE || blocked(x, y, z)) {
        reach = Math.max(MIN_DIST * 0.5, d - 0.5);
        break;
      }
    }
    this.actual = reach < this.actual ? reach : this.actual + (reach - this.actual) * Math.min(1, dt * ZOOM_OUT_RATE);
    this.camera.position.copy(pivot).addScaledVector(back, this.actual);
    this.camera.lookAt(pivot);
    return pivot;
  }

  get hidesPlayer() {
    return this.actual < HIDE_PLAYER_DIST;
  }
}
