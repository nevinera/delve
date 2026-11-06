import { afterEach, describe, expect, it, vi } from "vitest";
import { FrameParts, Startup, debugLog, debugging, setDebugTopics } from "./timing.js";

const clock = (...times) => {
  const left = [...times];
  return () => left.shift();
};

describe("debug topics", () => {
  afterEach(() => {
    setDebugTopics("");
    vi.restoreAllMocks();
  });

  it("turns on the topics ?debug= lists", () => {
    setDebugTopics("?debug=ground, perf");
    expect([debugging("ground"), debugging("perf"), debugging("caves")]).toEqual([true, true, false]);
  });

  it("turns on the topics saved in this browser too", () => {
    setDebugTopics("?debug=ground", "perf");
    expect([debugging("ground"), debugging("perf")]).toEqual([true, true]);
  });

  it("turns on every topic for all", () => {
    setDebugTopics("?debug=all");
    expect(debugging("anything")).toBe(true);
  });

  it("logs only the topics turned on", () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    setDebugTopics("?debug=ground");
    debugLog("ground", "plate", "0,0");
    debugLog("perf", "frame");
    expect(log.mock.calls).toEqual([["[ground]", "plate", "0,0"]]);
  });
});

describe("Startup", () => {
  it("times each step from the one before", () => {
    const measured = [];
    const startup = new Startup("create", { now: clock(100, 250, 260), timeline: { measure: (name, span) => measured.push([name, span]) } });
    startup.step("code");
    startup.step("read");
    startup.once("read");
    startup.once("drawn");
    expect(startup.steps).toEqual([
      { name: "code", ms: 100, at: 100 },
      { name: "read", ms: 150, at: 250 },
      { name: "drawn", ms: 10, at: 260 },
    ]);
    expect(measured[1]).toEqual(["create: read", { start: 100, end: 250 }]);
  });
});

describe("FrameParts", () => {
  it("keeps each part's mean a frame and its slowest frame", () => {
    const parts = new FrameParts({ now: clock(0, 2, 2, 5, 10, 11, 11, 15) });
    parts.time("move", () => {});
    parts.time("ground", () => {});
    parts.frame(30);
    parts.time("move", () => {});
    parts.time("move", () => {});
    expect(parts.frame(40)).toEqual({ move: 5, ground: 0 });
    expect(parts.take()).toEqual({
      frames: 2,
      gap: 40,
      parts: [
        { name: "move", mean: 3.5, worst: 5 },
        { name: "ground", mean: 1.5, worst: 3 },
      ],
    });
    expect(parts.take()).toEqual({ frames: 0, gap: 0, parts: [] });
  });

  it("returns what the part returns, and times it when it throws", () => {
    const parts = new FrameParts({ now: clock(0, 1, 1, 4) });
    expect(parts.time("tool", () => 7)).toBe(7);
    expect(() => parts.time("tool", () => {
      throw new Error("no");
    })).toThrow("no");
    parts.frame();
    expect(parts.take().parts).toEqual([{ name: "tool", mean: 4, worst: 4 }]);
  });
});
