import { describe, expect, it } from "vitest";
import { strToU8 } from "fflate";
import { creatureKit } from "./creatureKit.js";

const files = {
  "creatures/gobl0001.json": { id: "gobl0001", name: "Goblin", abilities: ["stab0001", { id: "rock0001" }, "gone0001"], onDeath: "boom0001", resource: { key: "energy" } },
  "abilities/stab0001.json": { id: "stab0001", effects: [{ type: "status", status: "bled0001" }] },
  "abilities/rock0001.json": { id: "rock0001" },
  "abilities/boom0001.json": { id: "boom0001" },
  "statuses/bled0001.json": { id: "bled0001", name: "Bleeding" },
};
const file = async (path) => (files[path] ? strToU8(JSON.stringify(files[path])) : null);

describe("a creature's kit", () => {
  it("has its abilities, onDeath too, and the statuses they name", async () => {
    const kit = await creatureKit("gobl0001", file);
    expect(kit.id).toBe("creatures/gobl0001");
    expect(kit.abilities.map((a) => a.id)).toEqual(["stab0001", "rock0001", "boom0001"]);
    expect(kit.statuses.map((s) => s.id)).toEqual(["bled0001"]);
    expect(kit.resources).toEqual([{ key: "energy" }]);
  });

  it("is null for a creature the world hasn't got", async () => {
    expect(await creatureKit("none0001", file)).toBe(null);
  });
});
