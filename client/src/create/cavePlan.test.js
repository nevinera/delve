import { describe, expect, it } from "vitest";
import { Layout } from "./caveLayout.js";
import { rockProblem } from "./caveLayout.js";
import { CavePlan, nearFrom } from "./cavePlan.js";

describe("cave passage tool", () => {
  it("won't join a passage to a point within two links of where it starts", () => {
    const layout = new Layout();
    const [a, b, c, d] = [0, 32, 64, 96].map((x) => layout.addPoint("n", [x, -60, 0]));
    const [ab, bc, cd] = [[a, b], [b, c], [c, d]].map(([p, q]) => layout.addSegment("n", p.id, q.id));
    const plan = { layout, closeTo: CavePlan.prototype.closeTo };
    const tooClose = (from, to) => CavePlan.prototype.tooClose.call(plan, { id: from }, { id: to });
    expect(tooClose(a.id, c.id)).toBe(true);
    expect(tooClose(a.id, d.id)).toBe(false);
    // A spot on a segment is a point a link from each of its ends.
    expect(tooClose(a.id, bc.id)).toBe(true);
    expect(tooClose(a.id, cd.id)).toBe(false);
    expect(tooClose(ab.id, cd.id)).toBe(false);
    expect(tooClose(ab.id, d.id)).toBe(false);
    expect(tooClose(ab.id, c.id)).toBe(true);
  });

  it("lets a passage go on from a point near the passages within two links of it", () => {
    // Wide passages, short links: going on from c, it starts in a-b's rock.
    const layout = new Layout();
    const [a, b, c] = [0, 16, 32].map((x) => layout.addPoint("n", [x, -60, 0], { width: 20, height: 12 }));
    const ab = layout.addSegment("n", a.id, b.id);
    layout.addSegment("n", b.id, c.id);
    const ends = [{ ...c, at: c.at }, { ...c, at: [32, -60, 60] }];
    expect(rockProblem(layout, "n", ends, [c.id])).toBe(`no rock between it and the passage from ${ab.from} to ${ab.to}; leave 8 ft`);
    expect(rockProblem(layout, "n", ends, nearFrom(layout, { id: c.id }))).toBe(null);
  });
});
