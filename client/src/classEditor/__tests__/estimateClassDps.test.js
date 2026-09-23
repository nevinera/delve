import {describe, it, expect, vi, beforeEach, afterEach} from "vitest";
import {estimateClassDps} from "../estimateClassDps";

describe("estimateClassDps", () => {
  beforeEach(() => {
    global.fetch = vi.fn();
  });
  afterEach(() => vi.restoreAllMocks());

  it("POSTs the class and strategy as JSON to the class_dps_sims endpoint and resolves to the matrix", async () => {
    const matrix = {results: [{durationSeconds: 60, elevation: 0, elevationLabel: "heroic", dps: 12.3}]};
    global.fetch.mockResolvedValue({ok: true, json: async () => matrix});

    const result = await estimateClassDps({name: "Puncher"}, [{power: "Bolt"}]);

    expect(result).toEqual(matrix);
    expect(global.fetch).toHaveBeenCalledWith("/build/class_dps_sims/character_class", expect.objectContaining({
      method: "POST",
      body: JSON.stringify({class: {name: "Puncher"}, strategy: [{power: "Bolt"}]}),
    }));
  });

  it("throws the server's error message on a failed response", async () => {
    global.fetch.mockResolvedValue({ok: false, status: 502, json: async () => ({error: "game server unavailable"})});

    await expect(estimateClassDps({}, [])).rejects.toThrow("game server unavailable");
  });

  it("falls back to a status message when the error body isn't JSON", async () => {
    global.fetch.mockResolvedValue({ok: false, status: 500, json: async () => { throw new Error("bad json"); }});

    await expect(estimateClassDps({}, [])).rejects.toThrow("Estimate failed (500)");
  });
});
