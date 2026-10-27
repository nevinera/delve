import * as THREE from "three";
import { matches } from "../world/builtObjects.js";
import { disposePreview, typePreview } from "./objectMeshes.js";
import { structureGroup } from "./structureMeshes.js";
import { imageOf } from "../world/objects.js";

// The objects step: every object type in the world's collections and the game's builtins, as a
// gallery of rendered thumbnails grouped by collection, filtered by a search. Your own collections
// start with a "+" tile for a new object. One offscreen renderer draws every thumbnail; the one
// under the pointer turns.
//
// show(collections) takes [{ id, name, kind: "builtin" | "imported" | "own", source, entries }],
// each entry { key, type, name, tags, structure }: key is unique across the gallery and changes
// when the object does, type is what typePreview draws; a structure is drawn as itself.

const THUMB_PX = 140;
const PER_FRAME = 4; // thumbnails drawn per animation frame, so a big gallery doesn't stall
const TURN_PER_MS = 0.0012;
const BACKGROUND = 0x20242a;
const KIND_LABELS = { builtin: "builtin", imported: "imported, read-only", own: "" };

function el(tag, props = {}, ...children) {
  const node = Object.assign(document.createElement(tag), props);
  node.append(...children.filter((c) => c !== null && c !== undefined));
  return node;
}

export class ObjectGallery {
  // onOpen(collection, entry), onNew(collection) and onNewStructure(collection) for the "+" tiles,
  // onNewCollection(), and onAction(collection,
  // action) for a collection heading's buttons: "rename", "export" or "delete". tools: more
  // elements for the bar at the top.
  constructor(container, { onOpen, onNew, onNewStructure, onNewCollection, onAction, tools = [] }) {
    this.container = container;
    Object.assign(this, { onOpen, onNew, onNewStructure, onNewCollection, onAction });
    this.collections = [];
    this.queue = [];
    this.search = el("input", { type: "search", placeholder: "search collections, names and tags", className: "gallery-search" });
    this.search.addEventListener("input", () => this.render());
    this.noBuiltins = el("input", { type: "checkbox", onchange: () => this.render() });
    const top = el(
      "div",
      { className: "gallery-top" },
      this.search,
      el("label", { className: "gallery-check" }, this.noBuiltins, el("span", { textContent: "exclude builtins" })),
      el("button", { type: "button", textContent: "new collection", onclick: () => this.onNewCollection?.() }),
      ...tools,
    );
    this.sections = el("div", { className: "gallery-sections" });
    container.append(top, this.sections);
  }

  show(collections) {
    this.collections = collections;
    this.container.hidden = false;
    this.render();
  }

  hide() {
    this.container.hidden = true;
    this.stopTurning();
  }

  render() {
    this.stopTurning();
    this.queue = [];
    const text = this.search.value;
    this.sections.replaceChildren(
      ...this.collections
        .filter((c) => !(this.noBuiltins.checked && c.kind === "builtin"))
        .map((collection) => {
          const entries = collection.entries.filter((e) => matches(text, collection.name, e.name, e.tags));
          if (text.trim() && !entries.length) return null;
          return this.section(collection, entries);
        })
        .filter(Boolean),
    );
    if (!this.sections.children.length) this.sections.append(el("p", { className: "gallery-none", textContent: "Nothing matches." }));
    this.drawQueued();
  }

  section(collection, entries) {
    const button = (action, label) => el("button", { type: "button", textContent: label, onclick: () => this.onAction?.(collection, action) });
    const actions = { own: [button("rename", "rename"), button("export", "export"), button("delete", "delete")], imported: [button("export", "export"), button("delete", "delete")], builtin: [] }[collection.kind];
    const kind = KIND_LABELS[collection.kind];
    const head = el(
      "div",
      { className: "gallery-head" },
      el("h3", { textContent: collection.name }),
      kind ? el("span", { className: "gallery-kind", textContent: kind, title: collection.source ?? "" }) : null,
      ...actions,
    );
    const tiles = entries.map((entry) => this.tile(collection, entry));
    if (collection.kind === "own") {
      const plus = (what, onclick) => el("button", { type: "button", className: "gallery-tile gallery-new", title: `a new ${what} in this collection`, onclick }, el("span", { textContent: "+" }), el("span", { className: "gallery-new-what", textContent: what }));
      tiles.unshift(plus("object", () => this.onNew?.(collection)), plus("structure", () => this.onNewStructure?.(collection)));
    }
    return el("section", { className: "gallery-collection" }, head, el("div", { className: "gallery-tiles" }, ...tiles));
  }

  tile(collection, entry) {
    const canvas = el("canvas", { width: THUMB_PX, height: THUMB_PX });
    const tile = el("button", { type: "button", className: "gallery-tile", title: entry.tags?.length ? `${entry.name} · ${entry.tags.join(", ")}` : entry.name, onclick: () => this.onOpen?.(collection, entry) }, canvas, el("span", { className: "gallery-name", textContent: entry.name }));
    tile.addEventListener("pointerenter", () => this.startTurning(entry, canvas));
    tile.addEventListener("pointerleave", () => this.stopTurning());
    this.queue.push({ entry, canvas });
    return tile;
  }

  // --- drawing ---

  setup() {
    if (this.renderer) return;
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, preserveDrawingBuffer: true });
    this.renderer.setSize(THUMB_PX, THUMB_PX, false);
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(BACKGROUND);
    this.scene.add(new THREE.HemisphereLight(0xdde8ff, 0x4a4030, 1.6));
    const sun = new THREE.DirectionalLight(0xffffff, 1.6);
    sun.position.set(3, 5, 2);
    this.scene.add(sun);
    this.camera = new THREE.PerspectiveCamera(35, 1, 0.1, 2000);
    this.previews = new Map(); // key -> group, kept while the gallery shows it
  }

  preview(entry) {
    if (!this.previews.has(entry.key)) {
      const preview = entry.structure ? structureGroup(entry.structure, { imageOf }) : typePreview(entry.type);
      if (entry.structure) preview.traverse((mesh) => (mesh.userData.ownGeometry = true));
      this.previews.set(entry.key, preview);
    }
    return this.previews.get(entry.key);
  }

  // Draws one entry, turned `turn` radians, into a 2D canvas.
  draw(entry, canvas, turn = 0.6) {
    this.setup();
    const group = this.preview(entry);
    group.rotation.y = turn;
    this.scene.add(group);
    const sphere = new THREE.Box3().setFromObject(group).getBoundingSphere(new THREE.Sphere());
    const reach = Math.max(sphere.radius, 0.5) / Math.sin(THREE.MathUtils.degToRad(this.camera.fov / 2));
    this.camera.position.copy(sphere.center).add(new THREE.Vector3(0, 0.45, 1).normalize().multiplyScalar(reach));
    this.camera.lookAt(sphere.center);
    this.renderer.render(this.scene, this.camera);
    this.scene.remove(group);
    canvas.getContext("2d").drawImage(this.renderer.domElement, 0, 0, canvas.width, canvas.height);
  }

  drawQueued() {
    cancelAnimationFrame(this.drawing);
    const step = () => {
      for (const { entry, canvas } of this.queue.splice(0, PER_FRAME)) this.draw(entry, canvas);
      if (this.queue.length) this.drawing = requestAnimationFrame(step);
      else this.dropUnused();
    };
    this.drawing = requestAnimationFrame(step);
  }

  // Frees previews of objects no longer in the gallery (deleted or changed).
  dropUnused() {
    const keys = new Set(this.collections.flatMap((c) => c.entries.map((e) => e.key)));
    for (const [key, group] of this.previews ?? []) {
      if (keys.has(key)) continue;
      disposePreview(group);
      this.previews.delete(key);
    }
  }

  startTurning(entry, canvas) {
    this.stopTurning();
    const start = performance.now();
    const loop = (now) => {
      this.draw(entry, canvas, 0.6 + (now - start) * TURN_PER_MS);
      this.turning = requestAnimationFrame(loop);
    };
    this.turning = requestAnimationFrame(loop);
  }

  stopTurning() {
    cancelAnimationFrame(this.turning);
    this.turning = null;
  }
}
