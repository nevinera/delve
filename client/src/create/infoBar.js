import { SEA_LEVEL_FT } from "../v2/sizes.js";
import { facing } from "./compass.js";
import { EMPTY_FT } from "./ground.js";

// The info bar: how far off the spot pointed at is, straight and across, where it is, how high the
// builder is and the ground under them, and which way they face.

const $ = (id) => document.getElementById(id);
const EVERY_MS = 100;

export const feet = (ft) => `${Math.round(ft).toLocaleString()} ft`;

export class InfoBar {
  constructor({ tools, builder, renditions }) {
    Object.assign(this, { tools, builder, renditions });
    this.last = 0;
  }

  // Shows it again, if it's been long enough since it last was, and says whether it did.
  tick(now) {
    if (now - this.last <= EVERY_MS) return false;
    this.last = now;
    const { x, y, z, yaw } = this.builder.state;
    // A cave's rock, from in one, or else the ground.
    const at = this.tools.caveHit()?.at ?? this.tools.hit();
    // From the builder's feet, not the camera behind them.
    $("infoPoint").textContent = at ? feet(Math.hypot(at[0] - x, at[1] - y, at[2] - z)) : "-";
    $("infoHoriz").textContent = at ? feet(Math.hypot(at[0] - x, at[2] - z)) : "-";
    $("infoSpot").textContent = at ? at.map((v) => Math.round(v)).join(", ") : "-";
    $("infoHeight").textContent = feet(y - SEA_LEVEL_FT);
    $("infoGround").textContent = feet(this.renditions.heightAt(x, z) ?? EMPTY_FT);
    $("infoFacing").textContent = facing(yaw);
    return true;
  }
}
