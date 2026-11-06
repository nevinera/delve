import * as THREE from "three";

// Plays a footstep each time someone puts a foot down: at the walk cycle's footfalls, when a foot
// bone stops coming down, and on landing from a jump or fall. Nothing here moves anyone: it only
// watches where they're drawn. Every ground sounds the same for now.

const MOVING_FT_S = 3.5; // slower than this is a lean or a shuffle, with no steps in it
const TELEPORT_FT = 10; // further than this in one frame isn't walking
const OFF_GROUND_FT = 0.5;
const LANDED_AFTER_S = 0.25; // in the air this long, coming down makes a step
const FOOTFALL_LOW = 0.35; // a foot's down in the lowest this share of how high it's been lately
const FOOTFALL_APART_S = 0.15; // the soonest one body steps again
const FEET = ["foot_l", "foot_r"];
const VOLUME = 0.0014; // the footstep recording is quiet already, and steps should sit well under everything
const THEIRS = 0.7; // others' are this much of yours
const LANDING = 1.4; // coming down is this much louder, and a little lower

// The kind of ground a step's on, from look.js's patterns: rock, sand, or soft for the rest.
export const groundOf = (pattern) => (pattern === "rock" || pattern === "sand" ? pattern : "soft");

// How a step sounds: play(name, options) as SoundMixer takes them. It's the same on all ground.
export const stepSound = ({ mine, landing }) => ({ volume: VOLUME * (mine ? 1 : THEIRS) * (landing ? LANDING : 1), pitch: landing ? 0.9 : 1, pitchVariation: 0.04, mine });

const at = new THREE.Vector3();

export class Footsteps {
  // step(kind, { at, mine, landing }): a foot's come down on that kind of ground. ground:
  // { heightAt, waterAt, patternAt }, all by scene feet.
  constructor(step, ground) {
    Object.assign(this, { step, ground });
    this.walkers = new Map(); // mesh -> what's kept of how it's been moving
    this.t = 0;
  }

  // units: everyone to listen for, each { mesh, height, mine }.
  frame(dt, units) {
    if (dt <= 0) return;
    this.t += dt;
    const seen = new Set();
    for (const unit of units) {
      seen.add(unit.mesh);
      this.watch(dt, unit);
    }
    for (const mesh of this.walkers.keys()) if (!seen.has(mesh)) this.walkers.delete(mesh);
  }

  watch(dt, { mesh, mine }) {
    const { x, y, z } = mesh.position;
    const was = this.walkers.get(mesh);
    if (!was) {
      this.walkers.set(mesh, { x, z, aloft: 0, feet: new Map(), last: -Infinity });
      return;
    }
    const moved = Math.hypot(x - was.x, z - was.z);
    [was.x, was.z] = [x, z];
    const speed = moved / dt;
    const afloat = this.afloat(x, y, z);
    const kind = () => groundOf(this.ground.patternAt(x, z));
    if (afloat) {
      was.aloft += dt;
      return;
    }
    // Coming down from the air.
    if (was.aloft > LANDED_AFTER_S) this.put(was, kind(), [x, y, z], mine, true);
    was.aloft = 0;
    const footfall = this.footfall(mesh, was);
    if (moved > TELEPORT_FT || speed < MOVING_FT_S) return;
    if (footfall) this.put(was, kind(), [x, y, z], mine, false);
  }

  put(was, kind, place, mine, landing) {
    if (!landing && this.t - was.last < FOOTFALL_APART_S) return;
    was.last = this.t;
    this.step(kind, { at: place, mine, landing });
  }

  // Whether a foot's just come down: it was dropping, and has stopped low in its swing.
  footfall(mesh, was) {
    let down = false;
    for (const name of FEET) {
      let foot = was.feet.get(name);
      if (!foot) {
        const bone = mesh.getObjectByName?.(name);
        if (!bone) continue;
        foot = { bone, h: null, falling: false, low: null, high: null };
        was.feet.set(name, foot);
      }
      const h = foot.bone.getWorldPosition(at).y - mesh.position.y;
      // How low and high it's been lately, easing toward now so a new gait or slope settles in.
      foot.low = foot.low === null ? h : Math.min(h, foot.low + (h - foot.low) * 0.02);
      foot.high = foot.high === null ? h : Math.max(h, foot.high + (h - foot.high) * 0.02);
      if (foot.h !== null) {
        const falling = h < foot.h - 1e-4;
        const low = h <= foot.low + (foot.high - foot.low) * FOOTFALL_LOW;
        if (foot.falling && !falling && low) down = true;
        foot.falling = falling;
      }
      foot.h = h;
    }
    return down;
  }

  // Whether they're off the ground, or in water deep enough that a step wouldn't sound like one.
  afloat(x, y, z) {
    const ground = this.ground.heightAt(x, z);
    if (ground === null || ground === undefined) return true;
    const water = this.ground.waterAt(x, z);
    return y > ground + OFF_GROUND_FT || (Number.isFinite(water) && water > ground);
  }
}
