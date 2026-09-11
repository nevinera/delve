import { describe, expect, it } from "vitest";
import { buildDebugStatuses } from "../App";

describe("buildDebugStatuses", () => {
  it("returns N fake buffs followed by N fake debuffs", () => {
    const now = 1000;
    const entries = buildDebugStatuses(3, now);
    expect(entries.map((e) => e.treatAs)).toEqual(["buff", "buff", "buff", "debuff", "debuff", "debuff"]);
    expect(entries.map((e) => e.name)).toEqual([
      "Fake Buff 1", "Fake Buff 2", "Fake Buff 3",
      "Fake Debuff 1", "Fake Debuff 2", "Fake Debuff 3",
    ]);
  });

  it("keeps shortName within the server's 6-character limit, even for two-digit N", () => {
    const entries = buildDebugStatuses(12, 1000);
    for (const e of entries) expect(e.shortName.length).toBeLessThanOrEqual(6);
  });

  it("gives every entry a unique key", () => {
    const entries = buildDebugStatuses(5, 1000);
    expect(new Set(entries.map((e) => e.key)).size).toBe(entries.length);
  });

  it("sets an expiresAt well in the future so entries don't disappear mid-debugging", () => {
    const now = 1000;
    const entries = buildDebugStatuses(1, now);
    for (const e of entries) expect(e.expiresAt).toBeGreaterThan(now + 60000);
  });

  it("returns an empty array for n=0", () => {
    expect(buildDebugStatuses(0, 1000)).toEqual([]);
  });
});
