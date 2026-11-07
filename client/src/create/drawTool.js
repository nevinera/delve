import { Draw } from "./draw.js";

// Geo's draw tool: dragging draws a line to grow hills, a mountain range or a cliff along
// (draw.js, growth.js), and Enter grows it.

const $ = (id) => document.getElementById(id);

// The sliders, 0 to 1000, and the growth settings they set, some on a log scale, their ranges by
// what's grown.
const logSlider = (key, ranges, show) => {
  const range = (kind) => ranges[kind] ?? ranges.other;
  return {
    get: (s, kind) => Math.round((1000 * Math.log(s[key] / range(kind)[0])) / Math.log(range(kind)[1] / range(kind)[0])),
    set: (s, v, kind) => (s[key] = Math.round(range(kind)[0] * (range(kind)[1] / range(kind)[0]) ** (v / 1000))),
    show: (s) => show(s[key]),
  };
};
const GROW_SLIDERS = {
  growWidth: logSlider("width", { other: [400, 21120], cliff: [40, 2640] }, (ft) => `${ft.toLocaleString()} ft`),
  growHeight: logSlider("height", { other: [50, 3000], cliff: [8, 600] }, (ft) => `${ft.toLocaleString()} ft`),
  growDensity: { get: (s) => Math.round(((s.density - 0.2) / 5.8) * 1000), set: (s, v) => (s.density = 0.2 + (5.8 * v) / 1000), show: (s) => `×${s.density.toFixed(1)}` },
  growNoise: { get: (s) => Math.round(s.noise * 1000), set: (s, v) => (s.noise = v / 1000), show: (s) => `${Math.round(s.noise * 100)}%` },
};

export class DrawTool {
  // The rest are Draw's own.
  constructor(tools, { scene, parent, renditions, ground, heightAt, biomes }) {
    this.tools = tools;
    this.draw = new Draw(scene, parent, renditions, ground, heightAt, () => this.showDraw(), biomes);
    const { draw } = this;
    for (const button of document.querySelectorAll("[data-grow]")) button.addEventListener("click", () => draw.adjust(button.dataset.grow));
    $("growBack").addEventListener("click", () => draw.back());
    $("growGo").addEventListener("click", () => draw.grow());
    $("growUndo").addEventListener("click", () => draw.undo());
    $("growThrow").addEventListener("click", () => draw.clear());
    for (const [id, read] of Object.entries(GROW_SLIDERS)) {
      $(id).addEventListener("input", () => {
        const settings = draw.settings[draw.kind];
        read.set(settings, Number($(id).value), draw.kind);
        $(`${id}Out`).textContent = read.show(settings);
        draw.dirty = true;
      });
    }
  }

  setTool(tool) {
    if (!tool) this.draw.clear();
  }

  down() {
    const at = this.tools.hit();
    if (at) this.draw.start(at[0], at[2]);
  }

  move() {
    if (this.draw.state !== "drawing") return;
    const at = this.tools.hit();
    if (at) this.draw.add(at[0], at[2]);
  }

  up() {
    if (this.draw.state === "drawing") this.draw.end();
  }

  key(e) {
    if (e.key !== "Enter") return false;
    this.draw.grow();
    return true;
  }

  tick() {
    $("growFlat").hidden = !this.draw.flat;
  }

  // Shows the tool's state, and the settings of what it's growing.
  showDraw() {
    const { state, kind } = this.draw;
    for (const part of document.querySelectorAll("[data-draw]")) part.hidden = !part.dataset.draw.split(" ").includes(state);
    $("growUndo").disabled = !this.draw.undos.length;
    if (state !== "adjusting") return;
    const settings = this.draw.settings[kind];
    for (const part of document.querySelectorAll("[data-grown]")) part.hidden = !part.dataset.grown.split(" ").includes(kind);
    for (const [id, read] of Object.entries(GROW_SLIDERS)) {
      if (settings[id.replace("grow", "").toLowerCase()] === undefined) continue;
      $(id).value = String(read.get(settings, kind));
      $(`${id}Out`).textContent = read.show(settings);
    }
  }
}
