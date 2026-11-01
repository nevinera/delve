// The cave smooth and fill tools: a lighter patch on the cave rock the pointer's on, and
// while the button's held, the rock inside worked over and over. Smooth evens it (Caves.smooth):
// floors toward walkable, ceilings plainer, walls' outlines evened. Fill adds rock to it
// (Caves.grow): floors rise, ceilings come down, walls come out. Each press undoes as one.

const AGAIN_MS = 120; // how often holding the button works again
const FILL_FT = 0.5; // how far fill adds rock each time, at full strength
const WALL_EVERY = 5; // fill brings a wall out a column only every so many times
const $ = (id) => document.getElementById(id);

export class CaveBrush {
  // ray(): the pointer's THREE.Raycaster, or null off the view.
  constructor({ caves, ray }) {
    Object.assign(this, { caves, ray });
    this.down = null; // { tool, last, join, times } while the button's held
    $("caveBrushSize").addEventListener("input", () => this.read());
    $("caveBrushStrength").addEventListener("input", () => this.read());
    this.read();
  }

  read() {
    this.size = Number($("caveBrushSize").value);
    this.strength = Number($("caveBrushStrength").value) / 100;
    $("caveBrushSizeOut").textContent = `${this.size} ft`;
    $("caveBrushStrengthOut").textContent = `${Math.round(this.strength * 100)}%`;
  }

  // Where the pointer's on the rock and how the rock faces there, { at, normal }, or null.
  aim() {
    const ray = this.ray();
    const at = ray && this.caves.hit(ray.ray);
    if (!at) return null;
    // Back off the rock a little, so the facing's read from the air.
    const normal = this.caves.normalAt(at, Math.max(2, this.size / 4));
    return normal && { at, normal };
  }

  // tool: "caveSmooth" or "caveFill".
  press(tool) {
    this.down = { tool, last: -Infinity, join: false, times: 0 };
    this.work();
  }

  letGo() {
    this.down = null;
    this.caves.letGo();
  }

  work() {
    const now = performance.now();
    if (!this.down || now - this.down.last < AGAIN_MS) return;
    this.down.last = now;
    const aim = this.aim();
    if (!aim) return;
    const { tool, join } = this.down;
    const options = { strength: this.strength, join };
    let changed;
    if (tool === "caveSmooth") changed = this.caves.smooth(aim.at, aim.normal, this.size / 2, options);
    else {
      const wall = Math.abs(aim.normal[1]) <= 0.5;
      if (wall && this.down.times++ % WALL_EVERY) return;
      changed = this.caves.grow(aim.at, aim.normal, this.size / 2, { amountFt: FILL_FT * this.strength, join });
    }
    if (changed) this.down.join = true;
  }

  // Gives whether it took the key.
  key(e) {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") {
      this.caves.undo();
      return true;
    }
    if (e.key === "[" || e.key === "]") {
      const size = $("caveBrushSize");
      size.value = String(Number(size.value) + (e.key === "]" ? 2 : -2));
      this.read();
      return true;
    }
    return false;
  }

  // Each frame, with the tool picked or not: the patch where it's aimed.
  tick(on) {
    if (on) this.work();
    const aim = on && this.aim();
    if (aim) this.caves.brush(aim.at, aim.normal, this.size / 2);
    else this.caves.brush(null);
  }
}
