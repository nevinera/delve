import {describe, it, expect, vi, beforeEach, afterEach} from "vitest";
import {estimateDamage} from "../estimateDamage";

describe("estimateDamage", () => {
  beforeEach(() => {
    global.fetch = vi.fn();
  });
  afterEach(() => vi.restoreAllMocks());

  it("POSTs the unit type as JSON to the dps_sims endpoint and resolves to the matrix", async () => {
    const matrix = {results: [{gearingPlan: "offense", elevation: 0, dps: 3.9, ttdSeconds: 40}]};
    global.fetch.mockResolvedValue({ok: true, json: async () => matrix});

    const result = await estimateDamage({name: "Goblin"});

    expect(result).toEqual(matrix);
    expect(global.fetch).toHaveBeenCalledWith("/build/dps_sims/unit_type", expect.objectContaining({
      method: "POST",
      body: JSON.stringify({name: "Goblin"}),
    }));
  });

  it("throws the server's error message on a failed response", async () => {
    global.fetch.mockResolvedValue({ok: false, status: 502, json: async () => ({error: "game server unavailable"})});

    await expect(estimateDamage({})).rejects.toThrow("game server unavailable");
  });

  it("falls back to a status message when the error body isn't JSON", async () => {
    global.fetch.mockResolvedValue({ok: false, status: 500, json: async () => { throw new Error("bad json"); }});

    await expect(estimateDamage({})).rejects.toThrow("Estimate failed (500)");
  });
});
