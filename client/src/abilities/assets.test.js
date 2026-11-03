import { describe, expect, it } from "vitest";
import { missingSounds, soundLength, soundVoices } from "./sounds.js";
import { SOUNDS, VISUALS } from "./stock.js";
import { disposeVisual, hasVisual, makeVisual } from "./visuals.js";

describe("the stock visuals", () => {
  it.each(VISUALS)("%s draws from start to end and comes apart", (name) => {
    expect(hasVisual(name)).toBe(true);
    const visual = makeVisual(name, { colors: ["#ff0000", "#00ff00"], scale: 1.5, height: 6, from: [0, 3, 0], to: [20, 3, 0] });
    expect(visual.length).toBeGreaterThan(0);
    for (const u of [0, 0.5, 1]) visual.update(u);
    let meshes = 0;
    visual.group.traverse((node) => {
      if (node.isMesh) meshes += 1;
    });
    expect(meshes).toBeGreaterThan(0);
    disposeVisual(visual);
  });
});

describe("the stock sounds", () => {
  it("has a recipe for every name", () => {
    expect(missingSounds()).toEqual([]);
  });

  it.each(SOUNDS)("%s is short and has positive frequencies, which its sweeps need", (name) => {
    expect(soundLength(name)).toBeGreaterThan(0);
    expect(soundLength(name)).toBeLessThan(1.5);
    for (const voice of soundVoices(name)) {
      expect(voice.from).toBeGreaterThan(0);
      expect(voice.to).toBeGreaterThan(0);
    }
  });
});
