import {describe, it, expect} from "vitest";
import {worldLinkStatus, worldEntryPointKey} from "../worldLinkStatus";

describe("worldLinkStatus", () => {
  const worldLinks = [
    {zoneA: {zone: "goblin_cave", kind: "open", connection: "cliff_above"}, zoneB: {zone: "stagnant_oasis", kind: "open", connection: "goblin_trailhead"}, oneWay: false, requiredKey: null},
  ];

  it("returns open for a connection with no worldLink", () => {
    expect(worldLinkStatus("goblin_cave", "open", "back_door", worldLinks)).toEqual({type: "open"});
  });

  it("returns worldLink with the other side, from zoneA's perspective", () => {
    expect(worldLinkStatus("goblin_cave", "open", "cliff_above", worldLinks)).toEqual({
      type: "worldLink", linkIndex: 0, otherSide: {zone: "stagnant_oasis", kind: "open", connection: "goblin_trailhead"}, oneWay: false, requiredKey: null,
    });
  });

  it("returns worldLink with the other side, from zoneB's perspective", () => {
    expect(worldLinkStatus("stagnant_oasis", "open", "goblin_trailhead", worldLinks)).toEqual({
      type: "worldLink", linkIndex: 0, otherSide: {zone: "goblin_cave", kind: "open", connection: "cliff_above"}, oneWay: false, requiredKey: null,
    });
  });

  it("does not match across kinds even when zone/connection strings collide", () => {
    expect(worldLinkStatus("goblin_cave", "entryPoint", "cliff_above", worldLinks)).toEqual({type: "open"});
  });
});

describe("worldEntryPointKey", () => {
  it("serializes zone/entryPoint as \"zoneId/entryPointKey\"", () => {
    expect(worldEntryPointKey("stagnant_oasis", "clearing_entrance/clearing")).toBe("stagnant_oasis/clearing_entrance/clearing");
  });
});
