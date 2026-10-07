import { afterEach, describe, expect, it, vi } from "vitest";
import { leaveWorld } from "../leaveWorld";

function mockFetch(response) {
  const fetchMock = vi.fn().mockResolvedValue(response);
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

describe("leaveWorld", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("sends a DELETE and returns where to go next", async () => {
    const fetchMock = mockFetch({ ok: true, json: async () => ({ redirect_url: "/play/characters/1/worlds/2" }) });
    const result = await leaveWorld("/play/characters/1/worlds/2/leave");
    expect(fetchMock).toHaveBeenCalledWith("/play/characters/1/worlds/2/leave", expect.objectContaining({ method: "DELETE" }));
    expect(result).toEqual({ redirectUrl: "/play/characters/1/worlds/2" });
  });

  it("returns the server's error", async () => {
    mockFetch({ ok: false, json: async () => ({ error: "game server down" }) });
    expect(await leaveWorld("/leave")).toEqual({ error: "game server down" });
  });

  it("returns a fallback error when the request fails", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));
    expect(await leaveWorld("/leave")).toEqual({ error: "Couldn't leave the world." });
  });
});
