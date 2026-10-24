import { WADE } from "../nav/navGrid.js";
import { findPath } from "../nav/astar.js";
import { lineOfSight } from "../nav/los.js";

export const UNIT_TYPES = {
  player: {radius: 1.5, run: 20, walk: 20, eye: 5.6},
  wolf: {radius: 2.0, run: 24, walk: 7, eye: 3.4, sight: 160, home: 60},
  goblin: {radius: 1.2, run: 15, walk: 5, eye: 3.6, sight: 120, home: 40},
};

const WADE_SPEED = 0.55;
const TURN_RATE = 10;
const REPATH_S = 0.6;
const LOS_EVERY_S = 0.2;
const FORGET_S = 4;
const ATTACK_S = 0.9;

// The simulation side of a unit: position, movement, and (for NPCs) a
// small wander/chase brain. No three.js here; render/ follows along.
export class Unit {
  constructor(kind, x, z, world) {
    this.kind = kind;
    this.type = UNIT_TYPES[kind];
    this.x = x;
    this.z = z;
    this.y = world.heightAt(x, z);
    this.heading = 0;
    this.speed = 0; // actual, for animation
    this.path = null;
    this.home = {x, z};
    this.state = "idle";
    this.timer = 1 + Math.random() * 2;
    this.lastSeen = -Infinity;
    this.losTimer = Math.random() * LOS_EVERY_S;
    this.repathTimer = 0;
    this.attack = 0;
    this.los = null; // last line-of-sight result toward the player
    this.sees = false;
  }

  eye() {
    return {x: this.x, y: this.y + this.type.eye, z: this.z};
  }

  // Tries to move by (dx, dz), sliding along whatever blocks it. Returns
  // the distance actually moved.
  step(ctx, dx, dz) {
    const {nav, world} = ctx;
    const r = this.type.radius;
    const tries = [[dx, dz], [dx, 0], [0, dz]];
    for (const [mx, mz] of tries) {
      if ((mx || mz) && nav.canStand(this.x + mx, this.z + mz, r)) {
        this.x += mx;
        this.z += mz;
        this.y = world.heightAt(this.x, this.z);
        return Math.hypot(mx, mz);
      }
    }
    return 0;
  }

  turnToward(dx, dz, dt) {
    if (!dx && !dz) return;
    const want = Math.atan2(dx, dz);
    let diff = want - this.heading;
    diff = Math.atan2(Math.sin(diff), Math.cos(diff));
    this.heading += Math.sign(diff) * Math.min(Math.abs(diff), TURN_RATE * dt);
  }

  // Moves along this.path at the given speed. Returns false when done.
  followPath(ctx, dt, speed) {
    if (!this.path?.length) return false;
    const next = this.path[0];
    const dx = next.x - this.x, dz = next.z - this.z;
    const dist = Math.hypot(dx, dz);
    const wading = ctx.nav.walk[ctx.nav.squareAt(this.x, this.z)] === WADE;
    const stepLen = Math.min(dist, speed * (wading ? WADE_SPEED : 1) * dt);
    if (dist < 0.5) {
      this.path.shift();
      return this.path.length > 0;
    }
    this.turnToward(dx, dz, dt);
    const moved = this.step(ctx, (dx / dist) * stepLen, (dz / dist) * stepLen);
    this.speed = moved / dt;
    if (moved === 0) this.path = null;
    return true;
  }

  pathTo(ctx, x, z) {
    this.path = findPath(ctx.nav, this, {x, z}, this.type.radius);
    return !!this.path;
  }

  // move is a world-space direction (length <= 1). turnToMove turns the
  // character to face it (joystick); otherwise facing is set by the caller
  // (keyboard turning, mouselook) and the move can be a strafe/backpedal.
  updatePlayer(ctx, dt, move, {turnToMove = true, speedScale = 1} = {}) {
    this.speed = 0;
    const input = move;
    if (input.x || input.z) {
      this.path = null;
      const wading = ctx.nav.walk[ctx.nav.squareAt(this.x, this.z)] === WADE;
      const len = this.type.run * speedScale * (wading ? WADE_SPEED : 1) * dt;
      if (turnToMove) this.turnToward(input.x, input.z, dt);
      this.speed = this.step(ctx, input.x * len, input.z * len) / dt;
    } else {
      this.followPath(ctx, dt, this.type.run);
    }
  }

  updateNpc(ctx, dt) {
    const {player, world, nav, time} = ctx;
    this.speed = 0;
    this.attack = Math.max(0, this.attack - dt / ATTACK_S);
    const dist = Math.hypot(player.x - this.x, player.z - this.z);

    this.losTimer -= dt;
    if (this.losTimer <= 0) {
      this.losTimer = LOS_EVERY_S;
      this.los = dist < this.type.sight * 1.5 ? lineOfSight(world, nav, this.eye(), player.eye()) : null;
      this.sees = !!this.los?.clear && dist < this.type.sight;
      if (this.sees) this.lastSeen = time;
    }

    const reach = this.type.radius + player.type.radius + 1.5;
    if (this.sees || time - this.lastSeen < FORGET_S) {
      this.state = "chase";
      if (dist <= reach) {
        this.path = null;
        this.turnToward(player.x - this.x, player.z - this.z, dt);
        if (this.attack === 0) this.attack = 1;
        return;
      }
      this.repathTimer -= dt;
      if (this.repathTimer <= 0 || !this.path) {
        this.repathTimer = REPATH_S;
        this.pathTo(ctx, player.x, player.z);
      }
      this.followPath(ctx, dt, this.type.run);
      return;
    }

    if (this.state === "chase") {
      this.state = "return";
      this.pathTo(ctx, this.home.x, this.home.z);
    }
    if (this.state === "return" || this.state === "wander") {
      if (!this.followPath(ctx, dt, this.state === "return" ? this.type.run * 0.6 : this.type.walk)) {
        this.state = "idle";
        this.timer = 2 + Math.random() * 4;
      }
      return;
    }
    this.timer -= dt;
    if (this.timer <= 0) {
      const a = Math.random() * Math.PI * 2, r = Math.random() * this.type.home;
      this.state = this.pathTo(ctx, this.home.x + Math.cos(a) * r, this.home.z + Math.sin(a) * r) ? "wander" : "idle";
      this.timer = 2;
    }
  }
}
