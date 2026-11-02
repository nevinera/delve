import { describe, expect, it } from "vitest";
import { Layout } from "./caveLayout.js";
import { CavePlan } from "./cavePlan.js";

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

  it("keeps what the layout was before a change, though the change is made in place", () => {
    const layout = new Layout();
    layout.addNetwork("n");
    const point = layout.addPoint("n", [0, -60, 0], { width: 18 });
    const plan = { layout, history: [] };
    CavePlan.prototype.remember.call(plan, "n");
    point.width = 30;
    layout.setPhase("n", "polish");
    const kept = plan.history[0].layout;
    expect(kept.points.find((p) => p.id === point.id).width).toBe(18);
    expect(kept.networks.find((n) => n.slug === "n").phase).toBe("layout");
  });
});
