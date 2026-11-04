import { readFileSync } from "fs";
import { describe, expect, it } from "vitest";
import { blockedBy, canSwing, holdsStill } from "./controls.js";

const { abilities, cases } = JSON.parse(readFileSync(new URL("../../../game-server/internal/combat/testdata/controls.json", import.meta.url)));

describe("controls", () => {
  for (const c of cases) {
    it(c.controls.join(" and ") || "none", () => {
      expect(canSwing(c.controls)).toBe(c.swing);
      expect(holdsStill(c.controls)).toBe(c.still);
      for (const [id, ability] of Object.entries(abilities)) expect(blockedBy(c.controls, ability)).toBe(c.blocked[id] ?? "");
    });
  }
});
