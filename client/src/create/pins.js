import * as THREE from "three";

// Pins stuck in the ground by the planning pin tool, for notes on the map: each has a spot, a head
// color (one of the marker's), a short title shown over it, and content, markdown of any length.
// A pin stands taller the further it is from the camera, so it's always plain to see, and its head
// is always about HEAD_PX across, to be clicked. Ground between a pin and the camera hides it and
// its title. Pins picked out with the select tool show a halo round their heads. Kept in the
// planning file beside the lines:
//
//   "pins": [{ "x": 0, "z": 0, "color": "red", "title": "...", "content": "..." }, ...]

export const TITLE_MAX = 64;
const TALL_FT = 4; // a pin's height, near
const TALL_SHARE = 0.15; // and further off, as a share of how far off it is
const HEAD_PX = 18; // how wide a pin's head is
const STICK_PX = 2; // and its stick
const PICK_PX = 4; // how far past a head's edge the pointer still picks it
const LABEL_FT = 30000; // how far off a pin's title is shown
const STICK = 0xd8d4cc;
const HALO = 0xffe14d;
const HALO_SCALE = 1.6; // how much wider than its head a picked-out pin's halo is
const BLOCK_STEPS = 24; // how many places between the camera and a pin's head ground is looked for

export class Pins {
  // surface(x, z) gives the height pins stand at; titles are shown over `stage`.
  constructor(scene, surface, stage, colors) {
    this.surface = surface;
    this.stage = stage;
    this.colors = colors;
    this.group = new THREE.Group();
    scene.add(this.group);
    this.stick = new THREE.CylinderGeometry(1, 1, 1, 6).translate(0, 0.5, 0);
    this.head = new THREE.SphereGeometry(1, 12, 8);
    this.stickMaterial = new THREE.MeshLambertMaterial({ color: STICK });
    this.headMaterials = new Map(); // color -> its heads' material
    this.haloMaterial = new THREE.MeshBasicMaterial({ color: HALO, side: THREE.BackSide });
    this.selected = new Set();
    this.list = []; // { x, z, color, title, content, group, stick, head, label }
  }

  load(pins) {
    for (const pin of [...this.list]) this.remove(pin);
    for (const { x, z, color, title, content } of pins) this.add(x, z, color, title, content);
  }

  toJSON() {
    const round = (v) => Math.round(v * 10) / 10;
    return this.list.map(({ x, z, color, title, content }) => ({ x: round(x), z: round(z), color, title, content }));
  }

  add(x, z, color, title = "", content = "") {
    if (!(color in this.colors)) color = "red";
    if (!this.headMaterials.has(color)) this.headMaterials.set(color, new THREE.MeshLambertMaterial({ color: this.colors[color] }));
    const group = new THREE.Group();
    const stick = new THREE.Mesh(this.stick, this.stickMaterial);
    const head = new THREE.Mesh(this.head, this.headMaterials.get(color));
    const halo = new THREE.Mesh(this.head, this.haloMaterial);
    halo.scale.setScalar(HALO_SCALE);
    halo.visible = false;
    head.add(halo);
    group.add(stick, head);
    this.group.add(group);
    const label = document.createElement("div");
    label.className = "create-pin-label";
    label.hidden = true;
    this.stage.append(label);
    const pin = { x, z, color, title: title.slice(0, TITLE_MAX), content, group, stick, head, halo, label };
    this.relabel(pin);
    this.list.push(pin);
    return pin;
  }

  relabel(pin) {
    pin.label.textContent = pin.title;
  }

  remove(pin) {
    this.selected.delete(pin);
    this.group.remove(pin.group);
    pin.label.remove();
    this.list = this.list.filter((p) => p !== pin);
  }

  // How many feet a pixel is across, `d` ft from the camera.
  ftPerPx(camera, height, d) {
    return (d * 2 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2))) / height;
  }

  // Sizes the pins for the camera, and puts their titles over their heads.
  tick(camera, width, height) {
    const eye = camera.position;
    const top = new THREE.Vector3();
    for (const pin of this.list) {
      const y = this.surface(pin.x, pin.z);
      const d = Math.max(1, Math.hypot(pin.x - eye.x, y - eye.y, pin.z - eye.z));
      const tall = Math.max(TALL_FT, TALL_SHARE * d);
      const px = this.ftPerPx(camera, height, d);
      pin.group.position.set(pin.x, y, pin.z);
      pin.stick.scale.set((STICK_PX / 2) * px, tall, (STICK_PX / 2) * px);
      pin.head.scale.setScalar((HEAD_PX / 2) * px);
      pin.head.position.y = tall;
      pin.top = y + tall;
      top.set(pin.x, y + tall, pin.z);
      const inFront = top.clone().applyMatrix4(camera.matrixWorldInverse).z < 0;
      const ndc = top.project(camera);
      pin.label.hidden = !this.group.visible || !pin.title || !inFront || d > LABEL_FT || Math.abs(ndc.x) > 1 || Math.abs(ndc.y) > 1 || this.blocked(eye, pin.x, y + tall, pin.z);
      if (pin.label.hidden) continue;
      const [sx, sy] = [((ndc.x + 1) / 2) * width, ((1 - ndc.y) / 2) * height - HEAD_PX];
      pin.label.style.transform = `translate(${sx}px, ${sy}px) translate(-50%, -100%)`;
    }
  }

  // Whether ground stands between `eye` and (x, y, z).
  blocked(eye, x, y, z) {
    for (let k = 1; k < BLOCK_STEPS; k++) {
      const t = k / BLOCK_STEPS;
      const [px, py, pz] = [eye.x + (x - eye.x) * t, eye.y + (y - eye.y) * t, eye.z + (z - eye.z) * t];
      if (this.surface(px, pz) > py) return true;
    }
    return false;
  }

  // Picks out `pin`, or with `add`, picks it out too, or puts it back if it was.
  select(pin, add = false) {
    const was = this.selected.has(pin);
    if (!add) this.unselect();
    this.mark(pin, !(was && add));
  }

  mark(pin, on) {
    if (on) this.selected.add(pin);
    else this.selected.delete(pin);
    pin.halo.visible = on;
  }

  unselect() {
    for (const pin of this.selected) pin.halo.visible = false;
    this.selected.clear();
  }

  // The pin whose head's under the canvas pixel (px, py), or null.
  pick(camera, width, height, px, py) {
    if (!this.group.visible) return null;
    let [best, nearest] = [null, HEAD_PX / 2 + PICK_PX];
    for (const pin of this.list) {
      if (pin.top === undefined) continue;
      const v = new THREE.Vector3(pin.x, pin.top, pin.z);
      if (v.clone().applyMatrix4(camera.matrixWorldInverse).z >= 0) continue;
      v.project(camera);
      const d = Math.hypot(((v.x + 1) / 2) * width - px, ((1 - v.y) / 2) * height - py);
      if (d < nearest) [best, nearest] = [pin, d];
    }
    return best;
  }

  setShown(shown) {
    this.group.visible = shown;
    if (!shown) for (const pin of this.list) pin.label.hidden = true;
  }
}
