import { TILE_FT } from "../world/constants.js";

// A performance overlay for the 3D view, shown when the page's URL has `?stats`. It times each
// render (our per-frame work, three.js issuing the draw, and the GPU where the browser can time
// it), and counts what's drawn. It updates a few times a second.
//
// fps counts renders: walking renders every frame, but orbiting only renders when something moves.
// Keys 1-6 hide and show a group of meshes (6 is the sky), to see what each costs; 7 switches
// between the display's pixel density and 1x, to see what resolution costs; 0 copies the numbers
// as JSON.

const REFRESH_MS = 250;
const WINDOW_MS = 1000; // frame times are averaged, and the worst found, over this long

export function statsWanted() {
  return new URLSearchParams(window.location.search).has("stats");
}

export class Stats {
  constructor(view) {
    this.view = view;
    this.frames = []; // [{ at, ours, submit }]
    this.gpu = [];
    this.el = document.createElement("pre");
    this.el.className = "editor-stats";
    view.canvas.parentElement.append(this.el);
    const gl = view.renderer.getContext();
    this.gl = gl;
    this.timer = gl.getExtension("EXT_disjoint_timer_query_webgl2");
    this.queries = [];
    this.shownAt = 0;
    this.groups = [
      ["clutter", view.clutter],
      ["near trees", view.trees],
      ["far ring", view.far],
      ["objects", view.objects],
      ["ground and water", view.content],
      ["sky", view.sky.mesh],
    ];
    this.hidden = new Set();
    window.addEventListener("keydown", (e) => {
      const n = Number(e.key);
      if (e.target.matches?.("input, textarea, select")) return;
      if (e.key === "0") {
        this.copy();
        return;
      }
      if (n === this.groups.length + 1) {
        this.lowRes = !this.lowRes;
        view.renderer.setPixelRatio(this.lowRes ? 1 : Math.min(window.devicePixelRatio || 1, 2));
        view.resize();
        return;
      }
      if (!(n >= 1 && n <= this.groups.length)) return;
      const name = this.groups[n - 1][0];
      if (this.hidden.has(name)) this.hidden.delete(name);
      else this.hidden.add(name);
      if (!view.walking) view.render();
    });
  }

  // Applies the hidden groups after the view has set what's visible for this frame. Groups the
  // view doesn't switch itself come back on when unhidden.
  hide() {
    for (const [name, group] of this.groups) {
      if (this.hidden.has(name)) group.visible = false;
      else if (group !== this.view.clutter && group !== this.view.far) group.visible = true; // the view switches these two itself
    }
  }

  // Wraps one render: ours() is our per-frame work, draw() three.js's.
  measure(ours, draw) {
    const start = performance.now();
    ours();
    this.hide();
    const mid = performance.now();
    const query = this.beginGpu();
    draw();
    this.endGpu(query);
    const end = performance.now();
    this.frames.push({ at: end, ours: mid - start, submit: end - mid });
    this.collectGpu();
    const cutoff = end - WINDOW_MS;
    while (this.frames.length && this.frames[0].at < cutoff) this.frames.shift();
    while (this.gpu.length && this.gpu[0].at < cutoff) this.gpu.shift();
    if (end - this.shownAt > REFRESH_MS) {
      this.shownAt = end;
      this.show();
    }
  }

  beginGpu() {
    if (!this.timer) return null;
    const query = this.gl.createQuery();
    this.gl.beginQuery(this.timer.TIME_ELAPSED_EXT, query);
    return query;
  }

  endGpu(query) {
    if (!query) return;
    this.gl.endQuery(this.timer.TIME_ELAPSED_EXT);
    this.queries.push(query);
  }

  // GPU timings arrive a few frames late; picks up the ones that are ready.
  collectGpu() {
    const { gl } = this;
    while (this.queries.length && gl.getQueryParameter(this.queries[0], gl.QUERY_RESULT_AVAILABLE)) {
      const query = this.queries.shift();
      if (!gl.getParameter(this.timer.GPU_DISJOINT_EXT)) this.gpu.push({ at: performance.now(), ms: gl.getQueryParameter(query, gl.QUERY_RESULT) / 1e6 });
      gl.deleteQuery(query);
    }
  }

  // Everything the overlay shows, as numbers.
  snapshot() {
    const { view, frames } = this;
    const info = view.renderer.info;
    const gaps = frames.slice(1).map((f, i) => f.at - frames[i].at);
    const avg = (list) => round(list.length ? list.reduce((a, b) => a + b, 0) / list.length : 0);
    const worst = (list) => round(Math.max(0, ...list));
    // What a group holds in meshes that are switched on, on screen or not, and their triangles.
    const count = (group) => {
      const out = { instances: 0, meshes: 0, triangles: 0 };
      group.traverse((o) => {
        if (!o.isMesh || !o.visible) return;
        const n = o.isInstancedMesh ? o.count : 1;
        out.meshes++;
        out.instances += n;
        out.triangles += Math.round((n * (o.geometry.index?.count ?? o.geometry.attributes.position.count)) / 3);
      });
      return out;
    };
    const focus = view.walking ? view.walker.pos : view.controls.target;
    const origin = view.origin ?? [0, 0];
    const [x, z] = [focus.x + origin[0], focus.z + origin[1]];
    return {
      fps: gaps.length ? Math.round(1000 / avg(gaps)) : null,
      frameMs: { avg: avg(gaps), worst: worst(gaps) },
      cpuMs: {
        ours: { avg: avg(frames.map((f) => f.ours)), worst: worst(frames.map((f) => f.ours)) },
        draw: { avg: avg(frames.map((f) => f.submit)), worst: worst(frames.map((f) => f.submit)) },
      },
      gpuMs: this.timer && this.gpu.length ? avg(this.gpu.map((g) => g.ms)) : null,
      drawCalls: info.render.calls,
      triangles: info.render.triangles,
      canvas: { width: view.canvas.width, height: view.canvas.height, pixelRatio: view.renderer.getPixelRatio() },
      memory: { geometries: info.memory.geometries, textures: info.memory.textures, shaders: info.programs?.length ?? null },
      tiles: {
        near: view.content.children.filter((c) => c.visible && c.userData.tile && c.material === view.terrainMaterial).length,
        far: view.farTiles?.size ?? 0,
      },
      groups: Object.fromEntries(this.groups.map(([name, group]) => [name, { ...count(group), hidden: this.hidden.has(name) }])),
      walking: view.walking,
      at: { tile: [Math.floor(x / TILE_FT), Math.floor(z / TILE_FT)], ft: [Math.round(x), Math.round(z)] },
      browser: navigator.userAgent,
    };
  }

  show() {
    const s = this.snapshot();
    const ms = (v) => (v === null ? "n/a" : `${v.toFixed(1)}ms`);
    const group = (name) => {
      const g = s.groups[name];
      return `${g.instances} in ${g.meshes} meshes, ${(g.triangles / 1000).toFixed(0)}k tris${g.hidden ? " (hidden)" : ""}`;
    };
    this.el.textContent = [
      `fps ${s.fps ?? "-"}   frame ${ms(s.frameMs.avg)} avg, ${ms(s.frameMs.worst)} worst`,
      `cpu: ours ${ms(s.cpuMs.ours.avg)} (worst ${ms(s.cpuMs.ours.worst)}), draw ${ms(s.cpuMs.draw.avg)} (worst ${ms(s.cpuMs.draw.worst)})   gpu ${this.timer ? (s.gpuMs === null ? "..." : ms(s.gpuMs)) : "n/a"}`,
      `draw calls ${s.drawCalls}   triangles ${(s.triangles / 1000).toFixed(0)}k   canvas ${s.canvas.width}×${s.canvas.height} (${s.canvas.pixelRatio}x)`,
      `memory: ${s.memory.geometries} geometries, ${s.memory.textures} textures, ${s.memory.shaders ?? "?"} shaders`,
      `tiles: ${s.tiles.near} near, ${s.tiles.far} far`,
      ...this.groups.map(([name], i) => `${i + 1} ${name}: ${group(name)}`),
      `${this.groups.length + 1} pixel density: ${this.lowRes ? "1x" : "full"}   0 copies these numbers as JSON${this.copied ? " (copied)" : ""}`,
      `at tile ${s.at.tile.join(", ")}   (${s.at.ft.join(", ")}) ft`,
    ].join("\n");
  }

  // Puts the numbers on the clipboard, to paste somewhere.
  async copy() {
    try {
      await navigator.clipboard.writeText(JSON.stringify(this.snapshot(), null, 2));
      this.copied = true;
    } catch (err) {
      this.copied = false;
      console.warn(`couldn't copy the stats: ${err.message}`);
    }
    this.show();
    setTimeout(() => {
      this.copied = false;
      this.show();
    }, 1500);
  }
}

const round = (v) => Math.round(v * 100) / 100;
