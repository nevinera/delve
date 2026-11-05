import { describe, expect, it } from "vitest";
import { blank, clock, noteWith, voiceType } from "./voice.js";

describe("voice notes", () => {
  it("records the first type the browser can make", () => {
    expect(voiceType((type) => type.startsWith("audio/ogg"))).toBe("audio/ogg;codecs=opus");
    expect(voiceType(() => false)).toBe("");
  });

  it("adds what's heard after what's typed", () => {
    const results = [[{ transcript: "the ground " }], [{ transcript: " is gone" }]];
    expect(noteWith("", results)).toBe("the ground is gone");
    expect(noteWith("Hi.", results)).toBe("Hi. the ground is gone");
    expect(noteWith("Hi.", [])).toBe("Hi.");
  });

  it("shows how long it's been going", () => {
    expect(clock(0)).toBe("0:00");
    expect(clock(65.7)).toBe("1:05");
  });

  it("tells a screenshot of a cleared canvas", () => {
    const black = new Uint8ClampedArray(400 * 4);
    expect(blank(black, 7)).toBe(true);
    const scene = black.slice();
    scene.set([90, 140, 60], 200 * 4);
    expect(blank(scene, 1)).toBe(false);
  });
});
