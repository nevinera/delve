import * as THREE from "three";
import { dummyMaterials, dummyMesh } from "../world/dummy.js";
import { restPointMaterials, restPointMesh } from "../world/restPoint.js";

// Units in /create: training dummies and rest points, placed and moved like objects with the units
// tools, and the spawn point, set with planning's spawn tool. All are kept in world.json
// ({ continent, at: [x, z] } each, and a rest point's id and name too); onChange({ spawn, dummies,
// restPoints }) hands back the lot to keep whenever they change. Those on other continents are kept
// as they are.

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
  return { ...dummyMaterials(opacity), flag: make(FLAG), rest: restPointMaterials(opacity) };
};

// A new rest point id, one no rest point in `taken` has.
export function restPointId(taken, random = Math.random) {
  for (;;) {
    const id = `rest${Math.floor(random() * 36 ** 4).toString(36).padStart(4, "0")}`;
    if (!taken.some((r) => r.id === id)) return id;
  }
}

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
    this.restPoints = []; // every continent's
    this.meshes = new Map(); // dummy or rest point -> its mesh
    this.spawnShown = null;
    this.tool = null; // "unitSelect", "dummy", "rest" or "spawn"
    this.picked = null; // the dummy or rest point picked out with select
    this.dragging = null; // { unit, moved } while one's dragged
    this.onChange = () => {};
    this.onPick = () => {}; // (picked) when what's picked changes
  }

  load({ continent, spawn, dummies, restPoints }) {
    Object.assign(this, { continent, spawn: spawn ?? null, dummies: [...(dummies ?? [])], restPoints: [...(restPoints ?? [])] });
    this.pick(null);
    this.draw();
  }

  // The dummies on this continent, or the rest points.
  here(list = this.dummies) {
    return list.filter((d) => d.continent === this.continent);
  }

  pick(unit) {
    this.picked = unit;
    this.showPicked();
    this.onPick(unit);
  }

  // Names the picked rest point.
  rename(name) {
    if (!this.picked?.id) return;
    this.picked.name = name;
    this.changed();
  }

  stand(mesh, [x, z]) {
    mesh.position.set(x, this.groundAt(x, z), z);
  }

  // Draws the dummies and the spawn point again, as they are.
  draw() {
    for (const mesh of this.meshes.values()) this.group.remove(mesh);
    this.meshes.clear();
    const add = (unit, mesh) => {
      mesh.userData.unit = unit;
      this.stand(mesh, unit.at);
      this.meshes.set(unit, mesh);
      this.group.add(mesh);
    };
    for (const dummy of this.here()) add(dummy, dummyMesh(this.solid));
    for (const rest of this.here(this.restPoints)) add(rest, restPointMesh(this.solid.rest));
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
    for (const [unit, mesh] of this.meshes) this.stand(mesh, unit.at);
    if (this.spawnShown) this.stand(this.spawnShown, this.spawn.at);
    this.showPicked();
  }

  showPicked() {
    const mesh = this.picked && this.meshes.get(this.picked);
    this.ring.visible = Boolean(mesh);
    if (mesh) this.ring.position.set(mesh.position.x, mesh.position.y + 0.2, mesh.position.z);
  }

  changed() {
    this.onChange({ spawn: this.spawn, dummies: this.dummies, restPoints: this.restPoints });
  }

  setTool(tool) {
    this.tool = tool;
    if (this.ghost) this.scene.remove(this.ghost);
    const ghosts = { dummy: () => dummyMesh(this.ghostLook), rest: () => restPointMesh(this.ghostLook.rest), spawn: () => spawnMesh(this.ghostLook) };
    this.ghost = ghosts[tool]?.() ?? null;
    if (this.ghost) {
      this.ghost.visible = false;
      this.scene.add(this.ghost);
    }
    this.dragging = null;
    if (tool !== "unitSelect") this.pick(null);
    else this.showPicked();
  }

  // The dummy or rest point under the pointer, or null.
  unitHit() {
    const ray = this.ray();
    if (!ray) return null;
    const hit = ray.intersectObjects([...this.meshes.values()], true)[0];
    let node = hit?.object;
    while (node && !node.userData.unit) node = node.parent;
    return node?.userData.unit ?? null;
  }

  move() {
    const at = this.hit();
    if (this.ghost) {
      this.ghost.visible = Boolean(at);
      if (at) this.stand(this.ghost, [at[0], at[2]]);
    }
    if (this.dragging && at) {
      const { unit } = this.dragging;
      unit.at = [round(at[0]), round(at[2])];
      this.stand(this.meshes.get(unit), unit.at);
      this.dragging.moved = true;
      this.showPicked();
    }
  }

  down() {
    if (this.tool === "unitSelect") {
      this.pick(this.unitHit());
      if (this.picked) this.dragging = { unit: this.picked, moved: false };
      return;
    }
    const at = this.hit();
    if (!at) return;
    const spot = { continent: this.continent, at: [round(at[0]), round(at[2])] };
    if (this.tool === "dummy") this.dummies.push(spot);
    else if (this.tool === "rest") this.restPoints.push({ id: restPointId(this.restPoints), name: `Rest point ${this.here(this.restPoints).length + 1}`, ...spot });
    else if (this.tool === "spawn") this.spawn = spot;
    else return;
    this.draw();
    this.changed();
  }

  up() {
    if (this.dragging?.moved) this.changed();
    this.dragging = null;
  }

  // Delete or Backspace takes away what's picked, and Escape lets it go. Says whether it used the key.
  key(e) {
    if (this.tool !== "unitSelect" || !this.picked) return false;
    if (e.key === "Escape") {
      this.pick(null);
      return true;
    }
    if (e.key !== "Delete" && e.key !== "Backspace") return false;
    this.dummies = this.dummies.filter((d) => d !== this.picked);
    this.restPoints = this.restPoints.filter((r) => r !== this.picked);
    this.pick(null);
    this.draw();
    this.changed();
    return true;
  }
}
