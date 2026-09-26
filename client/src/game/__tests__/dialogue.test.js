import { describe, it, expect, vi, afterEach } from "vitest";
import { TALK_RANGE, canKeepTalking, canTalkTo, hasDialogue, inTalkRange, pickEntryNodeId } from "../dialogue";

const self = { map_identifier: "m1", position: { x: 0, y: 0 }, radius: 1, status: "idle" };
const ncu = (x, extra = {}) => ({ map_identifier: "m1", position: { x, y: 0 }, radius: 1, ...extra });
const dialogue = { entry: [{ node: "greet" }], nodes: { greet: { text: "Hello." } } };

describe("hasDialogue", () => {
  it("needs a non-empty entry and at least one node", () => {
    expect(hasDialogue(dialogue)).toBe(true);
    expect(hasDialogue({ entry: [], nodes: dialogue.nodes })).toBe(false);
    expect(hasDialogue({ entry: [{ node: "greet" }], nodes: {} })).toBe(false);
    expect(hasDialogue(undefined)).toBe(false);
  });
});

describe("pickEntryNodeId", () => {
  afterEach(() => vi.restoreAllMocks());

  it("always returns the sole entry when there's only one", () => {
    expect(pickEntryNodeId({ entry: [{ node: "only" }] })).toBe("only");
  });

  it("picks across the full range of a multi-entry list", () => {
    const entries = [{ node: "a" }, { node: "b" }, { node: "c" }];
    vi.spyOn(Math, "random").mockReturnValueOnce(0).mockReturnValueOnce(0.999);
    expect(pickEntryNodeId({ entry: entries })).toBe("a");
    expect(pickEntryNodeId({ entry: entries })).toBe("c");
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
    expect(canTalkTo(self, ncu(5), dialogue)).toBe(true);
  });

  it("is false without dialogue", () => {
    expect(canTalkTo(self, ncu(5), undefined)).toBe(false);
  });

  it("is false when the player is dead", () => {
    expect(canTalkTo({ ...self, status: "dead" }, ncu(5), dialogue)).toBe(false);
  });

  it("is false out of range", () => {
    expect(canTalkTo(self, ncu(50), dialogue)).toBe(false);
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
