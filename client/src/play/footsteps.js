// Plays footsteps for whoever's moving, from how far they've gone, so they keep up with any speed.
// Nothing here moves anyone: it only watches where they're drawn.

const MOVING_FT_S = 3.5; // slower than this is a lean or a shuffle, with no steps in it
const TELEPORT_FT = 10; // further than this in one frame isn't walking
const OFF_GROUND_FT = 0.5;
const MINE_VOLUME = 0.5;
const THEIR_VOLUME = 0.4;

// Which stock sound each of look.js's patterns makes, other than soft ground. Snow's crunch is the nearest thing to sand.
const STEP_ON = { rock: "step-stone", sand: "step-snow" };

export const stepSoundOn = (pattern) => STEP_ON[pattern] ?? "step-grass";

// How far apart a body's steps land at this speed: longer the faster it goes, and the taller it is.
export const stepFt = (speed, height) => (1.6 + speed * 0.14) * (height / 6);

export class Footsteps {
  // play(sound, options): plays a stock sound. ground: { heightAt, waterAt, patternAt }, all by
  // scene feet.
  constructor(play, ground) {
    Object.assign(this, { play, ground });
    this.walkers = new Map(); // mesh -> { x, z, gone }
  }

  // units: everyone to listen for, each { mesh, height, mine }.
  frame(dt, units) {
    if (dt <= 0) return;
    const seen = new Set();
    for (const { mesh, height, mine } of units) {
      seen.add(mesh);
      const { x, y, z } = mesh.position;
      const was = this.walkers.get(mesh);
      if (!was) {
        this.walkers.set(mesh, { x, z, gone: 0 });
        continue;
      }
      const moved = Math.hypot(x - was.x, z - was.z);
      [was.x, was.z] = [x, z];
      const speed = moved / dt;
      if (moved > TELEPORT_FT || speed < MOVING_FT_S || this.afloat(x, y, z)) {
        // The first step comes soon after they set off.
        was.gone = stepFt(speed, height) / 2;
        continue;
      }
      was.gone += moved;
      const stride = stepFt(speed, height);
      if (was.gone < stride) continue;
      was.gone -= stride;
      this.play(stepSoundOn(this.ground.patternAt(x, z)), { at: [x, y, z], mine, volume: mine ? MINE_VOLUME : THEIR_VOLUME, pitchVariation: 0.08 });
    }
    for (const mesh of this.walkers.keys()) if (!seen.has(mesh)) this.walkers.delete(mesh);
  }

  // Whether they're off the ground, or in water deep enough that a step wouldn't sound like one.
  afloat(x, y, z) {
    const ground = this.ground.heightAt(x, z);
    if (ground === null || ground === undefined) return true;
    const water = this.ground.waterAt(x, z);
    return y > ground + OFF_GROUND_FT || (Number.isFinite(water) && water > ground);
  }
}
