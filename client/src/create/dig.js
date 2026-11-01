import * as THREE from "three";

// The dig and fill tools: dig a round or square hole into the rock or ground the pointer's on,
// its middle where the pointer meets it, or fill one with rock, over and over while the button's
// held; ctrl does the other. Shows where it'll dig or fill as a wire ghost. Each press undoes as
// one.

const AGAIN_MS = 90; // how often holding the button digs again
const GHOST = 0xffe14d;
const FILL_GHOST = 0x7fd0ff;
const $ = (id) => document.getElementById(id);

export class Dig {
  // ray(): the pointer's THREE.Raycaster, or null off the view.
  constructor({ scene, caves, ray, camera }) {
    Object.assign(this, { caves, ray, camera });
    this.settings = { shape: "sphere", size: 10, theme: 0, hewn: false };
    this.down = null; // { fill, last } while the button's held
    const material = new THREE.MeshBasicMaterial({ color: GHOST, wireframe: true, transparent: true, opacity: 0.5, depthTest: false });
    this.ghosts = { sphere: new THREE.Mesh(new THREE.SphereGeometry(0.5, 16, 10), material), box: new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), material) };
    for (const ghost of Object.values(this.ghosts)) {
      ghost.visible = false;
      ghost.renderOrder = 10;
      scene.add(ghost);
    }
    for (const button of document.querySelectorAll("[data-dig-shape]")) {
      button.addEventListener("click", () => {
        this.settings.shape = button.dataset.digShape;
        this.show();
      });
    }
    $("digSize").addEventListener("input", () => this.read());
    $("digTheme").addEventListener("change", () => this.read());
    $("digHewn").addEventListener("change", () => this.read());
    $("digUndo").addEventListener("click", () => this.caves.undo());
    this.read();
  }

  read() {
    this.settings.size = Number($("digSize").value);
    this.settings.theme = Number($("digTheme").value);
    this.settings.hewn = $("digHewn").checked;
    this.show();
  }

  show() {
    $("digSizeOut").textContent = `${this.settings.size} ft`;
    for (const button of document.querySelectorAll("[data-dig-shape]")) button.setAttribute("aria-pressed", String(button.dataset.digShape === this.settings.shape));
  }

  // The shape to dig where the pointer is, as v2/caves.js's carve takes it, or null.
  shape() {
    const ray = this.ray();
    const at = ray && this.caves.hit(ray.ray);
    if (!at) return null;
    const { size, shape } = this.settings;
    if (shape === "sphere") return { kind: "sphere", at, radius: size / 2 };
    const look = new THREE.Vector3();
    this.camera.getWorldDirection(look);
    return { kind: "box", at, half: [size / 2, size / 2, size / 2], yaw: Math.atan2(look.x, look.z) };
  }

  // fill: whether it's the fill tool.
  press(e, fill) {
    this.down = { fill: fill !== (e.ctrlKey || e.metaKey), last: -Infinity, join: false };
    this.work();
  }

  letGo() {
    this.down = null;
    this.caves.letGo();
  }

  work() {
    const now = performance.now();
    if (!this.down || now - this.down.last < AGAIN_MS) return;
    this.down.last = now;
    const shape = this.shape();
    if (!shape) return;
    const { theme, hewn } = this.settings;
    if (this.caves.dig(shape, { fill: this.down.fill, theme, hewn, join: this.down.join })) this.down.join = true;
  }

  // Gives whether it took the key.
  key(e) {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") {
      this.caves.undo();
      return true;
    }
    if (e.key === "[" || e.key === "]") {
      const size = $("digSize");
      size.value = String(Number(size.value) + (e.key === "]" ? 2 : -2));
      this.read();
      return true;
    }
    return false;
  }

  // Each frame, with the tool picked or not; fill whether it's the fill tool.
  tick(on, fill) {
    if (on) this.work();
    const shape = on && this.shape();
    this.ghosts.sphere.material.color.set(fill ? FILL_GHOST : GHOST);
    for (const [kind, ghost] of Object.entries(this.ghosts)) {
      ghost.visible = Boolean(shape) && shape.kind === kind;
      if (!ghost.visible) continue;
      ghost.position.set(...shape.at);
      ghost.scale.setScalar(this.settings.size);
      ghost.rotation.set(0, shape.yaw ?? 0, 0);
    }
  }
}
