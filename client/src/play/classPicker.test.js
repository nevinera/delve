import { strToU8 } from "fflate";
import { describe, expect, it } from "vitest";
import { classChoices } from "./classPicker.js";

const filesOf = (files) => async (path) => {
  if (files[path] === "fails") throw new Error("no");
  return files[path] ? strToU8(files[path]) : null;
};

describe("classChoices", () => {
  it("describes each class from its file, sorted by name", async () => {
    const file = filesOf({
      "classes/b.json": JSON.stringify({ name: "Astra", description: "Stars.", colors: { major: "#123456" }, resources: [{ key: "m", name: "Mana" }] }),
      "classes/a.json": JSON.stringify({ name: "Zealot" }),
    });
    expect(await classChoices(["a", "b"], file)).toEqual([
      { id: "b", name: "Astra", description: "Stars.", color: "#123456", resources: ["Mana"] },
      { id: "a", name: "Zealot", description: "", color: null, resources: [] },
    ]);
  });

  it("shows a class it can't read by its id", async () => {
    const file = filesOf({ "classes/bad.json": "{nope", "classes/down.json": "fails" });
    const choices = await classChoices(["bad", "gone", "down"], file);
    expect(choices.map((c) => c.name)).toEqual(["bad", "down", "gone"]);
  });
});
