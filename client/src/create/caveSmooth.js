import * as THREE from "three";

// The cave smooth tool: a ring on the cave rock the pointer's on, lying on it, and while the
// button's held, the rock inside smoothed over and over (Caves.smooth): floors toward walkable,
// ceilings plainer, walls' outlines evened. Each press undoes as one.

const AGAIN_MS = 120; // how often holding the button smooths again
const RING_POINTS = 48;
const RING = 0xffe9a0;
const $ = (id) => document.getElementById(id);

export class CaveSmooth {
  // ray(): the pointer's THREE.Raycaster, or null off the view.
  constructor({ scene, caves, ray }) {
    Object.assign(this, { caves, ray });
    this.down = null; // { last, join } while the button's held
    this.ring = new THREE.LineLoop(new THREE.BufferGeometry(), new THREE.LineBasicMaterial({ color: RING, depthTest: false, transparent: true }));
    this.ring.geometry.setAttribute("position", new THREE.BufferAttribute(new Float32Array(RING_POINTS * 3), 3));
    this.ring.renderOrder = 10;
    this.ring.frustumCulled = false;
    this.ring.visible = false;
    scene.add(this.ring);
    $("caveSmoothSize").addEventListener("input", () => this.read());
    $("caveSmoothStrength").addEventListener("input", () => this.read());
    this.read();
  }

  read() {
    this.size = Number($("caveSmoothSize").value);
    this.strength = Number($("caveSmoothStrength").value) / 100;
    $("caveSmoothSizeOut").textContent = `${this.size} ft`;
    $("caveSmoothStrengthOut").textContent = `${Math.round(this.strength * 100)}%`;
  }

  // Where the pointer's on the rock and how the rock faces there, { at, normal }, or null.
  aim() {
    const ray = this.ray();
    const at = ray && this.caves.hit(ray.ray);
    if (!at) return null;
    // Back off the rock a little, so the facing's read from the air.
    const normal = this.caves.normalAt(at, Math.max(2, this.size / 4));
    return normal && { at, normal };
  }

  press() {
    this.down = { last: -Infinity, join: false };
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
    const aim = this.aim();
    if (aim && this.caves.smooth(aim.at, aim.normal, this.size / 2, { strength: this.strength, join: this.down.join })) this.down.join = true;
  }

  // Gives whether it took the key.
  key(e) {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") {
      this.caves.undo();
      return true;
    }
    if (e.key === "[" || e.key === "]") {
      const size = $("caveSmoothSize");
      size.value = String(Number(size.value) + (e.key === "]" ? 2 : -2));
      this.read();
      return true;
    }
    return false;
  }

  // Each frame, with the tool picked or not: the ring round where it's aimed, each point of it
  // carried along the rock's facing onto the rock.
  tick(on) {
    if (on) this.work();
    const aim = on && this.aim();
    this.ring.visible = Boolean(aim);
    if (!aim) return;
    const n = new THREE.Vector3(...aim.normal);
    const u = new THREE.Vector3().crossVectors(n, Math.abs(n.y) < 0.9 ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(1, 0, 0)).normalize();
    const v = new THREE.Vector3().crossVectors(n, u);
    const radius = this.size / 2;
    const positions = this.ring.geometry.attributes.position;
    const p = new THREE.Vector3();
    for (let k = 0; k < RING_POINTS; k++) {
      const a = (k / RING_POINTS) * Math.PI * 2;
      const on = new THREE.Vector3(...aim.at).addScaledVector(u, Math.cos(a) * radius).addScaledVector(v, Math.sin(a) * radius);
      // From out in the air, in along the facing till the rock.
      p.copy(on).addScaledVector(n, radius);
      let t = 0;
      while (t < radius * 2 && !this.caves.solid(p.x, p.y, p.z)) {
        p.addScaledVector(n, -0.5);
        t += 0.5;
      }
      if (t >= radius * 2) p.copy(on);
      positions.setXYZ(k, p.x, p.y + 0.1, p.z);
    }
    positions.needsUpdate = true;
  }
}
