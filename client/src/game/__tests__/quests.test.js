import {describe, expect, it} from "vitest";
import {describeObjective, offersFor, questLogChains, questMessageAction, questNcus, questsById, zoneNames} from "../quests";

const definitions = questsById([
  {identifier: "rat-hunt", name: "Rat Hunt", offerText: "Rats!", objectives: []},
  {identifier: "rat-king", name: "The Rat King", offerText: "Bigger rats."},
]);

describe("questNcus", () => {
  it("is the NCUs with something on offer", () => {
    expect(questNcus({grizzle: ["rat-hunt"], warden: []})).toEqual(new Set(["grizzle"]));
    expect(questNcus(undefined)).toEqual(new Set());
  });
});

describe("offersFor", () => {
  it("is the NCU's offers, in order, with their text", () => {
    expect(offersFor({grizzle: ["rat-king", "rat-hunt", "unknown"]}, "grizzle", definitions)).toEqual([
      {identifier: "rat-king", name: "The Rat King", offerText: "Bigger rats."},
      {identifier: "rat-hunt", name: "Rat Hunt", offerText: "Rats!"},
    ]);
    expect(offersFor({}, "grizzle", definitions)).toEqual([]);
  });
});

describe("questMessageAction", () => {
  it("reads offers", () => {
    expect(questMessageAction({type: "quest_offers", offers: {grizzle: ["rat-hunt"]}}, definitions))
      .toEqual({type: "offers", offers: {grizzle: ["rat-hunt"]}});
  });

  it("logs accepts and failures by quest name", () => {
    expect(questMessageAction({type: "quest_accepted", quest: {quest_identifier: "rat-hunt"}}, definitions).log)
      .toBe("Quest accepted: Rat Hunt");
    expect(questMessageAction({type: "quest_accept_failed", quest: "rat-king", error: "nope"}, definitions).log)
      .toBe("Couldn't accept The Rat King: nope");
  });

  it("ignores other messages", () => {
    expect(questMessageAction({type: "zone-exit"}, definitions)).toBeNull();
  });
});

const zone = {
  unitTypes: {rat: {name: "Rat"}},
  maps: [{identifier: "depths", name: "The Depths", units: [{identifier: "rat-king", unitType: "rat"}], ncus: [{identifier: "grizzle", name: "Grizzle"}]}],
};
const here = {zoneIdentifier: "cave", names: zoneNames(zone)};

describe("describeObjective", () => {
  it("names things in the current zone", () => {
    expect(describeObjective({type: "kill", zone: "cave", unitType: "rat", map: "depths"}, here)).toBe("Kill Rat in The Depths");
    expect(describeObjective({type: "kill", zone: "cave", unit: "rat-king"}, here)).toBe("Kill Rat");
    expect(describeObjective({type: "talk", zone: "cave", ncu: "grizzle"}, here)).toBe("Talk to Grizzle");
    expect(describeObjective({type: "reach", zone: "cave", map: "depths"}, here)).toBe("Reach The Depths");
  });

  it("falls back to identifiers in other zones", () => {
    expect(describeObjective({type: "talk", zone: "elsewhere", ncu: "grizzle"}, here)).toBe("Talk to grizzle");
  });
});

describe("questLogChains", () => {
  const defs = questsById([
    {identifier: "b-quest", name: "B", chainIdentifier: "zeta", chainName: "Zeta", offeredBy: {zone: "cave", ncu: "grizzle"}, offerText: "Go.",
      timer: "5m", objectives: [{type: "kill", zone: "cave", unitType: "rat", count: 5}, {type: "talk", zone: "cave", ncu: "grizzle"}]},
    {identifier: "a-quest", name: "A", chainIdentifier: "alpha", chainName: "Alpha", offeredBy: {zone: "cave", ncu: "grizzle"}, offerText: "Hi.",
      description: "Do the thing."},
  ]);

  it("groups quests into chains sorted by name, with progress and text", () => {
    const chains = questLogChains([
      {quest_identifier: "b-quest", objectives: [3, 1]},
      {quest_identifier: "a-quest", objectives: []},
      {quest_identifier: "gone", objectives: []},
    ], defs, here);
    expect(chains.map((c) => c.name)).toEqual(["Alpha", "Zeta"]);
    expect(chains[0].quests[0]).toMatchObject({name: "A", description: "Do the thing.", timer: null, objectives: []});
    expect(chains[1].quests[0]).toMatchObject({
      name: "B",
      description: "Grizzle said: Go.",
      timer: "5m",
      objectives: [{text: "Kill Rat", count: 3, required: 5}, {text: "Talk to Grizzle", count: 1, required: 1}],
    });
  });
});

describe("questMessageAction for the log", () => {
  it("reads the quest log and abandon failures", () => {
    expect(questMessageAction({type: "quest_log", quests: [{quest_identifier: "x"}]}, {})).toEqual({type: "quest_log", quests: [{quest_identifier: "x"}]});
    expect(questMessageAction({type: "quest_abandon_failed", quest: "x", error: "nope"}, {}).log).toBe("Couldn't abandon x: nope");
  });
});
