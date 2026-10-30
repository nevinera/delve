import * as THREE from "three";

// N, E, S and W shown just over the horizon each way, and the 16 points of the compass to say which
// way a yaw faces. North is -z and east +x. A letter whose place is off the view stays at its edge:
// at the top, or in the top half of either side. Letters further round than SIDE_DEG past the
// view's side, or behind, aren't shown.

const AWAY_FT = 20000;
const RISE = 0.06; // how far over the horizon, as a share of AWAY_FT
const SIDE_DEG = 20;
const EDGE_PX = 14; // how far in from the view's edges letters stay
const LETTERS = [
  ["N", 0, -1],
  ["E", 1, 0],
  ["S", 0, 1],
  ["W", -1, 0],
];
const POINTS = ["N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE", "S", "SSW", "SW", "WSW", "W", "WNW", "NW", "NNW"];

// Which of the 16 points the builder faces at `yaw` (moveBuilder's: 0 faces +z, south).
export function facing(yaw) {
  const bearing = Math.atan2(Math.sin(yaw), -Math.cos(yaw)); // clockwise from north
  return POINTS[Math.round((bearing / (2 * Math.PI)) * 16 + 16) % 16];
}

export class Compass {
  // Shows the letters over `stage`, below its `bar`.
  constructor(stage, bar) {
    this.stage = stage;
    this.bar = bar;
    this.letters = LETTERS.map(([text, dx, dz]) => {
      const el = document.createElement("span");
      el.className = "create-compass";
      el.textContent = text;
      el.hidden = true;
      stage.append(el);
      return { el, dx, dz };
    });
  }

  tick(camera) {
    const [w, h] = [this.stage.clientWidth, this.stage.clientHeight];
    const top = this.bar.offsetHeight + EDGE_PX;
    const half = Math.atan(Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * camera.aspect);
    const look = camera.getWorldDirection(new THREE.Vector3());
    const ahead = Math.hypot(look.x, look.z) || 1;
    const [fx, fz] = [look.x / ahead, look.z / ahead];
    for (const { el, dx, dz } of this.letters) {
      // How far round from straight ahead, right positive.
      const round = Math.atan2(dx * -fz + dz * fx, dx * fx + dz * fz);
      el.hidden = Math.abs(round) > half + THREE.MathUtils.degToRad(SIDE_DEG);
      if (el.hidden) continue;
      const at = camera.position.clone().add(new THREE.Vector3(dx * AWAY_FT, RISE * AWAY_FT, dz * AWAY_FT));
      const inFront = at.clone().applyMatrix4(camera.matrixWorldInverse).z < 0;
      const ndc = at.project(camera);
      // Off the view, the letter's place there says little of which way it is, so its way does.
      const onView = inFront && Math.abs(ndc.x) <= 1 && Math.abs(ndc.y) <= 1;
      const x = onView ? ndc.x : Math.tan(round) / Math.tan(half);
      const y = inFront ? ndc.y : 1;
      let [px, py] = [((x + 1) / 2) * w, ((1 - y) / 2) * h];
      const side = px < EDGE_PX || px > w - EDGE_PX;
      px = Math.min(w - EDGE_PX, Math.max(EDGE_PX, px));
      py = Math.min(side ? h / 2 : h - EDGE_PX, Math.max(top, py));
      el.style.transform = `translate(${px}px, ${py}px) translate(-50%, -50%)`;
    }
  }
}
