import { TILE_FT } from "../world/constants.js";

// A performance overlay for the 3D view, shown when the page's URL has `?stats`. It times each
// render (our per-frame work, three.js issuing the draw, and the GPU where the browser can time
// it), and counts what's drawn. It updates a few times a second.
//
// fps counts renders: walking renders every frame, but orbiting only renders when something moves.

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
  }

  // Wraps one render: ours() is our per-frame work, draw() three.js's.
  measure(ours, draw) {
    const start = performance.now();
    ours();
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

  show() {
    const { view, frames } = this;
    const info = view.renderer.info;
    const gaps = frames.slice(1).map((f, i) => f.at - frames[i].at);
    const avg = (list) => (list.length ? list.reduce((a, b) => a + b, 0) / list.length : 0);
    const ms = (v) => `${v.toFixed(1)}ms`;
    // What a group holds in meshes that are switched on, on screen or not, and their triangles.
    const count = (group) => {
      let meshes = 0;
      let instances = 0;
      let triangles = 0;
      group.traverse((o) => {
        if (!o.isMesh || !o.visible) return;
        const n = o.isInstancedMesh ? o.count : 1;
        meshes++;
        instances += n;
        triangles += (n * (o.geometry.index?.count ?? o.geometry.attributes.position.count)) / 3;
      });
      return `${instances} in ${meshes} meshes, ${(triangles / 1000).toFixed(0)}k tris`;
    };
    const focus = view.walking ? view.walker.pos : view.controls.target;
    const origin = view.origin ?? [0, 0];
    const [x, z] = [focus.x + origin[0], focus.z + origin[1]];
    const nearTiles = view.content.children.filter((c) => c.visible && c.userData.tile && c.material === view.terrainMaterial).length;
    this.el.textContent = [
      `fps ${gaps.length ? (1000 / avg(gaps)).toFixed(0) : "-"}   frame ${ms(avg(gaps))} avg, ${ms(Math.max(0, ...gaps))} worst`,
      `cpu: ours ${ms(avg(frames.map((f) => f.ours)))}, draw ${ms(avg(frames.map((f) => f.submit)))}   gpu ${this.timer ? (this.gpu.length ? ms(avg(this.gpu.map((g) => g.ms))) : "...") : "n/a"}`,
      `draw calls ${info.render.calls}   triangles ${(info.render.triangles / 1000).toFixed(0)}k`,
      `memory: ${info.memory.geometries} geometries, ${info.memory.textures} textures, ${info.programs?.length ?? "?"} shaders`,
      `tiles: ${nearTiles} near, ${view.farTiles?.size ?? 0} far   ground and water: ${count(view.content)}`,
      `trees: ${count(view.trees)}`,
      `far ring: ${count(view.far)}`,
      `clutter: ${count(view.clutter)}`,
      `objects: ${count(view.objects)}`,
      `at tile ${Math.floor(x / TILE_FT)}, ${Math.floor(z / TILE_FT)}   (${x.toFixed(0)}, ${z.toFixed(0)}) ft`,
    ].join("\n");
  }
}
