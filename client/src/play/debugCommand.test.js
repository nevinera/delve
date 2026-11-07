import { describe, expect, it } from "vitest";
import { debugCommand } from "./debugCommand.js";

const fake = () => {
  const shown = new Set();
  return { shown, show: (kind) => shown.add(kind), hide: (kind) => shown.delete(kind) };
};

describe("debugCommand", () => {
  it("shows and hides boundaries", () => {
    const boundaries = fake();
    expect(debugCommand(["show-boundaries", "tile", "clutter"], { boundaries })).toEqual(["Showing tile, clutter boundaries."]);
    expect([...boundaries.shown]).toEqual(["tile", "clutter"]);
    debugCommand(["hide-boundaries", "tile"], { boundaries });
    expect([...boundaries.shown]).toEqual(["clutter"]);
    debugCommand(["show-boundaries", "all"], { boundaries });
    expect(boundaries.shown.size).toBe(3);
    debugCommand(["hide-boundaries"], { boundaries });
    expect(boundaries.shown.size).toBe(0);
  });

  it("says what it takes when it can't tell", () => {
    const boundaries = fake();
    expect(debugCommand(["show-boundaries", "chunk"], { boundaries })[0]).toMatch(/no chunk boundary/);
    expect(debugCommand(["show-boundaries"], { boundaries })[0]).toMatch(/Show which/);
    expect(debugCommand(["fly"], { boundaries })[0]).toBe("There's no /debug fly.");
    expect(debugCommand([], { boundaries })).toHaveLength(2);
    expect(boundaries.shown.size).toBe(0);
  });

  it("switches the map between smoothed and pixels, for system admins only", () => {
    const map = { raw: false };
    expect(debugCommand(["map", "pixels"], { boundaries: fake(), map, admin: true })[0]).toMatch(/pixel a chunk/);
    expect(map.raw).toBe(true);
    debugCommand(["map", "smoothed"], { boundaries: fake(), map, admin: true });
    expect(map.raw).toBe(false);
    expect(debugCommand(["map", "pixels"], { boundaries: fake(), map })[0]).toBe("There's no /debug map.");
    expect(map.raw).toBe(false);
    expect(debugCommand([], { boundaries: fake(), map, admin: true })).toHaveLength(3);
  });
});
