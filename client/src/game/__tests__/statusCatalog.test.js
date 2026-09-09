import { describe, it, expect } from "vitest";
import { buildStatusCatalog, mergeStatusCatalogs } from "../statusCatalog";

describe("buildStatusCatalog", () => {
  it("indexes a status-type effect's status by name, with the given baseUrl", () => {
    const powers = [
      {
        name: "Recover",
        effects: [
          { type: "heal", affects: "self", amount: 20.0 },
          { type: "status", affects: "self", duration: 8.0, status: { name: "Second Wind", auraEffect: { sourceURL: "x.webp" } } },
        ],
      },
    ];
    const catalog = buildStatusCatalog(powers, "https://example.com/classes/puncher.full.json");
    expect(catalog).toEqual({
      "Second Wind": {
        status: { name: "Second Wind", auraEffect: { sourceURL: "x.webp" } },
        baseUrl: "https://example.com/classes/puncher.full.json",
      },
    });
  });

  it("indexes every status-type effect across multiple powers", () => {
    const powers = [
      { name: "Recover", effects: [{ type: "status", affects: "self", duration: 8.0, status: { name: "Second Wind" } }] },
      { name: "Punch", effects: [{ type: "harm", affects: "bTarget", amount: 10.0 }] },
      { name: "Weaken", effects: [{ type: "status", affects: "bTarget", duration: 5.0, status: { name: "Weakened" } }] },
    ];
    const catalog = buildStatusCatalog(powers, "base");
    expect(Object.keys(catalog).sort()).toEqual(["Second Wind", "Weakened"]);
  });

  it("skips a status-type effect with no status object", () => {
    const powers = [{ name: "Broken", effects: [{ type: "status", affects: "self", duration: 1.0 }] }];
    expect(buildStatusCatalog(powers, "base")).toEqual({});
  });

  it("returns an empty catalog for no powers", () => {
    expect(buildStatusCatalog([], "base")).toEqual({});
    expect(buildStatusCatalog(undefined, "base")).toEqual({});
  });

  it("returns an empty catalog for a power with no effects", () => {
    expect(buildStatusCatalog([{ name: "Bare" }], "base")).toEqual({});
  });
});

describe("mergeStatusCatalogs", () => {
  it("combines entries from multiple catalogs", () => {
    const a = { "Second Wind": { status: { name: "Second Wind" }, baseUrl: "a" } };
    const b = { Weakened: { status: { name: "Weakened" }, baseUrl: "b" } };
    expect(mergeStatusCatalogs(a, b)).toEqual({ ...a, ...b });
  });

  it("lets a later catalog win on a name collision", () => {
    const a = { "Second Wind": { status: { name: "Second Wind" }, baseUrl: "a" } };
    const b = { "Second Wind": { status: { name: "Second Wind" }, baseUrl: "b" } };
    expect(mergeStatusCatalogs(a, b)).toEqual(b);
  });

  it("returns an empty catalog when given none", () => {
    expect(mergeStatusCatalogs()).toEqual({});
  });
});
