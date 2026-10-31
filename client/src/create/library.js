import { strFromU8, strToU8 } from "fflate";
import { addCollection, adoptStrays, allCollections, builtObjects, images, keepTemplate, ownCollections } from "../objects/collections.js";
import { BUILTIN_TEMPLATES } from "../world/builtinTemplates.js";
import { setBuiltObjects } from "../world/objects.js";
import { templatePath } from "../world/paths.js";
import { TEMPLATE_PREFIX } from "../world/templates.js";

// The world's library of objects and templates (objects/collections.js: collections.json,
// objects/, templates/ and textures/), read from its files, with the game's builtins, and the
// things picked from it lately, RECENT of each kind, kept in this browser for each world, most
// lately first. Templates made here are kept in its files, and saved with the rest.

export const RECENT = 12;
export const CLIPBOARD_PREFIX = "clipboard:"; // the type of what was copied, "clipboard:<id>"

export class Library {
  // files: the world's, path -> bytes, which templates made are written into too.
  constructor(files, worldName) {
    this.files = files;
    this.dirty = new Set(); // paths written since they were saved
    this.version = 0;
    this.recentKey = `create:recent:${worldName}`;
    this.clipboard = null; // the template copied last, kept in this browser, not the world's files
    this.keepClipboard = () => {}; // keeps it, once it's copied
    try {
      this.recent = { objects: [], templates: [], ...JSON.parse(localStorage.getItem(this.recentKey)) };
    } catch {
      this.recent = { objects: [], templates: [] };
    }
    adoptStrays(this);
    this.register();
  }

  readJson(path) {
    const bytes = this.files.get(path);
    return bytes ? JSON.parse(strFromU8(bytes)) : null;
  }

  writeJson(path, data) {
    this.files.set(path, strToU8(`${JSON.stringify(data, null, 2)}\n`));
    this.dirty.add(path);
    this.version++;
    this.onChange?.();
  }

  deleteFile(path) {
    this.files.delete(path);
    this.dirty.add(path);
    this.version++;
    this.onChange?.();
  }

  // Makes the world's built objects known as types.
  register() {
    setBuiltObjects(builtObjects(this), images(this));
  }

  // Every collection of `kind`, "objects" or "templates", builtins first (allCollections).
  collections(kind) {
    return allCollections(this, kind);
  }

  // The entry of `kind` for `type` ("built:<id>", a builtin kind, or "template:<id>"), or null.
  entry(kind, type) {
    for (const collection of this.collections(kind)) {
      const entry = collection.entries.find((e) => e.type === type);
      if (entry) return entry;
    }
    return null;
  }

  // The template a "template:<id>" type names, or what was copied for "clipboard:<id>", or null.
  template(type) {
    if (type?.startsWith(CLIPBOARD_PREFIX)) return type === this.clipboardType() ? this.clipboard : null;
    const id = type?.slice(TEMPLATE_PREFIX.length);
    return this.readJson(`templates/${id}.json`) ?? BUILTIN_TEMPLATES.find((t) => t.id === id) ?? null;
  }

  // The type of what was copied last, or null.
  clipboardType() {
    return this.clipboard && `${CLIPBOARD_PREFIX}${this.clipboard.id}`;
  }

  // Puts `type` first in the recent things of `kind`; not what was copied.
  used(kind, type) {
    if (type?.startsWith(CLIPBOARD_PREFIX)) return;
    this.recent[kind] = [type, ...this.recent[kind].filter((t) => t !== type)].slice(0, RECENT);
    try {
      localStorage.setItem(this.recentKey, JSON.stringify(this.recent));
    } catch {}
  }

  // The recent things of `kind` still in the library, as entries.
  recentEntries(kind) {
    return this.recent[kind].map((type) => this.entry(kind, type)).filter(Boolean);
  }

  // The world's own collections of templates, not those read from elsewhere.
  templateCollections() {
    return ownCollections(this, "templates");
  }

  // Keeps a new template in the collection with id `collection`, or a new one named `newName`, or
  // else "my templates" (keepTemplate), and gives its type.
  keepTemplate(template, { collection, newName } = {}) {
    const id = newName ? addCollection(this, newName, undefined, "templates").id : collection;
    const kept = keepTemplate(this, { ...template, ...(id ? { collection: id } : {}) });
    return `${TEMPLATE_PREFIX}${kept.id}`;
  }

  // Keeps `template`'s slabs and objects, and its ground if it has some, in place of `old`'s, `old`
  // keeping its id, name, collection and tags.
  replaceTemplate(old, template) {
    const { ground: _, ...kept } = old;
    this.writeJson(templatePath(old.id), { ...kept, slabs: template.slabs, objects: template.objects, ...(template.ground ? { ground: template.ground } : {}) });
  }

  // The files written since they were last saved, path -> bytes.
  unsavedFiles() {
    const files = new Map([...this.dirty].map((path) => [path, this.files.get(path) ?? null]));
    this.dirty.clear();
    return files;
  }
}
