import * as THREE from "three";
import { dueBy, emitsFor, isParticleEffect, particleSpec } from "./particleStock.js";
import { DESKTOP_PARTICLES, ParticleField } from "./particles.js";
import { DESKTOP_SOUNDS, SoundMixer, fetchSounds } from "./sounds.js";
import { SCHOOL_COLORS } from "./stock.js";
import { abilityTimeline } from "./timeline.js";
import { discGeometry, drape } from "./decal.js";
import { DECALS } from "./shapeStock.js";
import { disposeVisual, makeVisual } from "./visuals.js";

// Plays abilities' timelines in a scene: clips on who uses them, visuals, sounds and projectiles.
// Both the class editor's preview and the play page use it. Neither decides what an ability does
// from this: a `hit` is just told to whoever's playing it.
//
// A unit is { mesh, height, clip(role, loop) }: the mesh stands where the unit does, and faces its
// way, and clip(null) lets it go back to what it was doing.

const AREA_OPACITY = 0.35;
const AREA_S = 0.8;

const MOST_EMITTED = 256; // batches a long-lasting effect remembers, to fade out when it ends
const AURA_IN_S = 0.25;
const AURA_OUT_S = 0.3;
const SHAKE_S = 0.25;
const LUNGE_BACK_S = 0.25;
const LUNGE_CLEAR_FT = 3; // how far from its target a lunge stops
const PLAIN_SWING = { name: "swing", plainSwing: true, range: "melee", school: "physical", animation: "attack", sounds: [{ sound: "whoosh", when: "launch", volume: 0.5, pitchVariation: 0.08 }] };
const BLADE_STARTS = 0.55; // how far along a weapon from its grip to its tip a ribbon starts
const BARE_HAND = new THREE.Vector3(0, 0.35, 0); // how wide a ribbon off a bare hand is

export const chestOf = (unit) => unit.mesh.position.clone().add(new THREE.Vector3(0, unit.height * 0.6, 0));

// Where a projectile starts: the unit's right hand, or its chest for a body with none.
function handOf(unit) {
  unit.mesh.updateMatrixWorld(true);
  const hand = unit.mesh.skeleton?.getBoneByName("hand_r");
  return hand ? hand.getWorldPosition(new THREE.Vector3()) : chestOf(unit);
}

// What a ribbon on this unit follows: the blade of the weapon in its hand, or its hand, or its chest.
export function traceOf(unit) {
  const inHand = () => {
    const item = unit.mesh.userData?.held?.[0];
    return item && item.parent === item.userData.places?.inHand.parent ? item : null;
  };
  return {
    edges(a, b) {
      const item = inHand();
      if (!item) {
        a.copy(handOf(unit));
        b.copy(a).add(BARE_HAND);
        return;
      }
      if (!item.geometry.boundingBox) item.geometry.computeBoundingBox();
      const tip = item.geometry.boundingBox.max.y;
      item.updateWorldMatrix(true, false);
      item.localToWorld(a.set(0, tip * BLADE_STARTS, 0));
      item.localToWorld(b.set(0, tip, 0));
    },
  };
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
  // ground(x, z): how high the ground is there, or null. Left out, it's flat.
  constructor(scene, { audio = () => null, particles = DESKTOP_PARTICLES, ground = null, sounds = DESKTOP_SOUNDS } = {}) {
    Object.assign(this, { scene, audio, ground, soundLimit: sounds });
    fetchSounds();
    this.particles = new ParticleField(scene, { capacity: particles });
    this.t = 0;
    this.runs = [];
    this.alive = []; // visuals playing: { visual, at, flying, heldStill }
    this.lunges = [];
    this.holds = new Map(); // by mesh: { mixer, until }
    this.shaking = null;
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
    // A plain swing doesn't hold on to a clip, or a cancelled cast would keep looping through it.
    if (!this.runs.some((r) => r.caster.mesh === run.caster.mesh && !r.ability.plainSwing)) run.caster.clip(null);
    run.on.bar?.(null);
  }

  // Ends every run and takes every visual away.
  clear() {
    for (const run of [...this.runs]) this.stop(run);
    for (const { visual } of this.alive) disposeVisual(visual);
    this.alive = [];
    for (const lunge of this.lunges) lunge.mesh.position.sub(lunge.offset);
    this.lunges = [];
    for (const { mixer } of this.holds.values()) mixer.timeScale = 1;
    this.holds.clear();
    this.shaking = null;
    this.particles.clear();
  }

  frame(dt) {
    this.t += dt;
    this.particles.frame(this.t);
    this.holding(dt);
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
    const put = () => {
      if (follow) {
        group.position.copy(follow.position).setY(follow.position.y + up);
        if (pelvis) {
          pelvis.getWorldPosition(body);
          group.position.setX(body.x).setZ(body.z);
        }
      }
    };
    const letGo = (due) => {
      if (due > sent) emitted.push(this.particles.emit(spec, due - sent, group.position.toArray(), colors, direction, floor));
      sent = Math.max(sent, due);
    };
    const update = (u) => {
      put();
      letGo(dueBy(spec, u));
    };
    // For as long as it's wanted: it goes on at its rate, or lets go its count again as the last die.
    let stopped = false;
    const sustain = (time) => {
      if (stopped) return;
      put();
      letGo(spec.rate > 0 ? spec.count + Math.floor(spec.rate * time) : spec.count * (1 + Math.floor(time / Math.max(0.5, spec.lifetime))));
      if (emitted.length > MOST_EMITTED) emitted.shift();
    };
    const fadeOut = () => {
      stopped = true;
      this.particles.fadeOut(emitted);
    };
    return { group, length: Math.max(0.02, emitsFor(spec)), update, sustain, fadeOut };
  }

  fire(run, event) {
    switch (event.kind) {
      case "clip":
        run.caster.clip(event.role, event.loop, event.speed);
        break;
      case "bar":
        run.on.bar?.(event);
        break;
      case "visual":
        this.fireVisual(run, event);
        break;
      case "sound": {
        const { sound, on, volume, pitch, pitchVariation, delay } = event;
        this.sound(sound, { volume, pitch, pitchVariation, delay, at: this.pointOf(run, on).toArray(), mine: run.on.mine });
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
      case "lunge":
        this.lunge(run, event);
        break;
      case "pause":
        this.hold(run.caster, event.seconds);
        this.hold(run.target, event.seconds);
        break;
      case "shake":
        run.on.shake?.(event.strength);
        break;
      case "hit":
        run.on.hit?.(event);
        break;
    }
  }

  // Sets a visual going, and gives back what's playing. params.follow says if it stays on who it's on
  // or stays where it started. Particles follow unless they say not to, and the rest don't unless
  // they say to. A ribbon always follows the blade or projectile it trails after.
  fireVisual(run, event) {
    const { on, colors, scale, params } = event;
    const unit = on === "caster" ? run.caster : run.target ?? run.caster;
    const height = on === "ground" ? 6 : unit.height;
    const follows = on !== "ground" && (params?.follow ?? isParticleEffect(event.effect));
    const held = (live) => {
      if (event.heldByCast) live.heldBy = run;
      return live;
    };
    if (isParticleEffect(event.effect)) {
      const spec = particleSpec(event.effect, params);
      const up = on !== "ground" && spec.at === "chest" ? chestOf(unit).y - unit.mesh.position.y : 0;
      const yaw = run.caster.mesh.rotation.y;
      const floor = on === "ground" ? this.pointOf(run, "ground").y : unit.mesh.position.y;
      const place = on === "ground" ? this.pointOf(run, "ground") : follows ? null : unit.mesh.position.clone().setY(unit.mesh.position.y + up);
      return held(this.spawn(event.effect, { colors, scale, params, follow: follows ? unit.mesh : null, up, floor, way: [Math.sin(yaw), 0, Math.cos(yaw)] }, place));
    }
    if (DECALS.includes(event.effect)) {
      const at = this.pointOf(run, on);
      return held(this.stick(this.spawn(event.effect, { colors, scale, params, at, ground: this.ground }), follows, unit));
    }
    if (event.effect === "ribbon") {
      const live = this.spawn("ribbon", { colors, scale, params, trace: traceOf(unit) });
      live.heldStill = unit.mesh;
      return held(live);
    }
    if (event.effect === "beam") {
      const end = () => (on === "ground" ? this.pointOf(run, "ground") : chestOf(unit)).toArray();
      const live = this.spawn("beam", { colors, scale, params, from: handOf(run.caster).toArray(), to: end() });
      // It reaches from wherever its caster is to wherever it's going.
      if (params?.follow) live.aims = () => live.visual.aim(handOf(run.caster).toArray(), end());
      return held(live);
    }
    if (event.effect === "bolt" || event.effect === "arrow") {
      const live = this.spawn(event.effect, { colors, scale, height, params }, on === "ground" ? this.pointOf(run, "ground") : chestOf(unit));
      return held(this.stick(live, follows, unit));
    }
    const live = this.spawn(event.effect, { colors, scale, height, params }, this.pointOf(run, on));
    // What faces a way faces where the caster does.
    const faces = ["cone", "slash"].includes(event.effect) && on === "caster";
    if (faces) live.visual.group.rotation.y = run.caster.mesh.rotation.y;
    return held(this.stick(live, follows, unit, faces));
  }

  // Keeps a visual where it is on a unit, as the unit moves.
  stick(live, follows, unit, faces = false) {
    if (follows) live.sticksTo = { mesh: unit.mesh, faces, offset: live.visual.group.position.clone().sub(unit.mesh.position) };
    return live;
  }

  // Puts what follows someone where they are now.
  placeFollowers() {
    const place = new THREE.Vector3();
    for (const { visual, sticksTo, aims } of this.alive) {
      aims?.();
      if (!sticksTo) continue;
      place.copy(sticksTo.mesh.position).add(sticksTo.offset);
      if (visual.moveTo) visual.moveTo(place);
      else visual.group.position.copy(place);
      if (sticksTo.faces) visual.group.rotation.y = sticksTo.mesh.rotation.y;
    }
  }

  // Plays a status's look on whoever has it, with these colors if it has none of its own. It follows
  // them unless it says not to. With a duration of "status" it carries on until endAura, or for
  // `lasts` seconds if that's given.
  aura(unit, aura, colors = ["#ffffff", "#ffffff"], { lasts = null } = {}) {
    const sustained = aura.duration === "status";
    const params = { ...aura, follow: aura.follow ?? true, ...(sustained ? { duration: undefined } : {}) };
    const event = { effect: aura.effect, on: "caster", colors: aura.colors?.length === 2 ? aura.colors : colors, scale: aura.scale ?? 1, params };
    const live = this.fireVisual({ caster: unit, target: unit, spot: null }, event);
    if (sustained) {
      live.sustained = true;
      live.endsAt = lasts === null ? null : this.t + lasts;
    }
    return live;
  }

  // Starts a status-long aura fading away.
  endAura(live) {
    if (live.ending !== undefined) return;
    live.ending = this.t;
    live.visual.fadeOut?.();
  }

  // Draws a status-long aura, and says if it's still going.
  sustain(live) {
    const { visual, at, endsAt } = live;
    if (endsAt !== null && this.t >= endsAt) this.endAura(live);
    const time = this.t - at;
    const left = live.ending === undefined ? 1 : 1 - (this.t - live.ending) / AURA_OUT_S;
    if (left <= 0) {
      disposeVisual(visual);
      return false;
    }
    visual.sustain?.(time, Math.min(1, time / AURA_IN_S) * left);
    return true;
  }

  // Plays a stock sound, if there's anything to play it on (sounds.js says what options it takes).
  sound(name, options) {
    const context = this.audio();
    if (!context) return null;
    this.mixer ??= new SoundMixer(context, { limit: this.soundLimit });
    return this.mixer.play(name, options);
  }

  // Puts your ears at `at`, where your character is, or else where the camera is.
  hear(camera, at = null) {
    this.mixer?.hear(camera, at);
  }

  // A plain swing, one that isn't an ability. look: what statuses make of it (timeline.js's swingLook).
  swing(caster, target, on, look = {}) {
    return this.play({ ...PLAIN_SWING, ...look }, { caster, target, on });
  }

  // Leans a body in toward its target, in what's drawn only, and no closer than it can stand.
  lunge(run, { feet, strikes, at }) {
    const { caster, target } = run;
    const toward = new THREE.Vector3();
    if (target && target !== caster) toward.subVectors(target.mesh.position, caster.mesh.position).setY(0);
    const off = toward.length();
    if (off > 0.01) toward.multiplyScalar(Math.min(feet, Math.max(0, off - LUNGE_CLEAR_FT)) / off);
    else toward.set(Math.sin(caster.mesh.rotation.y), 0, Math.cos(caster.mesh.rotation.y)).multiplyScalar(feet);
    this.lunges.push({ mesh: caster.mesh, toward, from: this.t, peak: strikes - at, offset: new THREE.Vector3(), last: new THREE.Vector3(Infinity, 0, 0) });
  }

  // Holds a unit's clips still, and the trails on it.
  hold(unit, seconds) {
    if (!unit?.mixer) return;
    unit.mixer.timeScale = 0;
    this.holds.set(unit.mesh, { mixer: unit.mixer, until: this.t + seconds });
  }

  // Shakes the camera, which shakeOffset gives you.
  shake(strength) {
    this.shaking = { strength, at: this.t };
  }

  // How far off to draw the camera this frame.
  shakeOffset() {
    const { strength, at } = this.shaking ?? { strength: 0, at: 0 };
    const left = Math.max(0, 1 - (this.t - at) / SHAKE_S);
    const size = strength * left * left;
    return new THREE.Vector3(Math.sin(this.t * 71) * size, Math.sin(this.t * 83 + 1) * size, 0);
  }

  // Moves lunging bodies to where they're drawn. Call it once the game has put everyone in place, as
  // it's about to draw them. A body nothing's moved since has last frame's lean taken off first.
  place() {
    this.placeFollowers();
    this.lunges = this.lunges.filter((lunge) => {
      const { mesh, toward, from, peak, offset, last } = lunge;
      if (mesh.position.equals(last)) mesh.position.sub(offset);
      const t = this.t - from;
      const lean = t < peak ? Math.sin(((t / peak) * Math.PI) / 2) : Math.cos((Math.min(1, (t - peak) / LUNGE_BACK_S) * Math.PI) / 2);
      offset.copy(toward).multiplyScalar(lean);
      mesh.position.add(offset);
      last.copy(mesh.position);
      return t < peak + LUNGE_BACK_S;
    });
  }

  // Lets go of what's held once its time's up, and keeps trails on what's still held from ageing.
  holding(dt) {
    for (const [mesh, { mixer, until }] of this.holds) {
      if (this.t >= until) {
        mixer.timeScale = 1;
        this.holds.delete(mesh);
      } else {
        for (const live of this.alive) if (live.heldStill === mesh) live.at += dt;
      }
    }
  }

  // Marks the ground an area effect covers: a flat disc, or a slice of one the way the caster faces.
  showArea(run, { radius, cone, around, colors }) {
    const center = around === "ground" ? this.pointOf(run, "ground") : around === "target" ? this.pointOf(run, "target") : run.caster.mesh.position.clone();
    const length = cone ? (cone / 360) * Math.PI * 2 : Math.PI * 2;
    const start = cone ? -length / 2 : 0; // along +x, and the mesh turns it
    const geometry = discGeometry({ radius, start, sweep: length });
    const mesh = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({ color: colors[0], transparent: true, opacity: AREA_OPACITY, depthWrite: false, side: THREE.DoubleSide }));
    mesh.position.copy(center);
    mesh.rotation.y = run.caster.mesh.rotation.y - Math.PI / 2;
    drape(geometry, center, this.ground, mesh.rotation.y);
    const group = new THREE.Group();
    group.add(mesh);
    this.scene.add(group);
    this.alive.push({ at: this.t, visual: { group, length: AREA_S, update: (u) => (mesh.material.opacity = AREA_OPACITY * (1 - u)) } });
  }

  draw() {
    this.alive = this.alive.filter((live) => {
      if (live.sustained) return this.sustain(live);
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

