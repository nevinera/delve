import * as THREE from "three";
import { dueBy, emitsFor, isParticleEffect, particleSpec } from "./particleStock.js";
import { DESKTOP_PARTICLES, ParticleField } from "./particles.js";
import { playSound } from "./sounds.js";
import { SCHOOL_COLORS } from "./stock.js";
import { abilityTimeline } from "./timeline.js";
import { disposeVisual, makeVisual } from "./visuals.js";

// Plays abilities' timelines in a scene: clips on who uses them, visuals, sounds and projectiles.
// Both the class editor's preview and the play page use it. Neither decides what an ability does
// from this: a `hit` is just told to whoever's playing it.
//
// A unit is { mesh, height, clip(role, loop) }: the mesh stands where the unit does, and faces its
// way, and clip(null) lets it go back to what it was doing.

const AREA_OPACITY = 0.35;
const AREA_S = 0.8;
const ABOVE_GROUND_FT = 0.15;

export const chestOf = (unit) => unit.mesh.position.clone().add(new THREE.Vector3(0, unit.height * 0.6, 0));

// Where a projectile starts: the unit's right hand, or its chest for a body with none.
function handOf(unit) {
  unit.mesh.updateMatrixWorld(true);
  const hand = unit.mesh.skeleton?.getBoneByName("hand_r");
  return hand ? hand.getWorldPosition(new THREE.Vector3()) : chestOf(unit);
}

// What to play for a role a body has no clip of its own for.
const NEAREST_ROLE = { pray: "cast", released: "bigAttack" };

// The clip a role plays on a body with these role clips, or a spell's holding clip for "channel".
export function clipNameFor(role, roles, clips) {
  if (role !== "channel") return roles[role] ?? roles[NEAREST_ROLE[role]] ?? roles.idle;
  return clips.has("Spell_Simple_Idle_Loop") ? "Spell_Simple_Idle_Loop" : roles.cast ?? roles.idle;
}

export class AbilityStage {
  // scene: where visuals go. audio: gives an AudioContext, or null to keep quiet.
  constructor(scene, { audio = () => null, particles = DESKTOP_PARTICLES } = {}) {
    Object.assign(this, { scene, audio });
    this.particles = new ParticleField(scene, { capacity: particles });
    this.t = 0;
    this.runs = [];
    this.alive = []; // visuals playing: { visual, at, flying }
  }

  // Starts an ability. caster and target are units; target can be null. spot: a Vector3 on the
  // ground for one aimed there. on: { hit(event), bar(event) }. Returns the run, to stop it with.
  play(ability, { caster, target = null, spot = null, ranged = false, distance, on = {} }) {
    const to = distance ?? (spot ?? target?.mesh.position)?.distanceTo(caster.mesh.position) ?? 0;
    const line = abilityTimeline(ability, { distance: to, ranged });
    const run = { ability, caster, target, spot, on, line, t: 0, next: 0, moves: [] };
    this.runs.push(run);
    return run;
  }

  // Ends a run where it is. What it's already let go carries on.
  stop(run) {
    this.runs = this.runs.filter((r) => r !== run);
    // Someone can have a newer one going, with a bolt of an older one still in the air.
    if (!this.runs.some((r) => r.caster.mesh === run.caster.mesh)) run.caster.clip(null);
    run.on.bar?.(null);
  }

  // Ends every run and takes every visual away.
  clear() {
    for (const run of [...this.runs]) this.stop(run);
    for (const { visual } of this.alive) disposeVisual(visual);
    this.alive = [];
    this.particles.clear();
  }

  frame(dt) {
    this.t += dt;
    this.particles.frame(this.t);
    for (const run of [...this.runs]) {
      run.t += dt;
      const { events, duration } = run.line;
      while (run.next < events.length && events[run.next].at <= run.t) this.fire(run, events[run.next++]);
      if (run.t >= duration) this.stop(run);
    }
    this.draw();
  }

  pointOf(run, on) {
    if (on === "ground") return run.spot ? run.spot.clone() : (run.target ?? run.caster).mesh.position.clone();
    return (on === "caster" ? run.caster : run.target ?? run.caster).mesh.position.clone();
  }

  spawn(name, options, place) {
    const visual = isParticleEffect(name) ? this.emitter(name, options) : makeVisual(name, options);
    if (place) visual.group.position.add(place);
    this.scene.add(visual.group);
    const live = { visual, at: this.t };
    this.alive.push(live);
    return live;
  }

  // A particle effect as a visual: nothing to draw of its own, it lets particles go from where its
  // group is, while it lasts. options.params: its parameters; options.follow: the mesh it stays on;
  // options.way: which way "forward" is, for one with that direction.
  emitter(name, { colors = SCHOOL_COLORS.physical, scale = 1, params = {}, follow = null, way = [0, 0, 1], up = 0, floor = -Infinity }) {
    const spec = particleSpec(name, { ...params, scale });
    const group = new THREE.Group();
    const direction = spec.direction === "forward" ? way : [0, 1, 0];
    // A clip can carry a body away from where its unit stands, so it goes by the pelvis if there's one.
    const pelvis = follow?.skeleton?.getBoneByName("pelvis");
    const body = new THREE.Vector3();
    const emitted = [];
    let sent = 0;
    const update = (u) => {
      if (follow) {
        group.position.copy(follow.position).setY(follow.position.y + up);
        if (pelvis) {
          pelvis.getWorldPosition(body);
          group.position.setX(body.x).setZ(body.z);
        }
      }
      const due = dueBy(spec, u);
      if (due > sent) emitted.push(this.particles.emit(spec, due - sent, group.position.toArray(), colors, direction, floor));
      sent = Math.max(sent, due);
    };
    return { group, length: Math.max(0.02, emitsFor(spec)), update, fadeOut: () => this.particles.fadeOut(emitted) };
  }

  fire(run, event) {
    switch (event.kind) {
      case "clip":
        run.caster.clip(event.role, event.loop);
        break;
      case "bar":
        run.on.bar?.(event);
        break;
      case "visual":
        this.fireVisual(run, event);
        break;
      case "sound": {
        const context = this.audio();
        if (context) playSound(context, event.sound, { volume: event.volume, pitch: event.pitch });
        break;
      }
      case "projectile": {
        const from = handOf(run.caster);
        const live = this.spawn(event.effect, { colors: event.colors, scale: event.scale, params: event.params });
        live.visual.group.position.copy(from);
        live.flying = { from, to: run.target ?? run.caster, until: run.t + (event.until - event.at) };
        live.flying.start = run.t;
        live.run = run;
        for (const trail of event.trails ?? []) {
          const left = event.until - event.at;
          this.spawn(trail.effect, { colors: trail.colors, scale: trail.params.scale ?? 1, params: { ...trail.params, duration: trail.params.duration ?? left }, follow: live.visual.group });
        }
        break;
      }
      case "area":
        this.showArea(run, event);
        break;
      case "hit":
        run.on.hit?.(event);
        break;
    }
  }

  fireVisual(run, event) {
    const { on, colors, scale } = event;
    const unit = on === "caster" ? run.caster : run.target ?? run.caster;
    const height = on === "ground" ? 6 : unit.height;
    if (isParticleEffect(event.effect)) {
      const spec = particleSpec(event.effect, event.params);
      const up = on !== "ground" && spec.at === "chest" ? chestOf(unit).y - unit.mesh.position.y : 0;
      const yaw = run.caster.mesh.rotation.y;
      const follow = on === "ground" ? null : unit.mesh;
      const floor = on === "ground" ? this.pointOf(run, "ground").y : unit.mesh.position.y;
      const live = this.spawn(event.effect, { colors, scale, params: event.params, follow, up, floor, way: [Math.sin(yaw), 0, Math.cos(yaw)] }, on === "ground" ? this.pointOf(run, "ground") : null);
      if (event.heldByCast) live.heldBy = run;
      return;
    }
    if (event.effect === "beam") {
      const to = on === "ground" ? this.pointOf(run, "ground") : chestOf(unit);
      const live = this.spawn("beam", { colors, scale, params: event.params, from: handOf(run.caster).toArray(), to: to.toArray() });
      if (event.heldByCast) live.heldBy = run;
    } else if (event.effect === "bolt" || event.effect === "arrow") {
      this.spawn(event.effect, { colors, scale, height, params: event.params }, on === "ground" ? this.pointOf(run, "ground") : chestOf(unit));
    } else {
      const live = this.spawn(event.effect, { colors, scale, height, params: event.params }, this.pointOf(run, on));
      if (event.heldByCast) live.heldBy = run;
      // What faces a way faces where the caster does.
      if (["cone", "slash"].includes(event.effect) && on === "caster") live.visual.group.rotation.y = run.caster.mesh.rotation.y;
    }
  }

  // Marks the ground an area effect covers: a flat disc, or a slice of one the way the caster faces.
  showArea(run, { radius, cone, around, colors }) {
    const center = around === "ground" ? this.pointOf(run, "ground") : around === "target" ? this.pointOf(run, "target") : run.caster.mesh.position.clone();
    const length = cone ? (cone / 360) * Math.PI * 2 : Math.PI * 2;
    const start = cone ? -length / 2 : 0; // along +x, and the mesh turns it
    const geometry = new THREE.CircleGeometry(radius, 64, start, length).rotateX(-Math.PI / 2);
    const mesh = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({ color: colors[0], transparent: true, opacity: AREA_OPACITY, depthWrite: false, side: THREE.DoubleSide }));
    mesh.position.copy(center).setY(center.y + ABOVE_GROUND_FT);
    mesh.rotation.y = run.caster.mesh.rotation.y - Math.PI / 2;
    const group = new THREE.Group();
    group.add(mesh);
    this.scene.add(group);
    this.alive.push({ at: this.t, visual: { group, length: AREA_S, update: (u) => (mesh.material.opacity = AREA_OPACITY * (1 - u)) } });
  }

  draw() {
    this.alive = this.alive.filter((live) => {
      const { visual, at, flying } = live;
      if (flying) {
        const t = live.run.t;
        const u = Math.min(1, (t - flying.start) / Math.max(0.001, flying.until - flying.start));
        const to = chestOf(flying.to);
        visual.group.position.copy(flying.from).lerp(to, u);
        visual.group.lookAt(to);
        visual.update((t - flying.start) % 1);
        // A run stopped mid-flight has no more time, so it lands where it's got to.
        if (u < 1 && this.runs.includes(live.run)) return true;
      } else {
        const u = (this.t - at) / visual.length;
        // One held by a cast ends with it, if the cast is cut short.
        if (u < 1 && (!live.heldBy || this.runs.includes(live.heldBy))) {
          visual.update(Math.max(0, u));
          return true;
        }
      }
      if (live.heldBy) visual.fadeOut?.();
      disposeVisual(visual);
      return false;
    });
  }
}

