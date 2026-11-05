import { disposeRestPoint, restPointMaterials, restPointMesh } from "../world/restPoint.js";

// The rest points on your continent, as the game server says where they stand, and a button to
// make the one you stand by your home. The server decides what your home is; this only asks.

export const HOME_REACH_FT = 15; // nearer than the server's limit, so asking from here works

// The rest point nearest [x, z] within reach, or null.
export function restPointBy(points, x, z, reach = HOME_REACH_FT) {
  let best = null;
  let bestD = reach;
  for (const point of points) {
    const d = Math.hypot(point.at[0] - x, point.at[2] - z);
    if (d <= bestD) [best, bestD] = [point, d];
  }
  return best;
}

export class RestPoints {
  // view: the PlayView. connection: the game connection. parent: where the button goes.
  constructor(view, connection, parent = document.body) {
    Object.assign(this, { view, connection, points: [], home: "", meshes: [] });
    this.look = restPointMaterials();
    this.button = document.createElement("button");
    this.button.className = "play-home";
    this.button.hidden = true;
    this.button.addEventListener("click", () => this.by && this.by.id !== this.home && this.connection.makeHome(this.by.id));
    parent.append(this.button);
    this.by = null;
  }

  // The server's restPoints message.
  set({ restPoints, home }) {
    for (const mesh of this.meshes) {
      this.view.scene.remove(mesh);
      disposeRestPoint(mesh);
    }
    this.points = restPoints ?? [];
    this.home = home ?? "";
    this.meshes = this.points.map((point) => {
      const mesh = restPointMesh(this.look);
      mesh.position.set(...point.at);
      this.view.scene.add(mesh);
      return mesh;
    });
    this.by = null;
  }

  // The server's home message.
  home_({ home }) {
    this.home = home ?? "";
    this.by = null;
  }

  // Shows the button by a rest point, saying whether it's your home already. Called each frame.
  frame() {
    const pos = this.view.walker?.pos;
    const by = pos ? restPointBy(this.points, pos.x, pos.z) : null;
    if (by === this.by) return;
    this.by = by;
    this.button.hidden = !by;
    if (!by) return;
    const name = by.name || "this rest point";
    const home = by.id === this.home;
    this.button.textContent = home ? `${name} is your home` : `Make ${name} your home`;
    this.button.disabled = home;
  }
}
