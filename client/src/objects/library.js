import { collectionJson, emptyObject, imagePath, newObjectId, objectPath, readCollection } from "../world/builtObjects.js";
import { BUILT_PREFIX, setBuiltObjects, specOf } from "../world/objects.js";
import { slug } from "../editor/zones.js";
import { ObjectBuilder } from "../editor/objectBuilder.js";
import { ObjectGallery } from "../editor/objectGallery.js";
import { StructureBuilder } from "../editor/structureBuilder.js";
import { BUILTIN_IMAGES } from "../world/builtinImages.js";
import { STRUCTURE_PREFIX, emptyStructure, problems as structureProblems, structurePath, withWalk } from "../world/structures.js";
import { KINDS, addCollection, adoptStrays, allCollections, builtObjects, builtStructures, collections, images, ownCollections, wornImages } from "./collections.js";

// A library, of objects or of structures: the gallery of a world's collections of that kind (and
// for objects the builtins), with the object or structure builder popping over it, importing and
// exporting collections. The objects and structures pages show it on its own, and the world editor
// in a popover; both hand it their World and hear about its changes.

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
  // kind: "objects" or "structures". getWorld(): the World holding the library. onChange(choose):
  // the library changed, with a type to pick next if there is one. placedCount(types): how many
  // placed things are of the types (a Set), maybe a promise. say(message, { info }): tells the
  // person something.
  constructor(container, { kind = "objects", getWorld, onChange, placedCount, say }) {
    Object.assign(this, { kind, getWorld, onChange, placedCount, say });
    const one = kind === "objects" ? "object" : "structure";
    this.file = el("input", { type: "file", accept: ".json,application/json", hidden: true });
    this.file.addEventListener("change", async () => {
      const [file] = this.file.files;
      this.file.value = "";
      if (file) this.importObjects(await file.text(), file.name);
    });
    const button = (label, title, onclick) => el("button", { type: "button", textContent: label, title, onclick });
    this.gallery = new ObjectGallery(container, {
      what: one,
      builtins: kind === "objects",
      onOpen: (collection, entry) => this.openEntry(collection, entry),
      onNew: (collection) => {
        const name = window.prompt(`A name for the new ${one}:`);
        if (!name?.trim()) return;
        if (kind === "objects") this.buildObject({ ...emptyObject(name.trim()), collection: collection.id });
        else this.buildStructure({ ...emptyStructure(name.trim()), collection: collection.id });
      },
      onNewCollection: () => {
        const name = window.prompt(`A name for the new collection of ${kind}:`);
        if (!name?.trim()) return;
        addCollection(this.world, name.trim(), undefined, kind);
        this.changed();
      },
      onAction: (collection, action) => this.collectionAction(collection, action),
      tools: [
        button("import file", `a collection or ${one} file; it comes in read-only`, () => this.file.click()),
        button("import from URL", `a collection or ${one} at a URL; it comes in read-only`, () => this.objectsFromUrl()),
        button("export all yours", `every ${one} in your own collections, as one collection file`, () => this.exportOwn()),
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
    this.structureBuilder = new StructureBuilder({
      onSave: (structure) => this.saveStructure(structure),
      onSaveCopy: (structure) => this.saveStructureCopy(structure),
      onDelete: (structure) => this.deleteStructure(structure),
      onSaveImage: (image) => this.saveImage(image),
      onDeleteImage: (image) => this.deleteImage(image),
    });
  }

  get world() {
    return this.getWorld();
  }

  show() {
    this.gallery.show(allCollections(this.world, this.kind));
  }

  hide() {
    this.gallery.hide();
  }

  // After any change: the library's objects registered (world/objects.js), the host told, and the
  // gallery drawn again.
  changed(choose) {
    adoptStrays(this.world);
    setBuiltObjects(builtObjects(this.world), images(this.world), builtStructures(this.world));
    this.onChange?.(choose);
    if (!this.gallery.container.hidden) this.show();
  }

  // Opens the builder on a built object: read-only for one in a builtin or imported collection,
  // offering to copy it into one of the world's own.
  buildObject(object, { readOnly = false } = {}) {
    this.builder.open(object, {
      collections: ownCollections(this.world, "objects"),
      readOnly,
      onCopy: (copy, collection) => this.copyBuiltObject(copy, collection),
      images: () => [...images(this.world), ...BUILTIN_IMAGES],
    });
  }

  saveBuiltObject(object) {
    this.world.writeJson(objectPath(object.id), object);
    this.changed(`${BUILT_PREFIX}${object.id}`);
    this.say(`Saved ${object.name}.`, { info: true });
  }

  saveImage(image) {
    this.world.writeJson(imagePath(image.id), image);
    this.changed();
    this.refreshBuilders();
    this.say(`Saved the image ${image.name}.`, { info: true });
  }

  refreshBuilders() {
    if (this.builder.isOpen) this.builder.refresh();
    if (this.structureBuilder.isOpen) this.structureBuilder.refresh();
  }

  // Deletes an image, unless an object or structure wears it.
  deleteImage(image) {
    const wearers = [
      ...builtObjects(this.world).filter((o) => o.pieces.some((p) => p.tile?.image === image.id || (p.decals ?? []).some((d) => d.image === image.id))),
      ...builtStructures(this.world).filter((s) => Object.values(s.materials).some((m) => m.tile?.image === image.id || m.inside?.image === image.id)),
    ];
    if (wearers.length) return window.alert(`${wearers.map((o) => o.name).join(", ")} ${wearers.length === 1 ? "wears" : "wear"} ${image.name}: take it off first.`);
    if (!window.confirm(`Delete the image ${image.name}?`)) return;
    this.world.files.delete(imagePath(image.id));
    this.builder.painter.close();
    this.structureBuilder.painter.close();
    this.changed();
    this.refreshBuilders();
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

  // Opens the structure builder: read-only for one in a builtin or imported collection.
  buildStructure(structure, { readOnly = false } = {}) {
    this.structureBuilder.open(structure, {
      collections: ownCollections(this.world, "structures"),
      readOnly,
      onCopy: (copy, collection) => {
        const own = { ...copy, id: newObjectId(), collection, source: copy.source ?? "builtin" };
        this.saveStructure(own);
        this.buildStructure(own);
      },
      images: () => [...images(this.world), ...BUILTIN_IMAGES],
      objects: () => allCollections(this.world, "objects"),
    });
  }

  saveStructure(structure) {
    this.world.writeJson(structurePath(structure.id), structure);
    this.changed();
    this.say(`Saved ${structure.name}.`, { info: true });
  }

  saveStructureCopy(structure) {
    const copy = { ...structure, id: newObjectId(), name: `${structure.name} copy` };
    this.saveStructure(copy);
    this.buildStructure(copy);
  }

  // Deletes a structure, unless it's placed somewhere.
  async deleteStructure(structure) {
    if (!this.world.files.has(structurePath(structure.id))) return this.structureBuilder.close();
    const placed = await this.placedCount(new Set([`${STRUCTURE_PREFIX}${structure.id}`]));
    if (placed) return window.alert(`${structure.name} is placed ${plural(placed, "time")}: replace those with something else before deleting it.`);
    if (!window.confirm(`Delete ${structure.name}?`)) return;
    this.world.files.delete(structurePath(structure.id));
    this.structureBuilder.close();
    this.changed();
    this.say(`Deleted ${structure.name}.`, { info: true });
  }

  openEntry(collection, entry) {
    if (entry.structure) return this.buildStructure(structuredClone(entry.structure), { readOnly: collection.kind !== "own" });
    if (entry.object) return this.buildObject(structuredClone(entry.object), { readOnly: collection.kind !== "own" });
    const kit = specOf(entry.type)?.kit;
    if (kit) return this.buildObject(structuredClone(kit), { readOnly: true });
    this.say(`${entry.name} is made in code, not pieces: you can place it, but not open or copy it yet.`, { info: true });
  }

  async collectionAction(collection, action) {
    const objects = builtObjects(this.world).filter((o) => o.collection === collection.id);
    const structures = builtStructures(this.world).filter((s) => s.collection === collection.id);
    if (action === "export") {
      if (!objects.length && !structures.length) return this.say(`${collection.name} is empty.`);
      const worn = wornImages(objects, structures);
      return download(`${slug(collection.name) || "objects"}.json`, `${collectionJson(collection.name, objects, images(this.world).filter((i) => worn.has(i.id)), structures)}\n`);
    }
    const list = collections(this.world, this.kind);
    const index = list.findIndex((c) => c.id === collection.id);
    if (action === "rename") {
      const name = window.prompt("A new name for the collection:", collection.name);
      if (!name?.trim()) return;
      list[index] = { ...list[index], name: name.trim() };
    } else if (action === "delete") {
      const placed = await this.placedCount(new Set([...objects.map((o) => `${BUILT_PREFIX}${o.id}`), ...structures.map((s) => `${STRUCTURE_PREFIX}${s.id}`)]));
      if (placed) return this.say(`${placed} placed thing${placed === 1 ? " comes" : "s come"} from ${collection.name}: replace them with something else before deleting it.`);
      if (!window.confirm(`Delete ${collection.name} and its ${this.kind === "objects" ? plural(objects.length, "object") : plural(structures.length, "structure")}?`)) return;
      for (const o of objects) this.world.files.delete(objectPath(o.id));
      for (const s of structures) this.world.files.delete(structurePath(s.id));
      list.splice(index, 1);
    }
    this.world.writeJson(KINDS[this.kind].path, list);
    this.changed();
  }

  // Copies an object or collection's JSON into the world as a new read-only collection, each
  // object recording `source` (a URL, or the file's name). An object whose id the world already
  // has gets a new one, so a newer version comes in beside the old, for replacing placed ones.
  importObjects(text, from, source = from) {
    let read;
    try {
      read = readCollection(text, source);
      for (const structure of read.structures) {
        const wrong = structureProblems(structure);
        if (wrong.length) throw new Error(`${structure.name ?? structure.id ?? "a structure"}: ${wrong.join("; ")}`);
      }
    } catch (err) {
      return this.say(`Couldn't import ${from}: ${err.message}`);
    }
    // Objects go in a new collection of objects, structures in one of structures, named alike.
    const name = read.name ?? from.replace(/\.json$/i, "");
    if (!read.objects.length && !read.structures.length) return this.say(`${from} has nothing in it to import.`);
    const objectCollection = read.objects.length ? addCollection(this.world, name, source, "objects") : null;
    const structureCollection = read.structures.length ? addCollection(this.world, name, source, "structures") : null;
    let renamed = 0;
    // Images join the world's, keeping their ids, unless the world has a different image by that
    // id already: then they get new ones, and the things wearing them wear those.
    const ids = new Map();
    const pixels = ({ source, collection, ...image }) => JSON.stringify(image);
    for (const image of read.images) {
      const path = imagePath(image.id);
      const same = this.world.files.has(path) && pixels(this.world.readJson(path)) === pixels(image);
      const id = same || !this.world.files.has(path) ? image.id : newObjectId();
      ids.set(image.id, id);
      if (!same) this.world.writeJson(imagePath(id), { ...image, id });
    }
    for (const object of read.objects) {
      for (const piece of object.pieces) for (const use of [...(piece.decals ?? []), piece.tile].filter(Boolean)) use.image = ids.get(use.image) ?? use.image;
      if (this.world.files.has(objectPath(object.id))) {
        object.id = newObjectId();
        renamed++;
      }
      this.world.writeJson(objectPath(object.id), { ...object, collection: objectCollection.id });
    }
    for (const structure of read.structures) {
      for (const m of Object.values(structure.materials)) for (const use of [m.tile, m.inside].filter(Boolean)) use.image = ids.get(use.image) ?? use.image;
      if (this.world.files.has(structurePath(structure.id))) {
        structure.id = newObjectId();
        renamed++;
      }
      this.world.writeJson(structurePath(structure.id), withWalk({ ...structure, collection: structureCollection.id }));
    }
    this.changed();
    const parts = [read.objects.length && `${plural(read.objects.length, "object")} into objects`, read.structures.length && `${plural(read.structures.length, "structure")} into structures`].filter(Boolean);
    this.say(`Imported ${name}: ${parts.join(" and ")}${renamed ? `, ${renamed} of them already here, so with new ids` : ""}.`, { info: true });
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
    const own = new Set(ownCollections(this.world, this.kind).map((c) => c.id));
    const objects = builtObjects(this.world).filter((o) => own.has(o.collection));
    const structures = builtStructures(this.world).filter((s) => own.has(s.collection));
    if (!objects.length && !structures.length) return this.say(`There are no ${this.kind} of your own to export yet.`);
    const name = window.prompt("A name for the collection:", this.world.info?.name ?? "objects");
    const worn = wornImages(objects, structures);
    if (name) download(`${slug(name) || "objects"}.json`, `${collectionJson(name, objects, images(this.world).filter((i) => worn.has(i.id)), structures)}\n`);
  }
}
