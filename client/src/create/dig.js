import * as THREE from "three";

// The dig and erase tools. Dig digs a round or square hole into the rock or ground the pointer's
// on, its middle where the pointer meets it, and while the button's held, goes on biting BITE_FT
// further in at a time. Erase, for working from outside caves as a ghost, fills a ball of rock
// round the first cave air the pointer's ray comes to past rock, over and over while the
// button's held. Each shows where it'll work as a wire ghost, and each press undoes as one.

const AGAIN_MS = 150; // how often holding the button digs again
const BITE_FT = 1; // how far in each dig after the first reaches
const ERASE_MS = 400; // how often holding the button erases again
const GHOST = 0xffe14d;
const ERASE_GHOST = 0x7fd0ff;
const $ = (id) => document.getElementById(id);

export class Dig {
  // ray(): the pointer's THREE.Raycaster, or null off the view.
  constructor({ scene, caves, ray, camera }) {
    Object.assign(this, { caves, ray, camera });
    this.settings = { shape: "sphere", size: 10, theme: 0, hewn: false, erase: 40 };
    this.down = null; // { tool, last, join } while the button's held
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
    for (const id of ["digSize", "eraseSize"]) $(id).addEventListener("input", () => this.read());
    $("digTheme").addEventListener("change", () => this.read());
    $("digHewn").addEventListener("change", () => this.read());
    for (const button of document.querySelectorAll("[data-cave-undo]")) button.addEventListener("click", () => this.caves.undo());
    this.read();
  }

  read() {
    this.settings.size = Number($("digSize").value);
    this.settings.erase = Number($("eraseSize").value);
    this.settings.theme = Number($("digTheme").value);
    this.settings.hewn = $("digHewn").checked;
    this.show();
  }

  show() {
    $("digSizeOut").textContent = `${this.settings.size} ft`;
    $("eraseSizeOut").textContent = `${this.settings.erase} ft`;
    for (const button of document.querySelectorAll("[data-dig-shape]")) button.setAttribute("aria-pressed", String(button.dataset.digShape === this.settings.shape));
  }

  // The shape `tool` ("dig" or "erase") works on where the pointer is, as v2/caves.js's carve
  // takes it, or null. Digging on, `bite`, it's moved out of the rock to reach only BITE_FT in.
  shape(tool, bite = false) {
    const ray = this.ray();
    if (!ray) return null;
    if (tool === "erase") {
      const at = this.caves.through(ray.ray);
      return at && { kind: "sphere", at, radius: this.settings.erase / 2 };
    }
    let at = this.caves.hit(ray.ray);
    if (!at) return null;
    const { size, shape } = this.settings;
    if (bite) {
      const normal = this.caves.normalAt(at, Math.max(2, size / 4));
      if (normal) at = at.map((v, k) => v + normal[k] * (size / 2 - BITE_FT));
    }
    if (shape === "sphere") return { kind: "sphere", at, radius: size / 2 };
    const look = new THREE.Vector3();
    this.camera.getWorldDirection(look);
    return { kind: "box", at, half: [size / 2, size / 2, size / 2], yaw: Math.atan2(look.x, look.z) };
  }

  // tool: "dig" or "erase".
  press(tool) {
    this.down = { tool, last: -Infinity, join: false };
    this.work();
  }

  letGo() {
    this.down = null;
    this.caves.letGo();
  }

  work() {
    const now = performance.now();
    if (!this.down || now - this.down.last < (this.down.tool === "erase" ? ERASE_MS : AGAIN_MS)) return;
    const { tool, join } = this.down;
    this.down.last = now;
    const shape = this.shape(tool, join);
    if (!shape) return;
    const { theme, hewn } = this.settings;
    if (this.caves.dig(shape, { fill: tool === "erase", theme, hewn, join })) this.down.join = true;
  }

  // Gives whether it took the key.
  key(e, tool) {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") {
      this.caves.undo();
      return true;
    }
    if (e.key === "[" || e.key === "]") {
      const size = $(tool === "erase" ? "eraseSize" : "digSize");
      size.value = String(Number(size.value) + (e.key === "]" ? 1 : -1) * Number(size.step));
      this.read();
      return true;
    }
    return false;
  }

  // Each frame, with the tool picked: "dig" or "erase", or another.
  tick(tool) {
    const on = tool === "dig" || tool === "erase";
    if (on) this.work();
    const shape = on && this.shape(tool);
    this.ghosts.sphere.material.color.set(tool === "erase" ? ERASE_GHOST : GHOST);
    for (const [kind, ghost] of Object.entries(this.ghosts)) {
      ghost.visible = Boolean(shape) && shape.kind === kind;
      if (!ghost.visible) continue;
      ghost.position.set(...shape.at);
      ghost.scale.setScalar(shape.radius ? shape.radius * 2 : this.settings.size);
      ghost.rotation.set(0, shape.yaw ?? 0, 0);
    }
  }
}
