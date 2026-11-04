import { setWeaponsDrawn } from "./characterMesh.js";
import { sheathOf } from "./weapons.js";

// A character reaching for its weapons as it takes them out or puts them away: a quick move of the
// arms, with the weapons changing place as the hand gets there. Going for them takes only as long
// as a swing can spare and still land on time, since the swing carries on from where it would be.

const REACHES_S = 0.1;
const DRAW_S = 0.15;
const PUT_AWAY_S = 0.3;

export class WeaponDraw {
  constructor(mesh) {
    this.mesh = mesh;
    this.out = false;
    this.going = null;
  }

  // Which way the weapons should be, at a time in seconds. Gives what the arms should be doing as
  // { name, at, loop }, or null.
  update(now, wanted) {
    if (this.going?.to === wanted) {
      if (now >= this.going.swapsAt) setWeaponsDrawn(this.mesh, wanted);
      if (now < this.going.until) return this.going;
      this.going = null;
      return null;
    }
    if (this.going) setWeaponsDrawn(this.mesh, this.going.to);
    this.going = null;
    if (wanted === this.out) return null;
    this.out = wanted;
    const sheath = sheathOf(this.mesh.userData.look?.weapon);
    if (!sheath || !this.mesh.userData.held?.length) {
      setWeaponsDrawn(this.mesh, wanted);
      return null;
    }
    const name = sheath.place === "back" ? "Draw_Back" : "Draw_Hip";
    this.going = { name, at: now, loop: false, to: wanted, swapsAt: now + REACHES_S, until: now + (wanted ? DRAW_S : PUT_AWAY_S) };
    return this.going;
  }
}
