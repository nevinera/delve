import { oneTilePerSet } from "../objects/collections.js";
import { Thumbnails } from "../render/thumbnailRenderer.js";

// The detail step's picker of things to place: a library's collections (objects/collections.js
// allCollections), one at a time opened to its thumbnails. Clicking a thumbnail arms that type,
// which clicking the ground then places; clicking it again, or disarm(), lets it go. A variant set
// (objects/collections.js oneTilePerSet) shows as one tile, armed whichever of it is armed.

const THUMB_PX = 72;

function el(tag, props = {}, ...children) {
  const node = Object.assign(document.createElement(tag), props);
  node.append(...children.filter((c) => c !== null && c !== undefined));
  return node;
}

export class PlacePicker {
  // onArm(type) hears the type armed, or null.
  constructor(container, { onArm }) {
    this.container = container;
    this.onArm = onArm;
    this.thumbs = new Thumbnails();
    this.collections = [];
    this.open = null; // the id of the collection showing its thumbnails
    this.armed = null;
  }

  // collections: [{ id, name, kind, entries }], as allCollections gives them.
  show(collections) {
    this.collections = collections.filter((c) => c.entries.length);
    if (this.armed && !this.collections.some((c) => c.entries.some((e) => e.type === this.armed))) this.arm(null);
    this.open ??= this.collections.find((c) => c.entries.some((e) => e.type === this.armed))?.id ?? null;
    this.render();
  }

  render() {
    const queue = [];
    const sections = this.collections.map((collection) => {
      const open = collection.id === this.open;
      const head = el("button", {
        type: "button",
        className: `picker-head${open ? " open" : ""}`,
        textContent: `${open ? "▾" : "▸"} ${collection.kind === "builtin" ? `builtin: ${collection.name}` : collection.name}`,
        onclick: () => {
          this.open = open ? null : collection.id;
          this.render();
        },
      });
      if (!open) return head;
      const tiles = oneTilePerSet(collection.entries).map((entry) => {
        const armed = entry.members.includes(this.armed);
        const canvas = el("canvas", { width: THUMB_PX, height: THUMB_PX });
        const tile = el("button", { type: "button", className: `picker-tile${armed ? " armed" : ""}`, title: entry.name, onclick: () => this.arm(armed ? null : entry.type) }, canvas, el("span", { textContent: entry.name }));
        tile.addEventListener("pointerenter", () => this.thumbs.startTurning(entry, canvas));
        tile.addEventListener("pointerleave", () => this.thumbs.stopTurning());
        queue.push({ entry, canvas });
        return tile;
      });
      return el("div", {}, head, el("div", { className: "picker-tiles" }, ...tiles));
    });
    this.container.replaceChildren(...(sections.length ? sections : [el("p", { className: "editor-empty", textContent: "Nothing to place yet." })]));
    this.thumbs.drawAll(queue, new Set(this.collections.flatMap((c) => c.entries.map((e) => e.key))));
  }

  // Arms a type to place, opening its collection, or lets go with null.
  arm(type) {
    this.armed = type;
    if (type) this.open = this.collections.find((c) => c.entries.some((e) => e.type === type))?.id ?? this.open;
    this.render();
    this.onArm?.(type);
  }

  hide() {
    this.thumbs.stopTurning();
  }
}
