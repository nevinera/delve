import { describe, it, expect } from "vitest";
import { TALK_RANGE, canKeepTalking, canTalkTo, hasDialogue, inTalkRange } from "../dialogue";

const self = { map_identifier: "m1", position: { x: 0, y: 0 }, radius: 1, status: "idle" };
const ncu = (x, extra = {}) => ({ map_identifier: "m1", position: { x, y: 0 }, radius: 1, ...extra });
const lines = ["Hello."];

describe("hasDialogue", () => {
  it("needs at least one line", () => {
    expect(hasDialogue(lines)).toBe(true);
    expect(hasDialogue([])).toBe(false);
    expect(hasDialogue(undefined)).toBe(false);
  });
});

describe("inTalkRange", () => {
  it("measures between token edges", () => {
    expect(inTalkRange(self, ncu(TALK_RANGE + 2))).toBe(true);
    expect(inTalkRange(self, ncu(TALK_RANGE + 2.1))).toBe(false);
  });

  it("is false across maps", () => {
    expect(inTalkRange(self, ncu(1, { map_identifier: "m2" }))).toBe(false);
  });
});

describe("canTalkTo", () => {
  it("is true for an in-range NCU with dialogue", () => {
    expect(canTalkTo(self, ncu(5), lines)).toBe(true);
  });

  it("is false without dialogue", () => {
    expect(canTalkTo(self, ncu(5), [])).toBe(false);
  });

  it("is false when the player is dead", () => {
    expect(canTalkTo({ ...self, status: "dead" }, ncu(5), lines)).toBe(false);
  });

  it("is false out of range", () => {
    expect(canTalkTo(self, ncu(50), lines)).toBe(false);
  });
});

describe("canKeepTalking", () => {
  it("holds while alive and in range, regardless of dialogue", () => {
    expect(canKeepTalking(self, ncu(5))).toBe(true);
  });

  it("drops once out of range, dead, or without an NCU", () => {
    expect(canKeepTalking(self, ncu(50))).toBe(false);
    expect(canKeepTalking({ ...self, status: "dead" }, ncu(5))).toBe(false);
    expect(canKeepTalking(self, null)).toBe(false);
  });
});
