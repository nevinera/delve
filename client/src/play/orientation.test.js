import { describe, expect, it } from "vitest";
import { turnSideways } from "./orientation.js";

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
});
