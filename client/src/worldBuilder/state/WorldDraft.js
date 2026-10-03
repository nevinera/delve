// What is true in the live draft (see plans/world-editor/README.md, "Two
// layers"): the whole world's content, as the snapshot plus every edit.
// Immutable - every mutator returns a new WorldDraft. Keyed by repo path,
// so the difference from git (changes()) is exactly what Save commits and
// what the local draft store keeps.
//
// A path's value is parsed JSON, a Blob (an upload not yet committed), or
// an ExistingBlob (a file already in git, at a new path - a moved image).
// Editing a file back to what git has drops the edit, so the draft goes
// clean again.
import {ExistingBlob} from "../../github/commitFiles";
import {isJsonPath} from "./RepoSnapshot";

const DELETED = Symbol("deleted");

// Key-order-independent JSON, for comparing drafts to git and hashing.
export function stableStringify(value) {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map((k) => `${JSON.stringify(k)}:${stableStringify(value[k])}`).join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}

// Distinct uploads hash differently even when they look alike.
const blobIds = new WeakMap();
let nextBlobId = 1;
function blobId(blob) {
  if (!blobIds.has(blob)) blobIds.set(blob, nextBlobId++);
  return blobIds.get(blob);
}

function hashString(text) {
  let hash = 5381;
  for (let i = 0; i < text.length; i++) hash = ((hash * 33) ^ text.charCodeAt(i)) >>> 0;
  return hash.toString(36);
}

const under = (path, prefix) => path === prefix || path.startsWith(`${prefix}/`);

export class WorldDraft {
  constructor(snapshot, edits = new Map()) {
    this.snapshot = snapshot;
    this._edits = edits;
    Object.freeze(this);
  }

  static fromSnapshot(snapshot) {
    return new WorldDraft(snapshot);
  }

  get worldKey() {
    return this.snapshot.worldKey;
  }

  exists(path) {
    if (this._edits.has(path)) return this._edits.get(path) !== DELETED;
    return this.snapshot.has(path);
  }

  // JSON content (or an asset's pending value), undefined when absent. An
  // unedited asset reads as undefined; see assetSource.
  read(path) {
    if (this._edits.has(path)) {
      const value = this._edits.get(path);
      return value === DELETED ? undefined : value;
    }
    return this.snapshot.json[path];
  }

  // {blob} for a pending upload, {sha} for a file in git, or null.
  assetSource(path) {
    const value = this.read(path);
    if (value instanceof Blob) return {blob: value};
    if (value instanceof ExistingBlob) return {sha: value.sha};
    if (!this._edits.has(path) && this.snapshot.has(path)) return {sha: this.snapshot.blobSha(path)};
    return null;
  }

  write(path, value) {
    if (value === undefined || value === null) throw new Error(`write ${path}: use remove() to delete`);
    return new WorldDraft(this.snapshot, this._withEdit(new Map(this._edits), path, value));
  }

  update(path, fn) {
    return this.write(path, fn(this.read(path)));
  }

  remove(path) {
    const edits = new Map(this._edits);
    if (this.snapshot.has(path)) edits.set(path, DELETED);
    else edits.delete(path);
    return new WorldDraft(this.snapshot, edits);
  }

  // Back to what git has at path (dropping any pending edit to it).
  revert(path) {
    if (!this._edits.has(path)) return this;
    const edits = new Map(this._edits);
    edits.delete(path);
    return new WorldDraft(this.snapshot, edits);
  }

  removeDir(dir) {
    return this.paths(dir).reduce((draft, path) => draft.remove(path), this);
  }

  // Moves every file under `from` to the same place under `to`. Files
  // already in git move as ExistingBlobs (JSON as content), so nothing is
  // re-uploaded.
  moveDir(from, to) {
    if (this.paths(to).length > 0) throw new Error(`${to} already exists`);
    let edits = new Map(this._edits);
    for (const path of this.paths(from)) {
      const target = `${to}${path.slice(from.length)}`;
      edits = this._withEdit(edits, target, this._movableValue(path));
      if (this.snapshot.has(path)) edits.set(path, DELETED);
      else edits.delete(path);
    }
    return new WorldDraft(this.snapshot, edits);
  }

  // Every existing path under `prefix` (or every path, given none), sorted.
  paths(prefix = null) {
    const all = new Set(Object.keys(this.snapshot.files));
    for (const [path, value] of this._edits) {
      if (value === DELETED) all.delete(path);
      else all.add(path);
    }
    return [...all].filter((path) => prefix === null || under(path, prefix)).sort();
  }

  get hasChanges() {
    return this._edits.size > 0;
  }

  dirtyPaths() {
    return [...this._edits.keys()].sort();
  }

  dirtyUnder(prefix) {
    return this.dirtyPaths().filter((path) => under(path, prefix));
  }

  // path -> content (null to delete): what Save commits.
  changes() {
    return Object.fromEntries(this.dirtyPaths().map((path) => {
      const value = this._edits.get(path);
      return [path, value === DELETED ? null : value];
    }));
  }

  // Replays changes() from an earlier draft (the local draft store) onto
  // this one.
  applyChanges(changes) {
    return Object.entries(changes).reduce((draft, [path, value]) => (value === null ? draft.remove(path) : draft.write(path, value)), this);
  }

  // Total bytes of pending uploads, for the unsaved-work indicator.
  pendingUploadBytes() {
    return [...this._edits.values()].reduce((sum, value) => sum + (value instanceof Blob ? value.size : 0), 0);
  }

  // Identifies this exact content: same base commit and same changes give
  // the same hash. Validate's result is tied to it.
  hash() {
    const changes = this.dirtyPaths().map((path) => {
      const value = this._edits.get(path);
      if (value === DELETED) return [path, "deleted"];
      if (value instanceof Blob) return [path, `blob:${blobId(value)}`];
      if (value instanceof ExistingBlob) return [path, `sha:${value.sha}`];
      return [path, stableStringify(value)];
    });
    return hashString(`${this.snapshot.commitSha}|${stableStringify(changes)}`);
  }

  _movableValue(path) {
    if (this._edits.has(path)) return this._edits.get(path);
    return isJsonPath(path) ? this.snapshot.json[path] : new ExistingBlob(this.snapshot.blobSha(path));
  }

  // Records path=value in edits (mutating the given copy), or drops the
  // edit when value is what git already has there.
  _withEdit(edits, path, value) {
    if (this._matchesGit(path, value)) edits.delete(path);
    else edits.set(path, value);
    return edits;
  }

  _matchesGit(path, value) {
    if (!this.snapshot.has(path)) return false;
    if (value instanceof ExistingBlob) return value.sha === this.snapshot.blobSha(path);
    if (value instanceof Blob) return false;
    return isJsonPath(path) && stableStringify(value) === stableStringify(this.snapshot.json[path]);
  }
}
