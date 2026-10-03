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

  it("ignores segments it doesn't understand", () => {
    expect(parseLocation("#/nonsense/x")).toEqual({});
    expect(parseLocation("#/zone")).toEqual({});
  });
});
