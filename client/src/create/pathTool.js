// Planning's path tool: its clicks put a start and an end to search for the shortest way on foot
// between (paths.js).

const $ = (id) => document.getElementById(id);

export class PathTool {
  constructor(tools, paths) {
    this.tools = tools;
    this.paths = paths;
    $("pathMost").addEventListener("input", () => {
      this.readPath();
      paths.start();
    });
    $("pathSpeed").addEventListener("input", () => this.readPath());
    $("pathAgain").addEventListener("click", () => paths.start());
    this.readPath();
  }

  setTool(tool) {
    this.paths.setShown(Boolean(tool));
  }

  down() {
    const at = this.tools.hit();
    if (at) this.paths.click(at[0], at[2]);
  }

  move() {}

  up() {}

  key() {
    return false;
  }

  // The longest way, a quarter mile to 5 miles, and how many cells it searches a frame, 100 to
  // 200,000, both on a log scale.
  readPath() {
    const s = this.paths.settings;
    s.mostFt = Math.round(1320 * 20 ** (Number($("pathMost").value) / 1000));
    s.cells = Math.round(100 * 2000 ** (Number($("pathSpeed").value) / 1000));
    $("pathMostOut").textContent = `${(s.mostFt / 5280).toFixed(2)} mi`;
    $("pathSpeedOut").textContent = `${s.cells.toLocaleString()} cells a frame`;
  }
}
