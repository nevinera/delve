import { describe, expect, it } from "vitest";
import { KeyBindings, comboOf, labelOf } from "./keys.js";

// A character's kept bindings, and what was saved last.
const character = (keys = {}) => {
  const kept = { keys, saved: null };
  kept.save = (changes) => ((kept.saved = changes), (kept.keys = changes));
  return kept;
};

describe("comboOf", () => {
  it("puts the modifiers first, in one order", () => {
    expect(comboOf({ code: "Digit1", shiftKey: true })).toBe("Shift+Digit1");
    expect(comboOf({ code: "KeyW", ctrlKey: true, altKey: true })).toBe("Ctrl+Alt+KeyW");
  });
  it("is nothing for a modifier alone or Escape", () => {
    expect(comboOf({ code: "ShiftLeft", shiftKey: true })).toBeNull();
    expect(comboOf({ code: "Escape" })).toBeNull();
  });
});

describe("labelOf", () => {
  it("reads as people say it", () => {
    expect(labelOf("Shift+Digit1")).toBe("Shift 1");
    expect(labelOf("KeyW")).toBe("W");
    expect(labelOf("Alt+Equal")).toBe("Alt =");
    expect(labelOf("")).toBe("");
  });
});

describe("KeyBindings", () => {
  it("starts with the defaults: bars 2 and 3 on shift and alt", () => {
    const keys = new KeyBindings();
    expect(keys.actionFor({ code: "KeyW" }).id).toBe("forward");
    expect(keys.actionFor({ code: "Digit1" }).slot).toEqual({ bar: 0, slot: 0 });
    expect(keys.actionFor({ code: "Equal", shiftKey: true }).slot).toEqual({ bar: 1, slot: 11 });
    expect(keys.actionFor({ code: "Digit0", altKey: true }).slot).toEqual({ bar: 2, slot: 9 });
    expect(keys.actionFor({ code: "KeyW", shiftKey: true })).toBeNull();
  });

  it("moves a key that's taken, leaving the other action unbound, and keeps it", () => {
    const kept = character();
    const keys = new KeyBindings(kept.keys, kept.save);
    expect(keys.bind("jump", "KeyW").moved.id).toBe("forward");
    expect(keys.actionFor({ code: "KeyW" }).id).toBe("jump");
    expect(keys.keyOf("forward")).toBe("");
    expect(kept.saved).toEqual({ jump: "KeyW", forward: "" });
    expect(new KeyBindings(kept.keys).actionFor({ code: "KeyW" }).id).toBe("jump");
  });

  it("never binds Escape", () => {
    const keys = new KeyBindings();
    expect(keys.bind("jump", "Escape").refused).toBe(true);
    expect(keys.bind("jump", "Shift+Escape").refused).toBe(true);
    expect(keys.keyOf("jump")).toBe("Space");
  });

  it("finds the moving keys held by their code alone", () => {
    const keys = new KeyBindings();
    expect(keys.heldFor("KeyW").map((a) => a.holds)).toEqual(["w"]);
    keys.bind("forward", "Shift+KeyW");
    expect(keys.heldFor("KeyW")).toEqual([]);
    expect(keys.releasedBy("KeyW").map((a) => a.holds)).toEqual(["w"]);
  });

  it("resets to the defaults, and tells those listening", () => {
    const kept = character({ jump: "KeyJ" });
    const keys = new KeyBindings(kept.keys, kept.save);
    let heard = 0;
    keys.onChange(() => heard++);
    expect(keys.keyOf("jump")).toBe("KeyJ");
    keys.reset();
    expect([keys.keyOf("jump"), heard, kept.saved]).toEqual(["Space", 1, {}]);
  });

  it("ignores kept bindings for actions it doesn't have", () => {
    expect(new KeyBindings({ fly: "KeyF", jump: 3 }).changes).toEqual({});
  });
});
