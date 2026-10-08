import {describe, it, expect} from "vitest";
import {parseLocation, formatLocation} from "../location";

describe("location", () => {
  it("round-trips the world and zone levels", () => {
    expect(parseLocation("")).toEqual({});
    expect(parseLocation("#/")).toEqual({});
    expect(parseLocation("#/zone/low-cave")).toEqual({zone: "low-cave"});
    expect(formatLocation({zone: "low-cave"})).toEqual("#/zone/low-cave");
    expect(formatLocation({})).toEqual("#/");
  });

  it("round-trips the map level", () => {
    expect(parseLocation("#/zone/forest/map/hub")).toEqual({zone: "forest", map: "hub"});
    expect(formatLocation({zone: "forest", map: "hub"})).toEqual("#/zone/forest/map/hub");
    expect(parseLocation("#/zone/forest/map")).toEqual({zone: "forest"});
  });

  it("round-trips the unit type level", () => {
    expect(parseLocation("#/unit_type/goblin")).toEqual({unitType: "goblin"});
    expect(formatLocation({unitType: "goblin"})).toEqual("#/unit_type/goblin");
    expect(parseLocation("#/item/iron-ring")).toEqual({item: "iron-ring"});
    expect(formatLocation({item: "iron-ring"})).toEqual("#/item/iron-ring");
  });

  it("round-trips the quests level, with a quest open or not", () => {
    expect(parseLocation("#/quests")).toEqual({quests: true});
    expect(formatLocation({quests: true})).toEqual("#/quests");
    expect(parseLocation("#/quests/rat-hunt")).toEqual({quests: true, quest: "rat-hunt"});
    expect(formatLocation({quests: true, quest: "rat-hunt"})).toEqual("#/quests/rat-hunt");
  });

  it("ignores segments it doesn't understand", () => {
    expect(parseLocation("#/nonsense/x")).toEqual({});
    expect(parseLocation("#/zone")).toEqual({});
  });
});
