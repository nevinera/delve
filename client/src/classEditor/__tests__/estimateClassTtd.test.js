import {describe, it, expect, vi, beforeEach, afterEach} from "vitest";
import {estimateClassTtd} from "../estimateClassTtd";

describe("estimateClassTtd", () => {
  beforeEach(() => {
    global.fetch = vi.fn();
  });
  afterEach(() => vi.restoreAllMocks());

  it("POSTs the class and strategy as JSON to the class_ttd_sims endpoint and resolves to the cells", async () => {
    const body = {results: [{priority: "hybrid", elevation: 0, ttd: 40}]};
    global.fetch.mockResolvedValue({ok: true, json: async () => body});

    const result = await estimateClassTtd({name: "Puncher"}, [{power: "Bolt"}]);

    expect(result).toEqual(body);
    expect(global.fetch).toHaveBeenCalledWith("/build/class_ttd_sims/character_class", expect.objectContaining({
      method: "POST",
      body: JSON.stringify({class: {name: "Puncher"}, strategy: [{power: "Bolt"}]}),
    }));
  });

  it("throws the server's error message on a failed response", async () => {
    global.fetch.mockResolvedValue({ok: false, status: 502, json: async () => ({error: "game server unavailable"})});

    await expect(estimateClassTtd({}, [])).rejects.toThrow("game server unavailable");
  });

  it("falls back to a status message when the error body isn't JSON", async () => {
    global.fetch.mockResolvedValue({ok: false, status: 500, json: async () => { throw new Error("bad json"); }});

    await expect(estimateClassTtd({}, [])).rejects.toThrow("Estimate failed (500)");
  });
});
