import * as THREE from "three";
import { CELL_FT, CELLS, TILE_FT } from "../world/constants.js";
import { makeObject, specOf, tileOf } from "../world/objects.js";
import { slabTile } from "../world/slabs.js";
import { convexHull, placedTemplate } from "../world/templates.js";
import { fellTree, parseTree } from "../world/trees.js";
import { boundary } from "./renderView.js";
import { disposeTemplateGroup, templateGroup } from "./templateMeshes.js";

// The detail step's templates tool placing a template (world/templates.js) on a DetailView's
// tiles. The template follows the pointer, its anchor on the cell corner nearest it, standing at
// the ground's mean height over the cells under it. An outline round those cells shows where it
// goes, red where it can't: reaching outside the window, or into a tree unless it clears them. A
// click copies it into the tiles, with options { turn (degrees), reshape, clear }: reshape sets
// the ground to the template's, and clear fells the trees, clears the clutter and takes away the
// objects on its cells.

const COLOR = { fits: 0x7fe07f, wrong: 0xe04040 };
const TREE_PROBLEM = "That would run into a tree; tick clearing to fell it.";

export class TemplatePlace {
  // detail: the DetailView. onProblem(message) hears why a click couldn't place it.
  constructor(detail, { onProblem } = {}) {
    this.detail = detail;
    this.onProblem = onProblem;
    this.template = null;
    this.options = { turn: 0, reshape: false, clear: true };
    this.ghost = null; // the template drawn where it would go
    this.marks = new THREE.Group();
    detail.view.scene.add(this.marks);
  }

  // The template to place, or null, and any of the options.
  set(template, options = {}) {
    if (template !== this.template) {
      if (this.ghost) {
        this.detail.view.scene.remove(this.ghost);
        disposeTemplateGroup(this.ghost);
      }
      this.ghost = template ? templateGroup(template) : null;
      if (this.ghost) this.detail.view.scene.add(this.ghost);
      this.template = template;
    }
    Object.assign(this.options, options);
    this.draw(this.detail.pointer);
  }

  // Where the template would go for a point on the ground ([x, z] continent feet), as
  // placedTemplate gives it, with its anchor and turn, and why it can't go there if it can't.
  placement([x, z]) {
    const { template } = this;
    const { turn } = this.options;
    const anchor = [Math.round(x / CELL_FT) * CELL_FT, Math.round(z / CELL_FT) * CELL_FT];
    const { height } = this.detail.cells();
    const flat = placedTemplate(template, [anchor[0], 0, anchor[1]], turn);
    const heights = flat.cells.map(([ci, cj]) => height(ci, cj));
    const base = Math.round((heights.reduce((s, h) => s + h, 0) / Math.max(1, heights.length)) * 4) / 4;
    const placed = placedTemplate(template, [anchor[0], base, anchor[1]], turn);
    return { ...placed, anchor: [anchor[0], base, anchor[1]], problem: this.problem(placed) };
  }

  problem({ slabs, objects, cells }) {
    const { detail } = this;
    const { editable } = detail.cells();
    if (!cells.every(([ci, cj]) => editable(ci, cj)) || !slabs.every((s) => detail.editable(slabTile(s).join(","))) || !objects.every((o) => detail.editable(tileOf(o.at).join(",")))) return "That reaches outside the window.";
    if (!this.options.clear && slabs.some((slab) => detail.slabTool.hitsTree(slab))) return TREE_PROBLEM;
    const unknown = objects.find((o) => !specOf(o.type));
    if (unknown) return `This world has no ${unknown.type} for it.`;
    return null;
  }

  // Draws the template where it would go for a pointer event, or hides it.
  draw(e) {
    for (const child of [...this.marks.children]) {
      child.geometry.dispose();
      child.material.dispose();
      this.marks.remove(child);
    }
    const at = this.template && e && this.detail.pointAt(e);
    if (this.ghost) this.ghost.visible = Boolean(at);
    if (at) {
      const { anchor, cells, problem } = this.placement(at);
      const { origin, ground } = this.detail.view;
      this.ghost.position.set(anchor[0] - origin[0], anchor[1], anchor[2] - origin[1]);
      this.ghost.rotation.y = (this.options.turn * Math.PI) / 180;
      const corners = cells.flatMap(([ci, cj]) => [[ci, cj], [ci + 1, cj], [ci + 1, cj + 1], [ci, cj + 1]].map(([i, j]) => [(i * CELL_FT) / TILE_FT, (j * CELL_FT) / TILE_FT]));
      const line = boundary(convexHull(corners), ground, origin, problem ? COLOR.wrong : COLOR.fits);
      line.material.depthTest = false;
      line.renderOrder = 4;
      this.marks.add(line);
    }
    this.detail.view.render();
  }

  // A click: copies the template into the tiles where it's drawn, as one edit.
  place(e) {
    const at = this.template && this.detail.pointAt(e);
    if (!at) return;
    const { slabs, objects, cells, ground, problem } = this.placement(at);
    if (problem) return this.onProblem?.(problem);
    const { detail } = this;
    const { decoded } = detail.view;
    const cellKey = ([ci, cj]) => `${Math.floor(ci / CELLS)},${Math.floor(cj / CELLS)}`;
    detail.beginEdit();
    const changed = new Set();
    if (this.options.clear) {
      const under = new Set(cells.map(([ci, cj]) => `${ci},${cj}`));
      for (const cell of cells) {
        const key = cellKey(cell);
        const tile = decoded.get(key);
        detail.touch(key);
        const [i, j] = [cell[0] - tile.coords[0] * CELLS, cell[1] - tile.coords[1] * CELLS];
        if (parseTree(tile.palettes.terrain[tile.layers.terrain[j * CELLS + i]])) fellTree(tile, i, j);
        tile.layers.clutter ??= new Uint8Array(CELLS * CELLS).fill(100);
        tile.layers.clutter[j * CELLS + i] = 0;
        changed.add(key);
      }
      for (const key of changed) {
        const tile = decoded.get(key);
        const kept = (tile.objects ?? []).filter((o) => !under.has(o.at.map((v) => Math.floor(v / CELL_FT)).join(",")));
        if (kept.length !== (tile.objects ?? []).length) {
          tile.objects = kept;
          detail.dirtyObjects.add(key);
        }
      }
    }
    if (this.options.reshape && ground) detail.setHeights(ground);
    for (const slab of slabs) detail.slabTool.put(slab);
    for (const { type, at: where, yaw, scale, ...rest } of objects) {
      const key = tileOf(where).join(",");
      detail.touch(key);
      const tile = decoded.get(key);
      const object = { ...makeObject(type, where, yaw, scale), ...rest, id: `${key.replace(",", ".")}.${Math.random().toString(36).slice(2, 8)}` };
      tile.objects = [...(tile.objects ?? []), object];
      detail.dirtyObjects.add(key);
    }
    detail.changed(changed);
    detail.freshClutter(changed);
    const reshaped = this.options.reshape && Boolean(ground);
    if (reshaped) detail.rework();
    detail.endEdit({ reflow: reshaped });
  }
}
