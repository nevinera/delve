import { describe, expect, it } from "vitest";
import { itemAllowed, disallowedItems } from "../provenance";

const restrictions = (layers) => ({ world_key: "home", layers });

describe("itemAllowed", () => {
  it("allows everything without restrictions", () => {
    expect(itemAllowed({ world_key: "x", elvl: 1 }, null)).toBe(true);
  });

  it("always allows trainee gear", () => {
    expect(itemAllowed({ world_key: null, elvl: 900 }, restrictions([{ worlds: [], maxElevation: 0 }]))).toBe(true);
  });

  it("treats null worlds as any world", () => {
    expect(itemAllowed({ world_key: "x", elvl: 1 }, restrictions([{ worlds: null }]))).toBe(true);
  });

  it("allows the own world and listed worlds only", () => {
    const r = restrictions([{ worlds: ["listed"] }]);
    expect(itemAllowed({ world_key: "home", elvl: 1 }, r)).toBe(true);
    expect(itemAllowed({ world_key: "listed", elvl: 1 }, r)).toBe(true);
    expect(itemAllowed({ world_key: "other", elvl: 1 }, r)).toBe(false);
  });

  it("rejects items above maxElevation", () => {
    const r = restrictions([{ maxElevation: 400 }]);
    expect(itemAllowed({ world_key: "home", elvl: 401 }, r)).toBe(false);
    expect(itemAllowed({ world_key: "home", elvl: 400 }, r)).toBe(true);
  });

  it("requires every layer to pass", () => {
    const r = restrictions([{ worlds: ["a"] }, { maxElevation: 5 }]);
    expect(itemAllowed({ world_key: "a", elvl: 9 }, r)).toBe(false);
  });
});

describe("disallowedItems", () => {
  it("lists the equipped items that fail", () => {
    const equipped = { head: { world_key: "home", elvl: 1 }, chest: { world_key: "other", elvl: 1 } };
    expect(disallowedItems(equipped, restrictions([{ worlds: [] }]))).toEqual([equipped.chest]);
  });
});
