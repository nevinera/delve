import { describe, expect, it } from "vitest";
import { BAR_COUNT, BAR_SLOTS, barsFor, cleared, cooldownText, defaultBars, keyLabel, placed, slotForKey, slotShows, swapped, sweepFor } from "./bars.js";

const known = (n) => Array.from({ length: n }, (_, i) => ({ id: `a${i}` }));

describe("action bars", () => {
  it("fills each bar in order by default", () => {
    const bars = defaultBars(known(14));
    expect(bars).toHaveLength(BAR_COUNT);
    expect(bars[0][11]).toBe("a11");
    expect(bars[1].slice(0, 3)).toEqual(["a12", "a13", ""]);
  });
  it("leaves out what doesn't fit", () => expect(defaultBars(known(100)).flat().filter(Boolean)).toHaveLength(BAR_COUNT * BAR_SLOTS));
  it("keeps bars you've set, whatever you've learned since", () => {
    const saved = [["a1"], ["", "a2"]];
    const bars = barsFor(saved, known(20));
    expect(bars[0].slice(0, 2)).toEqual(["a1", ""]);
    expect(bars[1][1]).toBe("a2");
    expect(bars[2]).toEqual(Array(BAR_SLOTS).fill(""));
  });
  it("uses the default until you've set them", () => expect(barsFor(null, known(1))[0][0]).toBe("a0"));
  it("ignores what doesn't fit or isn't an id", () => expect(barsFor([[1, ...known(20).map((a) => a.id)], [], [], []], [])[0]).toHaveLength(BAR_SLOTS));
  it("places, swaps and clears without changing what it was given", () => {
    const start = defaultBars(known(2));
    const a = { bar: 0, slot: 0 };
    const b = { bar: 1, slot: 3 };
    expect(placed(start, b, "x")[1][3]).toBe("x");
    const moved = swapped(start, a, b);
    expect([moved[0][0], moved[1][3]]).toEqual(["", "a0"]);
    expect(cleared(start, a)[0][0]).toBe("");
    expect(start[0][0]).toBe("a0");
  });
  it("reads keys", () => {
    expect(slotForKey({ code: "Digit1" })).toEqual({ bar: 0, slot: 0 });
    expect(slotForKey({ code: "Equal", shiftKey: true })).toEqual({ bar: 1, slot: 11 });
    expect(slotForKey({ code: "Digit0", altKey: true })).toEqual({ bar: 2, slot: 9 });
    expect(slotForKey({ code: "KeyW" })).toBeNull();
    expect(keyLabel(1, 0)).toBe("shift 1");
  });

  it("counts a cooldown down in minutes, then seconds, then tenths", () => {
    expect(cooldownText(125)).toBe("3m");
    expect(cooldownText(60)).toBe("1m");
    expect(cooldownText(59.2)).toBe("60");
    expect(cooldownText(10.1)).toBe("11");
    expect(cooldownText(9.94)).toBe("9.9");
    expect(cooldownText(0)).toBe("");
    expect(cooldownText(-1)).toBe("");
  });
  it("uncovers a waiting slot clockwise from 12 o'clock", () => {
    expect(sweepFor({ from: 0, until: 1000 }, 0)).toBe("conic-gradient(transparent 0.0deg, rgba(0, 0, 0, 0.6) 0)");
    expect(sweepFor({ from: 0, until: 1000 }, 250)).toBe("conic-gradient(transparent 90.0deg, rgba(0, 0, 0, 0.6) 0)");
    expect(sweepFor({ from: 0, until: 1000 }, 1000)).toBe("");
    expect(sweepFor({ from: 0, until: 0 }, 0)).toBe("");
  });
  it("shows every slot on the first bar, but only full ones on the others unless you're arranging", () => {
    expect(slotShows(0, null, false)).toBe(true);
    expect(slotShows(1, null, false)).toBe(false);
    expect(slotShows(2, { id: "a" }, false)).toBe(true);
    expect(slotShows(1, null, true)).toBe(true);
  });
});
