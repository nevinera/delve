import { readFileSync } from "fs";
import { describe, expect, it } from "vitest";
import { allHold, holds } from "./conditions.js";

const cases = JSON.parse(readFileSync(new URL("../../../game-server/internal/combat/testdata/conditions.json", import.meta.url)));

describe("conditions", () => {
  for (const { name, condition, holds: want, self = {}, target = null, targetIs = [], position = null, since = {}, resources = {} } of cases) {
    it(name, () => expect(holds(condition, { self: { state: [], ...self }, target: target && { state: [], ...target }, targetIs, position, since, resources })).toBe(want));
  }

  it("counts what the client doesn't know as holding", () => {
    expect(allHold([{ since: "attack", below: 5 }, { position: "behind" }, { state: "casting" }, { inCombat: true }, { targetIs: "ally" }], { self: {}, target: {} })).toBe(true);
  });
});
