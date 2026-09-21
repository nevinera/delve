import { describe, expect, it } from "vitest";
import { RESOURCE_TYPES, resourceTypeById } from "../resourceTypes";

describe("resourceTypes", () => {
  it("lists exactly energy and mana", () => {
    expect(RESOURCE_TYPES.map(r => r.id)).toEqual(["energy", "mana"]);
  });

  it("gives each entry the full ResourceType shape", () => {
    for (const resource of RESOURCE_TYPES) {
      expect(resource).toMatchObject({
        id: expect.any(String),
        name: expect.any(String),
        color: expect.any(String),
        max: expect.any(Number),
        defaultValue: expect.any(Number),
        returnRate: expect.any(Number),
        isFluid: expect.any(Boolean),
      });
    }
  });

  it("looks resources up by id", () => {
    expect(resourceTypeById("mana")).toMatchObject({ name: "mana" });
    expect(resourceTypeById("rage")).toBeNull();
  });
});
