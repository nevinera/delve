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

  it("lets a passage go on from a point near the passages within a link of it", () => {
    // Wide passages, short links: going on from c, it starts in a-b's rock.
    const layout = new Layout();
    const [a, b, c] = [0, 16, 32].map((x) => layout.addPoint("n", [x, -60, 0], { width: 20, height: 12 }));
    layout.addSegment("n", a.id, b.id);
    layout.addSegment("n", b.id, c.id);
    const ends = [{ ...c, at: c.at }, { ...c, at: [32, -60, 60] }];
    expect(rockProblem(layout, "n", ends)).toMatch(/^no rock between it and the passage/);
    expect(rockProblem(layout, "n", ends, [{ end: 0, points: nearFrom(layout, { id: c.id }) }])).toBe(null);
  });

  it("lets a passage go on from a fork's branch past the other branch's onward passages", () => {
    // A fork at a, branches to b and c close together, c going on to d alongside b.
    const layout = new Layout();
    const room = { width: 20, height: 12 };
    const [a, b, c, d] = [[0, -60, 0], [40, -60, 0], [36, -60, 24], [60, -60, 40]].map((at) => layout.addPoint("n", at, room));
    for (const [p, q] of [[a, b], [a, c], [c, d]]) layout.addSegment("n", p.id, q.id);
    // On from b, away from the fork: c-d is two links off, but by b.
    const ends = [{ ...b, at: b.at }, { ...b, at: [100, -60, -30] }];
    expect(rockProblem(layout, "n", ends, [{ end: 0, points: nearFrom(layout, { id: b.id }) }])).toBe(null);
    // Back along c-d it still needs rock.
    const along = [{ ...b, at: b.at }, { ...b, at: [70, -60, 60] }];
    expect(rockProblem(layout, "n", along, [{ end: 0, points: nearFrom(layout, { id: b.id }) }])).toMatch(/between it and the passage/);
  });
});
