import { describe, it, expect } from "vitest";
import { TALK_RANGE, canTalkTo, hasDialogue, inTalkRange } from "../dialogue";

const self = { map_identifier: "m1", position: { x: 0, y: 0 }, radius: 1, status: "idle" };
const npc = (x, extra = {}) => ({ map_identifier: "m1", position: { x, y: 0 }, radius: 1, noncombat: true, ...extra });
const lines = ["Hello."];

describe("hasDialogue", () => {
  it("needs a noncombat unit with at least one line", () => {
    expect(hasDialogue(npc(0), lines)).toBe(true);
    expect(hasDialogue(npc(0), [])).toBe(false);
    expect(hasDialogue(npc(0), undefined)).toBe(false);
    expect(hasDialogue(npc(0, { noncombat: false }), lines)).toBe(false);
  });
});

describe("inTalkRange", () => {
  it("measures between token edges", () => {
    expect(inTalkRange(self, npc(TALK_RANGE + 2))).toBe(true);
    expect(inTalkRange(self, npc(TALK_RANGE + 2.1))).toBe(false);
  });

  it("is false across maps", () => {
    expect(inTalkRange(self, npc(1, { map_identifier: "m2" }))).toBe(false);
  });
});

describe("canTalkTo", () => {
  it("is true for an in-range NPC with dialogue", () => {
    expect(canTalkTo(self, npc(5), lines)).toBe(true);
  });

  it("is false when the player is dead", () => {
    expect(canTalkTo({ ...self, status: "dead" }, npc(5), lines)).toBe(false);
  });

  it("is false out of range", () => {
    expect(canTalkTo(self, npc(50), lines)).toBe(false);
  });
});
