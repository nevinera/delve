import { describe, expect, it } from "vitest";
import { fullscreenSideways, offerSideways, turnSideways } from "./orientation.js";

describe("turnSideways", () => {
  it("locks to landscape where it can", async () => {
    const asked = [];
    expect(await turnSideways({ lock: async (to) => asked.push(to) })).toBe(true);
    expect(asked).toEqual(["landscape"]);
  });

  it("says no where the browser won't, or can't", async () => {
    expect(await turnSideways({ lock: () => Promise.reject(new Error("not supported")) })).toBe(false);
    expect(await turnSideways(null)).toBe(false);
    expect(await turnSideways({})).toBe(false);
  });

  it("goes fullscreen before locking, from the button", async () => {
    const done = [];
    const root = { requestFullscreen: async () => done.push("fullscreen") };
    expect(await fullscreenSideways(root, { lock: async () => done.push("lock") })).toBe(true);
    expect(done).toEqual(["fullscreen", "lock"]);
  });

  it("only offers the button where both work", () => {
    const button = { hidden: true, addEventListener: () => {} };
    offerSideways(button, {}, { lock: () => {} });
    expect(button.hidden).toBe(true);
    offerSideways(button, { requestFullscreen: () => {} }, { lock: () => {} });
    expect(button.hidden).toBe(false);
  });
});
