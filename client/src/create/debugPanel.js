import { PLATE_FT, TILE_FT } from "../v2/sizes.js";

// The debug pane over the bottom bar. Each of its toggles shows a part: the frame (frames a second,
// the longest gap, draw calls, and each part of a frame's time), the ground (tiles drawn each way,
// how far off, and kinds hidden), the builder (moving how, and where), and the page's startup.
// The pane shows while any part does.

const $ = (id) => document.getElementById(id);
const ROWS = 4; // rows a block, under its heading
const ms = (n) => (n < 10 ? n.toFixed(1) : n.toFixed(0));

export class DebugPanel {
  // `kinds` are the ground's kinds, finest first, in the order 1 to 4 toggle them.
  constructor({ renderer, ground, builder, startup, kinds, feet }) {
    Object.assign(this, { renderer, ground, builder, startup, kinds, feet });
    this.toggles = [...document.querySelectorAll("[data-show-debug]")];
    for (const toggle of this.toggles) toggle.addEventListener("change", () => this.showParts());
    // The browser may have kept them checked from before the page was loaded again.
    this.showParts();
    this.rows = new Map(); // a frame part's name -> its two cells
    this.steps = 0; // the startup steps shown
  }

  // Whether the part's shown, or with none given, whether any is.
  shown(part) {
    return this.toggles.some((t) => t.checked && (!part || t.dataset.showDebug === part));
  }

  showParts() {
    for (const toggle of this.toggles) document.querySelector(`[data-debug="${toggle.dataset.showDebug}"]`).hidden = !toggle.checked;
    $("debug").hidden = !this.shown();
  }

  // Shows what's changed: `taken` is a FrameParts' times, over `elapsed` ms.
  show(taken, elapsed) {
    if (this.shown("frame")) this.showFrame(taken, elapsed);
    if (this.shown("ground")) this.showGround();
    if (this.shown("builder")) this.showBuilder();
    if (this.shown("startup")) this.showStartup();
  }

  showFrame({ frames, gap, parts }, elapsed) {
    $("debugFps").textContent = String(Math.round((frames * 1000) / elapsed));
    $("debugSlowest").textContent = `${gap.toFixed(0)} ms`;
    $("debugDraws").textContent = String(this.renderer.info.render.calls);
    for (const { name, mean, worst } of parts) {
      const [meanCell, worstCell] = this.rows.get(name) ?? this.addRow($("debugParts"), name);
      meanCell.textContent = ms(mean);
      worstCell.textContent = ms(worst);
    }
  }

  showGround() {
    const { ground } = this;
    ["debugFull", "debugFine", "debugCoarse", "debugPlates"].forEach((id, k) => ($(id).textContent = ground.counts[k].toLocaleString()));
    $("debugReach").textContent = `${(ground.reach / 5280).toFixed(1)} mi`;
    const hidden = this.kinds.filter((kind) => !ground.shown[kind]);
    $("debugHidden").textContent = hidden.length ? hidden.join(", ") : "-";
  }

  showBuilder() {
    const { x, z, flying, swimming } = this.builder.state;
    $("debugMoving").textContent = flying ? "flying" : swimming ? "swimming" : "walking";
    $("debugAbove").textContent = this.feet(this.builder.above);
    $("debugTile").textContent = `${Math.floor(x / TILE_FT)}, ${Math.floor(z / TILE_FT)}`;
    $("debugPlate").textContent = `${Math.floor(x / PLATE_FT)}, ${Math.floor(z / PLATE_FT)}`;
  }

  // Steps are only ever added, so only the new ones need rows.
  showStartup() {
    for (const { name, ms: took, at } of this.startup.steps.slice(this.steps)) {
      const [tookCell, atCell] = this.addRow($("debugStartup"), name);
      tookCell.textContent = ms(took);
      atCell.textContent = Math.round(at).toLocaleString();
    }
    this.steps = this.startup.steps.length;
  }

  // A row in the list, in blocks of at most ROWS rows under their heading, so they fit without
  // scrolling.
  addRow(list, name) {
    const blocks = [list, ...list.parentElement.querySelectorAll(`[data-more-of="${list.id}"]`)];
    let block = blocks.at(-1);
    if (block.querySelectorAll("dt:not(.create-debug-head)").length >= ROWS) {
      block = list.cloneNode(false);
      block.removeAttribute("id");
      block.dataset.moreOf = list.id;
      // The column headings again, but the list's name only over the first block.
      const heads = [...list.querySelectorAll(".create-debug-head")].map((head) => head.cloneNode(true));
      heads[0].textContent = "";
      block.append(...heads);
      blocks.at(-1).after(block);
    }
    const label = document.createElement("dt");
    label.textContent = name;
    const cells = [document.createElement("dd"), document.createElement("dd")];
    block.append(label, ...cells);
    if (list.id === "debugParts") this.rows.set(name, cells);
    return cells;
  }
}
