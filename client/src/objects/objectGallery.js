import { matches } from "../world/builtObjects.js";
import { Thumbnails } from "../render/thumbnailRenderer.js";

// A library's gallery: every object type in the world's collections and the game's builtins, as
// rendered thumbnails grouped by collection, filtered by a search. Your own collections start with a "+" tile for a new one.
// Thumbnails (thumbnailRenderer.js) draws them as they scroll into view, since there are many.
//
// show(collections) takes [{ id, name, kind: "builtin" | "imported" | "own", source, entries }],
// each entry { key, type, name, tags }: key is unique across the gallery and changes when the
// object does, type is what typePreview draws.

const THUMB_PX = 140;
const KIND_LABELS = { builtin: "builtin", imported: "imported, read-only", own: "" };

function el(tag, props = {}, ...children) {
  const node = Object.assign(document.createElement(tag), props);
  node.append(...children.filter((c) => c !== null && c !== undefined));
  return node;
}

export class ObjectGallery {
  // what: what the "+" tiles make, "object". builtins: whether there are builtin
  // collections to leave out. onOpen(collection, entry), onNew(collection) for a "+" tile,
  // onNewCollection(), and onAction(collection, action) for a collection heading's buttons:
  // "rename", "export" or "delete". tools: more elements for the bar at the top.
  constructor(container, { what = "object", builtins = true, onOpen, onNew, onNewCollection, onAction, tools = [] }) {
    this.container = container;
    Object.assign(this, { what, onOpen, onNew, onNewCollection, onAction });
    this.collections = [];
    this.thumbs = new Thumbnails();
    this.queue = [];
    this.search = el("input", { type: "search", placeholder: "search collections, names and tags", className: "gallery-search" });
    this.search.addEventListener("input", () => this.render());
    this.noBuiltins = el("input", { type: "checkbox", onchange: () => this.render() });
    const top = el(
      "div",
      { className: "gallery-top" },
      this.search,
      builtins ? el("label", { className: "gallery-check" }, this.noBuiltins, el("span", { textContent: "exclude builtins" })) : null,
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
    this.thumbs.stopTurning();
  }

  render() {
    this.visible?.disconnect();
    this.visible = globalThis.IntersectionObserver && new IntersectionObserver((seen) => this.drawSeen(seen), { rootMargin: "300px" });
    this.queue = new Map();
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
    this.thumbs.drawAll([], new Set(this.collections.flatMap((c) => c.entries.map((e) => e.key))));
    if (!this.visible) for (const { entry, canvas } of this.queue.values()) this.thumbs.enqueue(entry, canvas);
  }

  drawSeen(seen) {
    for (const { target, isIntersecting } of seen) {
      if (!isIntersecting) continue;
      const { entry, canvas } = this.queue.get(target);
      this.visible.unobserve(target);
      this.thumbs.enqueue(entry, canvas);
    }
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
      tiles.unshift(plus(this.what, () => this.onNew?.(collection)));
    }
    return el("section", { className: "gallery-collection" }, head, el("div", { className: "gallery-tiles" }, ...tiles));
  }

  tile(collection, entry) {
    const canvas = el("canvas", { width: THUMB_PX, height: THUMB_PX });
    const tile = el("button", { type: "button", className: "gallery-tile", title: [entry.name, entry.object?.variantSet && `a variant of ${entry.object.variantSet}`, entry.tags?.join(", ")].filter(Boolean).join(" · "), onclick: () => this.onOpen?.(collection, entry) }, canvas, el("span", { className: "gallery-name", textContent: entry.name }));
    tile.addEventListener("pointerenter", () => this.thumbs.startTurning(entry, canvas));
    tile.addEventListener("pointerleave", () => this.thumbs.stopTurning());
    this.queue.set(tile, { entry, canvas });
    this.visible?.observe(tile);
    return tile;
  }
}
