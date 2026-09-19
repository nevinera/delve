import { describe, expect, it } from "vitest";
import {
  ACTIONS, DEFAULT_HOTKEYS, actionForEvent, actionForKeyUp, bindingFromEvent, bindingLabel,
  buildBindingIndex, keyToken, resolveHotkeys,
} from "../hotkeys";

const key = (code, shiftKey = false) => ({ code, shiftKey });
const defaults = () => buildBindingIndex(resolveHotkeys(null));

describe("DEFAULT_HOTKEYS", () => {
  it("binds every action exactly once, with no shared keys", () => {
    expect(Object.keys(DEFAULT_HOTKEYS).sort()).toEqual(ACTIONS.map((a) => a.id).sort());
    expect(new Set(Object.values(DEFAULT_HOTKEYS)).size).toBe(ACTIONS.length);
  });

  it("reproduces the original hardcoded keys", () => {
    const index = defaults();
    const expected = {
      KeyW: "move_forward", KeyS: "move_backward", KeyQ: "strafe_left", KeyE: "strafe_right",
      KeyA: "turn_left", KeyD: "turn_right", KeyP: "toggle_character_sheet", KeyL: "toggle_latency",
      KeyT: "attack_start", Tab: "target_next",
      Digit1: "ability_1", Digit5: "ability_5", Digit9: "ability_9", Digit0: "ability_10",
    };
    for (const [code, action] of Object.entries(expected)) {
      expect(actionForEvent(index, key(code))).toBe(action);
    }
    expect(actionForEvent(index, key("KeyT", true))).toBe("attack_stop");
  });

  it("keeps shift+key working for keys with no shifted binding", () => {
    const index = defaults();
    expect(actionForEvent(index, key("KeyW", true))).toBe("move_forward");
    expect(actionForEvent(index, key("Digit3", true))).toBe("ability_3");
  });

  it("ignores unbound keys and Escape", () => {
    expect(actionForEvent(defaults(), key("KeyZ"))).toBeNull();
    expect(actionForEvent(defaults(), key("Escape"))).toBeNull();
  });
});

describe("resolveHotkeys", () => {
  it("merges saved bindings over the defaults and ignores unknown actions", () => {
    const hotkeys = resolveHotkeys({ move_forward: "up", bogus: "x" });
    expect(hotkeys.move_forward).toBe("up");
    expect(hotkeys.move_backward).toBe("s");
    expect(hotkeys).not.toHaveProperty("bogus");
  });

  it("treats a saved null as unbound", () => {
    const index = buildBindingIndex(resolveHotkeys({ toggle_latency: null }));
    expect(actionForEvent(index, key("KeyL"))).toBeNull();
  });

  it("dispatches a rebound key to its action", () => {
    const index = buildBindingIndex(resolveHotkeys({ ability_1: "s+z", move_forward: "up" }));
    expect(actionForEvent(index, key("KeyZ", true))).toBe("ability_1");
    expect(actionForEvent(index, key("ArrowUp"))).toBe("move_forward");
  });
});

describe("actionForKeyUp", () => {
  it("releases regardless of whether shift is still held", () => {
    expect(actionForKeyUp(defaults(), key("KeyW", false))).toBe("move_forward");
    expect(actionForKeyUp(buildBindingIndex(resolveHotkeys({ move_forward: "s+z" })), key("KeyZ", false))).toBe("move_forward");
  });
});

describe("bindingFromEvent / keyToken", () => {
  it("captures letters, digits and named keys, with an s+ prefix for shift", () => {
    expect(bindingFromEvent(key("KeyK"))).toBe("k");
    expect(bindingFromEvent(key("Digit2", true))).toBe("s+2");
    expect(bindingFromEvent(key("ArrowLeft"))).toBe("left");
    expect(bindingFromEvent(key("F5"))).toBe("f5");
  });

  it("refuses modifiers alone, Escape and unknown keys", () => {
    expect(keyToken("ShiftLeft")).toBeNull();
    expect(keyToken("ControlRight")).toBeNull();
    expect(keyToken("Escape")).toBeNull();
    expect(keyToken("MediaPlayPause")).toBeNull();
  });
});

describe("bindingLabel", () => {
  it("formats bindings for display", () => {
    expect(bindingLabel("w")).toBe("W");
    expect(bindingLabel("s+2")).toBe("Shift+2");
    expect(bindingLabel("tab")).toBe("tab");
    expect(bindingLabel(null)).toBe("");
  });
});
