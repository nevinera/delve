import * as THREE from "three";
import { dummyMaterials, dummyMesh } from "../world/dummy.js";
import { restPointMaterials, restPointMesh } from "../world/restPoint.js";
import { characterMesh, disposeCharacter } from "../character/characterMesh.js";
import { resolveRecipe } from "../character/recipe.js";

// Units in /create: training dummies and rest points, placed and moved like objects with the units
// tools, and the spawn point, set with planning's spawn tool. All are kept in world.json
// ({ continent, at: [x, z] } each, and a rest point's id and name too); onChange({ spawn, dummies,
// restPoints }) hands back the lot to keep whenever they change. Those on other continents are kept
// as they are.
//
// Mobs placed by hand are kept in this continent's spawns.json instead: the mob tool puts the
// chosen creature down with the mob settings, and select picks, drags and deletes them like the
// rest. loadSpawns(json) reads the file and spawnsJSON() gives it back, its regions and NPCs as
// they were, and mobVersion moves on whenever a mob changes.

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

// A new id of `prefix` and four more letters, one nothing in `taken` has.
function newId(prefix, taken, random) {
  for (;;) {
    const id = `${prefix}${Math.floor(random() * 36 ** 4).toString(36).padStart(4, "0")}`;
    if (!taken.some((r) => r.id === id)) return id;
  }
}

// A new rest point id, one no rest point in `taken` has.
export const restPointId = (taken, random = Math.random) => newId("rest", taken, random);

// A new placed id, one nothing placed in `taken` has.
export const placedId = (taken, random = Math.random) => newId("mob", taken, random);

// A seeded random from a string, so a placed mob looks the same each time it's drawn.
function seeded(text) {
  let s = 1;
  for (const ch of text) s = (Math.imul(s, 31) + ch.charCodeAt(0)) >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}

// What the mob tool puts down: levels is a number or [min, max], yaw is in degrees, and a wander
// of null leaves it out for the default.
export const MOB_DEFAULTS = { creature: null, levels: 1, respawn: 300, yaw: 0, wander: null };

const mobSettings = ({ creature, levels, respawn, yaw, wander }) => {
  const out = { creature, levels, respawn, yaw };
  if (wander !== null && wander !== undefined) out.wander = wander;
  return out;
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
    this.restPoints = []; // every continent's
    this.spawns = null; // spawns.json as the world had it
    this.placed = []; // its placed list: mobs, and NPCs kept as they are
    this.mobVersion = 0;
    this.creatures = new Map(); // id -> the world's creature
    this.mobSettings = { ...MOB_DEFAULTS };
    this.meshes = new Map(); // dummy, rest point or mob -> its mesh
    this.spawnShown = null;
    this.tool = null; // "unitSelect", "dummy", "rest", "mob" or "spawn"
    this.picked = null; // the dummy, rest point or mob picked out with select
    this.dragging = null; // { unit, moved } while one's dragged
    this.onChange = () => {};
    this.onPick = () => {}; // (picked) when what's picked changes
    this.onMobs = () => {}; // when a placed mob changes
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

  // Reads this continent's spawns.json, or null for none.
  loadSpawns(json) {
    this.spawns = json;
    this.placed = [...(json?.placed ?? [])];
    this.pick(null);
    this.draw();
  }

  // spawns.json as it is now, with the mobs as placed.
  spawnsJSON() {
    return { ...this.spawns, version: 1, regions: this.spawns?.regions ?? [], placed: this.placed };
  }

  // The mobs placed on this continent.
  mobs() {
    return this.placed.filter((p) => p.creature);
  }

  isMob(unit) {
    return Boolean(unit?.creature);
  }

  // The world's creatures, which the mob tool can put down.
  setCreatures(list) {
    this.creatures = new Map(list.map((c) => [c.id, c]));
    if (!this.creatures.has(this.mobSettings.creature)) this.mobSettings.creature = list[0]?.id ?? null;
    this.draw();
    if (this.tool === "mob") this.setTool("mob");
  }

  // Changes the picked mob's settings, or else what the mob tool puts down next.
  setMob(settings) {
    if (!this.isMob(this.picked)) {
      Object.assign(this.mobSettings, settings);
      if (this.tool === "mob") this.setTool("mob");
      return;
    }
    const mob = this.picked;
    const next = mobSettings({ ...mob, wander: mob.wander ?? null, ...settings });
    for (const key of Object.keys(MOB_DEFAULTS)) delete mob[key];
    Object.assign(mob, next);
    this.draw();
    this.mobChanged();
  }

  mobChanged() {
    this.mobVersion += 1;
    this.onMobs();
  }

  // A placed mob drawn as its creature looks, or as a dummy if the world has no such creature.
  mobMesh(mob, material) {
    const creature = this.creatures.get(mob.creature);
    const mesh = creature ? characterMesh({ ...resolveRecipe(creature.look ?? {}, seeded(mob.id ?? mob.creature)), sheathed: true }) : dummyMesh(material);
    mesh.userData.character = Boolean(creature);
    mesh.rotation.y = ((mob.yaw ?? 0) * Math.PI) / 180;
    return mesh;
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

  // Where a unit stands, [x, z]: a mob's at is [x, y, z].
  static spot(unit) {
    return unit.at.length === 3 ? [unit.at[0], unit.at[2]] : unit.at;
  }

  stand(mesh, [x, z]) {
    mesh.position.set(x, this.groundAt(x, z), z);
  }

  // Draws the dummies, rest points, mobs and the spawn point again, as they are.
  draw() {
    for (const mesh of this.meshes.values()) {
      this.group.remove(mesh);
      if (mesh.userData.character) disposeCharacter(mesh);
    }
    this.meshes.clear();
    const add = (unit, mesh) => {
      mesh.userData.unit = unit;
      this.stand(mesh, Units.spot(unit));
      this.meshes.set(unit, mesh);
      this.group.add(mesh);
    };
    for (const dummy of this.here()) add(dummy, dummyMesh(this.solid));
    for (const rest of this.here(this.restPoints)) add(rest, restPointMesh(this.solid.rest));
    for (const mob of this.mobs()) add(mob, this.mobMesh(mob, this.solid));
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
    for (const [unit, mesh] of this.meshes) this.stand(mesh, Units.spot(unit));
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
    if (this.ghost) {
      this.scene.remove(this.ghost);
      if (this.ghost.userData.character) disposeCharacter(this.ghost);
    }
    const mobGhost = () => (this.creatures.has(this.mobSettings.creature) ? this.mobMesh(mobSettings(this.mobSettings), this.ghostLook) : null);
    const ghosts = { dummy: () => dummyMesh(this.ghostLook), rest: () => restPointMesh(this.ghostLook.rest), mob: mobGhost, spawn: () => spawnMesh(this.ghostLook) };
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
      unit.at = this.isMob(unit) ? at.map(round) : [round(at[0]), round(at[2])];
      this.stand(this.meshes.get(unit), Units.spot(unit));
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
    if (this.tool === "mob") {
      if (!this.creatures.has(this.mobSettings.creature)) return;
      this.placed.push({ id: placedId(this.placed), ...mobSettings(this.mobSettings), at: at.map(round) });
      this.draw();
      this.mobChanged();
      return;
    }
    const spot = { continent: this.continent, at: [round(at[0]), round(at[2])] };
    if (this.tool === "dummy") this.dummies.push(spot);
    else if (this.tool === "rest") this.restPoints.push({ id: restPointId(this.restPoints), name: `Rest point ${this.here(this.restPoints).length + 1}`, ...spot });
    else if (this.tool === "spawn") this.spawn = spot;
    else return;
    this.draw();
    this.changed();
  }

  up() {
    if (this.dragging?.moved) {
      if (this.isMob(this.dragging.unit)) this.mobChanged();
      else this.changed();
    }
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
    if (this.isMob(this.picked)) {
      this.placed = this.placed.filter((p) => p !== this.picked);
      this.pick(null);
      this.draw();
      this.mobChanged();
      return true;
    }
    this.dummies = this.dummies.filter((d) => d !== this.picked);
    this.restPoints = this.restPoints.filter((r) => r !== this.picked);
    this.pick(null);
    this.draw();
    this.changed();
    return true;
  }
}
