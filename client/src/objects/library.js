import { collectionJson, emptyObject, imagePath, newObjectId, objectPath, readCollection } from "../world/builtObjects.js";
import { BUILT_PREFIX, setBuiltObjects, specOf } from "../world/objects.js";
import { COLLECTIONS_PATH } from "../editor/libraryStore.js";
import { slug } from "../editor/zones.js";
import { ObjectBuilder } from "../editor/objectBuilder.js";
import { ObjectGallery } from "../editor/objectGallery.js";
import { addCollection, adoptStrays, allCollections, builtObjects, collections, images, ownCollections } from "./collections.js";

// The object library: the gallery of a world's collections and the builtins, with the builder
// popping over it, importing and exporting collections. The objects page shows it on its own, and
// the world editor in a popover; both hand it their World and hear about its changes.

function el(tag, props = {}, ...children) {
  const node = Object.assign(document.createElement(tag), props);
  node.append(...children);
  return node;
}

// Hands the browser a file to save.
function download(name, text) {
  const link = document.createElement("a");
  link.href = URL.createObjectURL(new Blob([text], { type: "application/json" }));
  link.download = name;
  link.click();
  URL.revokeObjectURL(link.href);
}

const plural = (n, word) => `${n} ${word}${n === 1 ? "" : "s"}`;

export class ObjectLibrary {
  // getWorld(): the World holding the library. onChange(choose): the library changed, with a type
  // to pick next if there is one. placedCount(types): how many placed objects are of the types (a
  // Set), maybe a promise. say(message, { info }): tells the person something.
  constructor(container, { getWorld, onChange, placedCount, say }) {
    Object.assign(this, { getWorld, onChange, placedCount, say });
    this.file = el("input", { type: "file", accept: ".json,application/json", hidden: true });
    this.file.addEventListener("change", async () => {
      const [file] = this.file.files;
      this.file.value = "";
      if (file) this.importObjects(await file.text(), file.name);
    });
    const button = (label, title, onclick) => el("button", { type: "button", textContent: label, title, onclick });
    this.gallery = new ObjectGallery(container, {
      onOpen: (collection, entry) => this.openEntry(collection, entry),
      onNew: (collection) => {
        const name = window.prompt("A name for the new object:");
        if (name?.trim()) this.buildObject({ ...emptyObject(name.trim()), collection: collection.id });
      },
      onNewCollection: () => {
        const name = window.prompt("A name for the new collection:");
        if (!name?.trim()) return;
        addCollection(this.world, name.trim());
        this.changed();
      },
      onAction: (collection, action) => this.collectionAction(collection, action),
      tools: [
        button("import file", "a collection or object file; it comes in read-only", () => this.file.click()),
        button("import from URL", "a collection or object at a URL; it comes in read-only", () => this.objectsFromUrl()),
        button("export all yours", "every object in your own collections, as one collection file", () => this.exportOwn()),
        this.file,
      ],
    });
    this.builder = new ObjectBuilder({
      onSave: (object) => this.saveBuiltObject(object),
      onSaveCopy: (object) => this.saveCopy(object),
      onDelete: (object) => this.deleteBuiltObject(object),
      onSaveImage: (image) => this.saveImage(image),
      onDeleteImage: (image) => this.deleteImage(image),
    });
  }

  get world() {
    return this.getWorld();
  }

  show() {
    this.gallery.show(allCollections(this.world));
  }

  hide() {
    this.gallery.hide();
  }

  // After any change: the library's objects registered (world/objects.js), the host told, and the
  // gallery drawn again.
  changed(choose) {
    adoptStrays(this.world);
    setBuiltObjects(builtObjects(this.world), images(this.world));
    this.onChange?.(choose);
    if (!this.gallery.container.hidden) this.show();
  }

  // Opens the builder on a built object: read-only for one in a builtin or imported collection,
  // offering to copy it into one of the world's own.
  buildObject(object, { readOnly = false } = {}) {
    this.builder.open(object, {
      collections: ownCollections(this.world),
      readOnly,
      onCopy: (copy, collection) => this.copyBuiltObject(copy, collection),
      images: () => images(this.world, this.builder.object?.collection),
    });
  }

  saveBuiltObject(object) {
    this.bringImages(object);
    this.world.writeJson(objectPath(object.id), object);
    this.changed(`${BUILT_PREFIX}${object.id}`);
    this.say(`Saved ${object.name}.`, { info: true });
  }

  // Copies the images an object wears from other collections into its own (as moving or copying
  // it between collections needs), with new ids, changing `object` to wear the copies.
  bringImages(object) {
    const copies = new Map(); // old id -> new
    for (const piece of object.pieces) {
      for (const use of [...(piece.decals ?? []), piece.tile].filter(Boolean)) {
        if (!copies.has(use.image)) {
          const path = imagePath(use.image);
          const image = this.world.files.has(path) && this.world.readJson(path);
          if (image && image.collection !== object.collection) {
            const copy = { ...image, id: newObjectId(), collection: object.collection };
            this.world.writeJson(imagePath(copy.id), copy);
            copies.set(use.image, copy.id);
          } else copies.set(use.image, use.image);
        }
        use.image = copies.get(use.image);
      }
    }
  }

  saveImage(image) {
    this.world.writeJson(imagePath(image.id), image);
    this.changed();
    this.builder.refresh();
    this.say(`Saved the image ${image.name}.`, { info: true });
  }

  // Deletes an image, unless an object wears it.
  deleteImage(image) {
    const wearers = builtObjects(this.world).filter((o) => o.pieces.some((p) => p.tile?.image === image.id || (p.decals ?? []).some((d) => d.image === image.id)));
    if (wearers.length) return window.alert(`${wearers.map((o) => o.name).join(", ")} ${wearers.length === 1 ? "wears" : "wear"} ${image.name}: take it off first.`);
    if (!window.confirm(`Delete the image ${image.name}?`)) return;
    this.world.files.delete(imagePath(image.id));
    this.builder.painter.close();
    this.changed();
    this.builder.refresh();
  }

  // Saves an object as a new one in the same collection, and goes on with the copy.
  saveCopy(object) {
    const copy = { ...object, id: newObjectId(), name: `${object.name} copy` };
    this.saveBuiltObject(copy);
    this.buildObject(copy);
  }

  // Deletes a built object, unless it's placed somewhere.
  async deleteBuiltObject(object) {
    if (!this.world.files.has(objectPath(object.id))) return this.builder.close();
    const placed = await this.placedCount(new Set([`${BUILT_PREFIX}${object.id}`]));
    if (placed) return window.alert(`${object.name} is placed ${plural(placed, "time")}: replace those with something else before deleting it.`);
    if (!window.confirm(`Delete ${object.name}?`)) return;
    this.world.files.delete(objectPath(object.id));
    this.builder.close();
    this.changed();
    this.say(`Deleted ${object.name}.`, { info: true });
  }

  // A copy of a read-only object in one of the world's own collections, opened to change.
  copyBuiltObject(object, collection) {
    const copy = { ...object, id: newObjectId(), collection, source: object.source ?? "builtin" };
    this.saveBuiltObject(copy);
    this.buildObject(copy);
  }

  openEntry(collection, entry) {
    if (entry.object) return this.buildObject(structuredClone(entry.object), { readOnly: collection.kind !== "own" });
    const kit = specOf(entry.type)?.kit;
    if (kit) return this.buildObject(structuredClone(kit), { readOnly: true });
    this.say(`${entry.name} is made in code, not pieces: you can place it, but not open or copy it yet.`, { info: true });
  }

  async collectionAction(collection, action) {
    const objects = builtObjects(this.world).filter((o) => o.collection === collection.id);
    if (action === "export") {
      if (!objects.length) return this.say(`${collection.name} is empty.`);
      return download(`${slug(collection.name) || "objects"}.json`, `${collectionJson(collection.name, objects, images(this.world, collection.id))}\n`);
    }
    const list = collections(this.world);
    const index = list.findIndex((c) => c.id === collection.id);
    if (action === "rename") {
      const name = window.prompt("A new name for the collection:", collection.name);
      if (!name?.trim()) return;
      list[index] = { ...list[index], name: name.trim() };
    } else if (action === "delete") {
      const placed = await this.placedCount(new Set(objects.map((o) => `${BUILT_PREFIX}${o.id}`)));
      if (placed) return this.say(`${placed} placed object${placed === 1 ? " comes" : "s come"} from ${collection.name}: replace them with something else before deleting it.`);
      if (!window.confirm(`Delete ${collection.name} and its ${plural(objects.length, "object")}?`)) return;
      for (const o of objects) this.world.files.delete(objectPath(o.id));
      for (const image of images(this.world, collection.id)) this.world.files.delete(imagePath(image.id));
      list.splice(index, 1);
    }
    this.world.writeJson(COLLECTIONS_PATH, list);
    this.changed();
  }

  // Copies an object or collection's JSON into the world as a new read-only collection, each
  // object recording `source` (a URL, or the file's name). An object whose id the world already
  // has gets a new one, so a newer version comes in beside the old, for replacing placed ones.
  importObjects(text, from, source = from) {
    let read;
    try {
      read = readCollection(text, source);
    } catch (err) {
      return this.say(`Couldn't import ${from}: ${err.message}`);
    }
    const collection = addCollection(this.world, read.name ?? from.replace(/\.json$/i, ""), source);
    let renamed = 0;
    // Images keep their ids unless the world has them already; objects wear the new ones.
    const ids = new Map();
    for (const image of read.images) {
      const id = this.world.files.has(imagePath(image.id)) ? newObjectId() : image.id;
      ids.set(image.id, id);
      this.world.writeJson(imagePath(id), { ...image, id, collection: collection.id });
    }
    for (const object of read.objects) {
      for (const piece of object.pieces) for (const use of [...(piece.decals ?? []), piece.tile].filter(Boolean)) use.image = ids.get(use.image) ?? use.image;
      if (this.world.files.has(objectPath(object.id))) {
        object.id = newObjectId();
        renamed++;
      }
      this.world.writeJson(objectPath(object.id), { ...object, collection: collection.id });
    }
    this.changed();
    this.say(`Imported ${collection.name}, ${plural(read.objects.length, "object")}${renamed ? `, ${renamed} of them already here, so with new ids` : ""}.`, { info: true });
  }

  async objectsFromUrl() {
    const url = window.prompt("The URL of an object or collection (JSON):");
    if (!url) return;
    try {
      const response = await fetch(url);
      if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
      this.importObjects(await response.text(), url, url);
    } catch (err) {
      this.say(`Couldn't load ${url}: ${err.message}`);
    }
  }

  exportOwn() {
    const own = new Set(ownCollections(this.world).map((c) => c.id));
    const objects = builtObjects(this.world).filter((o) => own.has(o.collection));
    if (!objects.length) return this.say("There are no objects of your own to export yet.");
    const name = window.prompt("A name for the collection:", this.world.info?.name ?? "objects");
    const worn = new Set(objects.flatMap((o) => o.pieces.flatMap((p) => [...(p.decals ?? []).map((d) => d.image), p.tile?.image])));
    if (name) download(`${slug(name) || "objects"}.json`, `${collectionJson(name, objects, images(this.world).filter((i) => worn.has(i.id)))}\n`);
  }
}
