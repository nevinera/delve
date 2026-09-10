import { describe, expect, it } from "vitest";
import { latencyColor, shouldAutoShowLatency, isLatencyVisible, nextLatencyOverride } from "../App";

describe("latencyColor", () => {
  it("is green under 200ms", () => {
    expect(latencyColor(50)).toBe("#4caf50");
    expect(latencyColor(199)).toBe("#4caf50");
  });

  it("is yellow from 200ms up to 350ms", () => {
    expect(latencyColor(200)).toBe("#ffc107");
    expect(latencyColor(349)).toBe("#ffc107");
  });

  it("is red at 350ms and above", () => {
    expect(latencyColor(350)).toBe("#f44336");
    expect(latencyColor(2000)).toBe("#f44336");
  });

  it("falls back to a neutral color when there's no reading yet", () => {
    expect(latencyColor(null)).toBe("#ddd");
  });
});

describe("shouldAutoShowLatency", () => {
  it("is false with no samples", () => {
    expect(shouldAutoShowLatency([], Date.now())).toBe(false);
  });

  it("is false when at most half of recent samples are over the threshold", () => {
    const now = 10_000;
    const history = [
      { t: now - 1000, rtt: 300 },
      { t: now - 2000, rtt: 300 },
      { t: now - 3000, rtt: 100 },
      { t: now - 4000, rtt: 100 },
    ];
    expect(shouldAutoShowLatency(history, now)).toBe(false);
  });

  it("is true when more than half of recent samples are over the threshold", () => {
    const now = 10_000;
    const history = [
      { t: now - 1000, rtt: 300 },
      { t: now - 2000, rtt: 300 },
      { t: now - 3000, rtt: 300 },
      { t: now - 4000, rtt: 100 },
    ];
    expect(shouldAutoShowLatency(history, now)).toBe(true);
  });

  it("ignores samples older than the window", () => {
    const now = 20_000;
    const history = [
      { t: now - 15000, rtt: 500 }, // outside the default 10s window
      { t: now - 15000, rtt: 500 },
      { t: now - 15000, rtt: 500 },
      { t: now - 1000, rtt: 100 }, // the only sample actually in-window
    ];
    expect(shouldAutoShowLatency(history, now)).toBe(false);
  });

  it("respects a custom window and threshold", () => {
    const now = 10_000;
    const history = [
      { t: now - 500, rtt: 120 },
      { t: now - 500, rtt: 120 },
    ];
    expect(shouldAutoShowLatency(history, now, 1000, 100)).toBe(true);
    expect(shouldAutoShowLatency(history, now, 1000, 150)).toBe(false);
  });

  it("is not fooled by a single blip in a mostly-good window", () => {
    const now = 10_000;
    const history = Array.from({ length: 9 }, (_, i) => ({ t: now - i * 1000, rtt: 100 }));
    history.push({ t: now - 9000, rtt: 1000 });
    expect(shouldAutoShowLatency(history, now)).toBe(false);
  });
});

describe("isLatencyVisible", () => {
  it("follows autoShow when there's no manual override yet", () => {
    expect(isLatencyVisible(null, true)).toBe(true);
    expect(isLatencyVisible(null, false)).toBe(false);
  });

  it("sticks to the override once one has been set, regardless of autoShow", () => {
    expect(isLatencyVisible(true, false)).toBe(true);
    expect(isLatencyVisible(false, true)).toBe(false);
  });
});

describe("nextLatencyOverride", () => {
  it("turns it on when hit while auto-hidden and unset", () => {
    expect(nextLatencyOverride(null, false)).toBe(true);
  });

  it("turns it off when hit while auto-shown and unset", () => {
    expect(nextLatencyOverride(null, true)).toBe(false);
  });

  it("flips an existing override regardless of the current autoShow value", () => {
    expect(nextLatencyOverride(true, false)).toBe(false);
    expect(nextLatencyOverride(true, true)).toBe(false);
    expect(nextLatencyOverride(false, false)).toBe(true);
    expect(nextLatencyOverride(false, true)).toBe(true);
  });
});
