import { describe, expect, it } from "vitest";
import { strFromU8, strToU8 } from "fflate";
import { ContinentFiles } from "./continentFiles.js";

const tool = (json = { a: 1 }) => ({ json, version: 0, load(j) { this.json = j; }, toJSON() { return this.json; } });
const fileOf = (path, t, more = {}) => ({ path, load: (j) => t.load(j), toJSON: () => t.toJSON(), version: () => t.version, ...more });

describe("ContinentFiles", () => {
  it("reads each from the world and bakes it in as it opens", () => {
    const t = tool();
    const baked = [];
    const files = new ContinentFiles(new Map([["x.json", strToU8('{"b":2}')]]), new Map());
    files.add(fileOf("x.json", t, { bake: (opening) => baked.push(opening) }), 0);
    expect(t.json).toEqual({ b: 2 });
    expect(baked).toEqual([true]);
    expect(files.unsaved()).toBe(false);
  });

  it("writes what's changed, and counts it saved once it's stored", () => {
    const t = tool();
    const changes = new Map();
    const files = new ContinentFiles(new Map(), changes);
    files.add(fileOf("x.json", t), 0);
    t.version++;
    expect(files.unsaved()).toBe(true);
    const written = files.write();
    expect(JSON.parse(strFromU8(changes.get("x.json")))).toEqual({ a: 1 });
    expect(files.unsaved()).toBe(true);
    written();
    expect(files.unsaved()).toBe(false);
  });

  it("leaves out a file it needn't keep, unless the world had it", () => {
    const [t, u] = [tool(), tool()];
    const changes = new Map();
    const files = new ContinentFiles(new Map([["had.json", strToU8("{}")]]), changes);
    files.add(fileOf("none.json", t, { keep: (had) => had }), 0);
    files.add(fileOf("had.json", u, { keep: (had) => had }), 0);
    files.write();
    expect([...changes.keys()]).toEqual(["had.json"]);
  });

  it("bakes again when the version moves on, but not while it's busy", () => {
    const t = tool();
    const baked = [];
    let busy = true;
    const files = new ContinentFiles(new Map(), new Map());
    files.add(fileOf("x.json", t, { bake: (opening) => baked.push(opening), busy: () => busy }), 0);
    files.bake();
    t.version++;
    files.bake();
    busy = false;
    files.bake();
    files.bake();
    expect(baked).toEqual([true, false]);
  });
});
