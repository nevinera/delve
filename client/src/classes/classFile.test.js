import { describe, expect, it } from "vitest";
import { classPath, classesOf, newClass } from "./classFile.js";

const worldOf = (...classes) => ({
  files: new Map([["world.json", {}], ["objects/abcd1234.json", {}], ...classes.map((c) => [classPath(c.id), c])]),
  readJson(path) {
    return this.files.get(path);
  },
});

describe("classes", () => {
  it("makes a class with a file name the world accepts", () => {
    const made = newClass("Monk", () => 0.5);
    expect(made).toEqual({ id: "iiiiiiii", name: "Monk" });
    expect(classPath(made.id)).toBe("classes/iiiiiiii.json");
  });

  it("lists only the world's classes, by name", () => {
    const [b, a] = [{ id: "bbbbbbbb", name: "Monk" }, { id: "aaaaaaaa", name: "Cleric" }];
    expect(classesOf(worldOf(b, a))).toEqual([a, b]);
  });
});
