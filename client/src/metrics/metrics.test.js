import { describe, expect, it } from "vitest";
import { createMetrics } from "./metrics.js";

function setUp() {
  let t = 0;
  const sent = [];
  const m = createMetrics({ send: (b) => sent.push(b), now: () => t, tags: { page: "play" } });
  return { m, sent, tick: (ms) => (t += ms) };
}

describe("createMetrics", () => {
  it("sends what it holds, with how long ago each was measured", () => {
    const { m, sent, tick } = setUp();
    m.count("play.joins");
    tick(250);
    m.timing("play.load.platters", 900, { world: "northvale" });
    tick(50);
    m.flush();
    expect(sent).toEqual([
      {
        tags: { page: "play" },
        metrics: [
          { name: "play.joins", kind: "count", value: 1, tags: undefined, at: 300 },
          { name: "play.load.platters", kind: "timing", value: 900, tags: { world: "northvale" }, at: 50 },
        ],
      },
    ]);
    expect(m.held).toBe(0);
  });

  it("times from start to stop", () => {
    const { m, sent, tick } = setUp();
    const done = m.time("play.load.total");
    tick(1234);
    done({ ok: "yes" });
    m.flush();
    expect(sent[0].metrics[0]).toMatchObject({ kind: "timing", value: 1234, tags: { ok: "yes" } });
  });

  it("sends nothing when it holds nothing, and skips values that aren't numbers", () => {
    const { m, sent } = setUp();
    m.gauge("play.fps", NaN);
    m.flush();
    expect(sent).toEqual([]);
  });
});
