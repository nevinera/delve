import { describe, expect, it, vi, afterEach } from "vitest";
import { assignPowerToButton, layoutToMap, resolveButtonLayout, saveCharacterSettings } from "../abilityButtons";

const IDENTITY = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];

describe("resolveButtonLayout", () => {
  it("is the identity for an empty or missing map", () => {
    expect(resolveButtonLayout({})).toEqual(IDENTITY);
    expect(resolveButtonLayout(undefined)).toEqual(IDENTITY);
  });

  it("applies a valid permutation", () => {
    expect(resolveButtonLayout({ 0: 3, 3: 0 })).toEqual([3, 1, 2, 0, 4, 5, 6, 7, 8, 9]);
  });

  it("falls back to identity when the map duplicates a power", () => {
    expect(resolveButtonLayout({ 0: 3 })).toEqual(IDENTITY);
  });

  it("falls back to identity for out-of-range or non-integer entries", () => {
    expect(resolveButtonLayout({ 10: 0 })).toEqual(IDENTITY);
    expect(resolveButtonLayout({ 0: 12 })).toEqual(IDENTITY);
    expect(resolveButtonLayout({ x: 1 })).toEqual(IDENTITY);
    expect(resolveButtonLayout({ 0: "1" })).toEqual(IDENTITY);
  });
});

describe("assignPowerToButton", () => {
  it("swaps with the button that held the power", () => {
    expect(assignPowerToButton(IDENTITY, 0, 3)).toEqual([3, 1, 2, 0, 4, 5, 6, 7, 8, 9]);
  });

  it("does not mutate its input and ignores a no-op", () => {
    const input = [...IDENTITY];
    assignPowerToButton(input, 0, 3);
    expect(input).toEqual(IDENTITY);
    expect(assignPowerToButton(IDENTITY, 2, 2)).toEqual(IDENTITY);
  });
});

describe("layoutToMap", () => {
  it("round-trips through resolveButtonLayout", () => {
    const layout = assignPowerToButton(IDENTITY, 1, 8);
    expect(resolveButtonLayout(layoutToMap(layout))).toEqual(layout);
  });
});

describe("saveCharacterSettings", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("PATCHes the setting and returns the saved JSON", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ ok: 1 }) });
    vi.stubGlobal("fetch", fetchMock);

    await expect(saveCharacterSettings("/s", { ability_button_map: { 0: 1 } })).resolves.toEqual({ ok: 1 });

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("/s");
    expect(init.method).toBe("PATCH");
    expect(JSON.parse(init.body)).toEqual({ setting: { ability_button_map: { 0: 1 } } });
  });

  it("throws when the server rejects it", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 422 }));
    await expect(saveCharacterSettings("/s", {})).rejects.toThrow(/422/);
  });
});
