import { describe, expect, it, vi } from "vitest";
import { FlagCache } from "../flags";

function respond(body, { ok = true, status = 200 } = {}) {
  return vi.fn().mockResolvedValue({ ok, status, json: () => Promise.resolve(body) });
}

describe("FlagCache", () => {
  it("answers the zone's listed flags without asking Rails", async () => {
    const fetchFn = respond({ held: true });
    const cache = new FlagCache({ heldFlags: ["key/gate"], flagsUrl: "/flags", fetchFn });
    cache.preload(["key/gate", "key/door"]);

    expect(await cache.hasFlag("key/gate")).toBe(true);
    expect(await cache.hasFlag("key/door")).toBe(false);
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it("asks Rails once for a flag it hasn't seen", async () => {
    const fetchFn = respond({ held: true });
    const cache = new FlagCache({ flagsUrl: "/play/characters/1/worlds/2/flags", fetchFn });

    expect(await cache.hasFlag("quest/completed/killMoreOrcs")).toBe(true);
    expect(await cache.hasFlag("quest/completed/killMoreOrcs")).toBe(true);
    expect(fetchFn).toHaveBeenCalledTimes(1);
    expect(fetchFn.mock.calls[0][0]).toBe("/play/characters/1/worlds/2/flags/quest/completed/killMoreOrcs");
  });

  it("rejects, caching nothing, when Rails can't answer", async () => {
    const fetchFn = respond({ error: "nope" }, { ok: false, status: 422 });
    const cache = new FlagCache({ flagsUrl: "/flags", fetchFn });

    await expect(cache.hasFlag("bogus/x")).rejects.toThrow(/422/);
    expect(cache.known.has("bogus/x")).toBe(false);
  });

  it("doesn't let a preload unmark a held flag", async () => {
    const cache = new FlagCache({ heldFlags: ["key/gate"] });
    cache.preload(["key/gate"]);

    expect(await cache.hasFlag("key/gate")).toBe(true);
  });

  it("holds nothing it can't ask about when there's no world", async () => {
    const fetchFn = respond({ held: true });
    const cache = new FlagCache({ fetchFn });

    expect(await cache.hasFlag("key/gate")).toBe(false);
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it("marks a flag held", async () => {
    const cache = new FlagCache();
    cache.preload(["key/gate"]);
    cache.markHeld("key/gate");

    expect(await cache.hasFlag("key/gate")).toBe(true);
  });
});
