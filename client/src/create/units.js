import * as THREE from "three";
import { dummyMaterials, dummyMesh } from "../world/dummy.js";

// Units in /create: training dummies, placed and moved like objects with the units tools, and the
// spawn point, set with planning's spawn tool. Both are kept in world.json ({ continent, at: [x, z] }
// each); onChange({ spawn, dummies }) hands back the lot to keep whenever they change. Dummies on
// other continents are kept as they are.

const FLAG = 0xe8c860;
const PICKED = 0xffe14d;
const round = (v) => Math.round(v * 10) / 10;

// The spawn point: a pole with a flag.
function spawnMesh(material) {
  const group = new THREE.Group();
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.15, 9, 6), material.wood);
  pole.position.y = 4.5;
  const shape = new THREE.Shape([new THREE.Vector2(0, 0), new THREE.Vector2(3.2, -1), new THREE.Vector2(0, -2)]);
  const flag = new THREE.Mesh(new THREE.ShapeGeometry(shape), material.flag);
  flag.position.set(0.15, 9, 0);
  group.add(pole, flag);
  return group;
}

const materials = (opacity = 1) => {
  const make = (color) => new THREE.MeshLambertMaterial({ color, transparent: opacity < 1, opacity, side: THREE.DoubleSide, depthWrite: opacity === 1 });
  return { ...dummyMaterials(opacity), flag: make(FLAG) };
};

export class Units {
  // groundAt(x, z): where the ground or a slab is to stand on. hit(): where the pointer meets the
  // ground, [x, y, z], or null. ray(): the pointer's ray, or null.
  constructor({ scene, groundAt, hit, ray }) {
    Object.assign(this, { scene, groundAt, hit, ray });
    this.group = new THREE.Group();
    scene.add(this.group);
    this.solid = materials();
    this.ghostLook = materials(0.45);
    this.ghost = null;
    this.ring = new THREE.Mesh(new THREE.RingGeometry(1.4, 1.8, 24), new THREE.MeshBasicMaterial({ color: PICKED, side: THREE.DoubleSide, depthTest: false, transparent: true }));
    this.ring.rotation.x = -Math.PI / 2;
    this.ring.renderOrder = 10;
    this.ring.visible = false;
    scene.add(this.ring);
    this.continent = null;
    this.spawn = null;
    this.dummies = []; // every continent's
    this.meshes = new Map(); // dummy -> its mesh
    this.spawnShown = null;
    this.tool = null; // "unitSelect", "dummy" or "spawn"
    this.picked = null; // the dummy picked out with select
    this.dragging = null; // { dummy, moved } while one's dragged
    this.onChange = () => {};
  }

  load({ continent, spawn, dummies }) {
    Object.assign(this, { continent, spawn: spawn ?? null, dummies: [...(dummies ?? [])] });
    this.picked = null;
    this.draw();
  }

  here() {
    return this.dummies.filter((d) => d.continent === this.continent);
  }

  stand(mesh, [x, z]) {
    mesh.position.set(x, this.groundAt(x, z), z);
  }

  // Draws the dummies and the spawn point again, as they are.
  draw() {
    for (const mesh of this.meshes.values()) this.group.remove(mesh);
    this.meshes.clear();
    for (const dummy of this.here()) {
      const mesh = dummyMesh(this.solid);
      mesh.userData.dummy = dummy;
      this.stand(mesh, dummy.at);
      this.meshes.set(dummy, mesh);
      this.group.add(mesh);
    }
    if (this.spawnShown) this.group.remove(this.spawnShown);
    this.spawnShown = null;
    if (this.spawn?.continent === this.continent) {
      this.spawnShown = spawnMesh(this.solid);
      this.stand(this.spawnShown, this.spawn.at);
      this.group.add(this.spawnShown);
    }
    this.showPicked();
  }

  // Ground can move under them, so they're stood on it again now and then.
  restand() {
    for (const [dummy, mesh] of this.meshes) this.stand(mesh, dummy.at);
    if (this.spawnShown) this.stand(this.spawnShown, this.spawn.at);
    this.showPicked();
  }

  showPicked() {
    const mesh = this.picked && this.meshes.get(this.picked);
    this.ring.visible = Boolean(mesh);
    if (mesh) this.ring.position.set(mesh.position.x, mesh.position.y + 0.2, mesh.position.z);
  }

  changed() {
    this.onChange({ spawn: this.spawn, dummies: this.dummies });
  }

  setTool(tool) {
    this.tool = tool;
    if (this.ghost) this.scene.remove(this.ghost);
    this.ghost = tool === "dummy" ? dummyMesh(this.ghostLook) : tool === "spawn" ? spawnMesh(this.ghostLook) : null;
    if (this.ghost) {
      this.ghost.visible = false;
      this.scene.add(this.ghost);
    }
    if (tool !== "unitSelect") this.picked = null;
    this.dragging = null;
    this.showPicked();
  }

  // The dummy under the pointer, or null.
  dummyHit() {
    const ray = this.ray();
    if (!ray) return null;
    const hit = ray.intersectObjects([...this.meshes.values()], true)[0];
    let node = hit?.object;
    while (node && !node.userData.dummy) node = node.parent;
    return node?.userData.dummy ?? null;
  }

  move() {
    const at = this.hit();
    if (this.ghost) {
      this.ghost.visible = Boolean(at);
      if (at) this.stand(this.ghost, [at[0], at[2]]);
    }
    if (this.dragging && at) {
      const { dummy } = this.dragging;
      dummy.at = [round(at[0]), round(at[2])];
      this.stand(this.meshes.get(dummy), dummy.at);
      this.dragging.moved = true;
      this.showPicked();
    }
  }

  down() {
    if (this.tool === "unitSelect") {
      this.picked = this.dummyHit();
      if (this.picked) this.dragging = { dummy: this.picked, moved: false };
      this.showPicked();
      return;
    }
    const at = this.hit();
    if (!at) return;
    const spot = { continent: this.continent, at: [round(at[0]), round(at[2])] };
    if (this.tool === "dummy") this.dummies.push(spot);
    else if (this.tool === "spawn") this.spawn = spot;
    else return;
    this.draw();
    this.changed();
  }

  up() {
    if (this.dragging?.moved) this.changed();
    this.dragging = null;
  }

  // Delete or Backspace takes away the picked dummy, and Escape lets it go. Says whether it used the key.
  key(e) {
    if (this.tool !== "unitSelect" || !this.picked) return false;
    if (e.key === "Escape") {
      this.picked = null;
      this.showPicked();
      return true;
    }
    if (e.key !== "Delete" && e.key !== "Backspace") return false;
    this.dummies = this.dummies.filter((d) => d !== this.picked);
    this.picked = null;
    this.draw();
    this.changed();
    return true;
  }
}
