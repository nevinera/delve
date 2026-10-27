import { describe, expect, it } from "vitest";
import { editedPath, loadEdited, saveEdited } from "./edited.js";

describe("edited tiles", () => {
  it("keeps a continent's hand-edited tiles, and drops the file when there are none", () => {
    const files = new Map();
    expect(loadEdited(files, "main").size).toBe(0);
    saveEdited(files, "main", new Set(["3,4", "-1,2"]));
    expect([...loadEdited(files, "main")].sort()).toEqual(["-1,2", "3,4"]);
    expect(loadEdited(files, "other").size).toBe(0);
    saveEdited(files, "main", new Set());
    expect(files.has(editedPath("main"))).toBe(false);
  });
});
