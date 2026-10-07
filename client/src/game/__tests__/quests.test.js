import {describe, expect, it} from "vitest";
import {activeQuestsById, applyQuestAction, describeObjective, offersFor, questLogChains, questMessageAction, questNcus, questsById, timerRemaining, timerSeconds, turnInsFor, zoneNames} from "../quests";

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
    expect(questMessageAction({type: "quest-offers", offers: {grizzle: ["rat-hunt"]}}, definitions))
      .toEqual({type: "offers", offers: {grizzle: ["rat-hunt"]}});
  });

  it("adds received and updated quests, logging receipt by name", () => {
    const quest = {quest_identifier: "rat-hunt"};
    expect(questMessageAction({type: "quest-received", quest}, definitions))
      .toEqual({type: "upsert", quest, log: "Quest accepted: Rat Hunt"});
    expect(questMessageAction({type: "quest-updated", quest}, definitions)).toEqual({type: "upsert", quest});
  });

  it("removes abandoned quests", () => {
    expect(questMessageAction({type: "quest-abandoned", quest: "rat-king"}, definitions))
      .toEqual({type: "remove", quest: "rat-king", log: "Quest abandoned: The Rat King"});
  });

  it("logs failures by quest name", () => {
    expect(questMessageAction({type: "quest-accept-failed", quest: "rat-king", error: "nope"}, definitions).log)
      .toBe("Couldn't accept The Rat King: nope");
    expect(questMessageAction({type: "quest-abandon-failed", quest: "x", error: "nope"}, {}).log).toBe("Couldn't abandon x: nope");
  });

  it("reads progress, completion and failure", () => {
    expect(questMessageAction({type: "quest-progress", quest: "rat-hunt", objective: "h1", count: 2}, definitions))
      .toEqual({type: "progress", quest: "rat-hunt", objective: "h1", count: 2});
    expect(questMessageAction({type: "quest-completed", quest: "rat-hunt", flags: [], items: ["Rat Tail", "Cheese"]}, definitions))
      .toEqual({type: "remove", quest: "rat-hunt", log: "Quest complete: Rat Hunt. Received: Rat Tail, Cheese."});
    expect(questMessageAction({type: "quest-completed", quest: "rat-hunt", items: []}, definitions).log).toBe("Quest complete: Rat Hunt.");
    expect(questMessageAction({type: "quest-failed", quest: "rat-hunt"}, definitions))
      .toEqual({type: "remove", quest: "rat-hunt", log: "Quest failed: Rat Hunt (out of time)"});
    expect(questMessageAction({type: "quest-turn-in-failed", quest: "rat-hunt", error: "not yet"}, definitions).log)
      .toBe("Couldn't turn in Rat Hunt: not yet");
  });

  it("ignores other messages", () => {
    expect(questMessageAction({type: "zone-exit"}, definitions)).toBeNull();
  });
});

describe("applyQuestAction", () => {
  it("adds, replaces and removes active quests, noting when timers started", () => {
    let quests = activeQuestsById([{quest_identifier: "a", timer_elapsed_seconds: 0}], 10_000);
    quests = applyQuestAction(quests, {type: "upsert", quest: {quest_identifier: "a", timer_elapsed_seconds: 5}}, 20_000);
    quests = applyQuestAction(quests, {type: "upsert", quest: {quest_identifier: "b"}}, 20_000);
    expect(quests).toEqual({
      a: {quest_identifier: "a", timer_elapsed_seconds: 5, timer_started_at: 15_000},
      b: {quest_identifier: "b", timer_started_at: 20_000},
    });
    expect(applyQuestAction(quests, {type: "remove", quest: "a"})).toEqual({b: quests.b});
    expect(applyQuestAction(quests, {type: "offers"})).toBe(quests);
  });

  it("updates an objective's count by hash", () => {
    const quests = {a: {quest_identifier: "a", objectives: [{hash: "h1", count: 0, required: 2}, {hash: "h2", count: 0, required: 1}]}};
    const updated = applyQuestAction(quests, {type: "progress", quest: "a", objective: "h1", count: 1});
    expect(updated.a.objectives).toEqual([{hash: "h1", count: 1, required: 2}, {hash: "h2", count: 0, required: 1}]);
    expect(applyQuestAction(quests, {type: "progress", quest: "gone", objective: "h1", count: 1})).toBe(quests);
  });
});

describe("timers", () => {
  it("parses time limits", () => {
    expect(timerSeconds("90s")).toBe(90);
    expect(timerSeconds("5m")).toBe(300);
    expect(timerSeconds(undefined)).toBeNull();
    expect(timerSeconds("0s")).toBeNull();
  });

  it("counts down without going below zero", () => {
    expect(timerRemaining(90, 1_000, 31_500)).toBe(60);
    expect(timerRemaining(90, 1_000, 200_000)).toBe(0);
  });
});

describe("turnInsFor", () => {
  const prose = questsById([{identifier: "deliver", name: "Delivery", progressText: "Well?", completionText: "Thanks!"}]);
  const active = {
    deliver: {quest_identifier: "deliver", definition: {turnIn: {zone: "cave", ncu: "warden"}},
      objectives: [{hash: "h1", count: 1, required: 1}]},
    unfinished: {quest_identifier: "unfinished", definition: {turnIn: {zone: "cave", ncu: "warden"}},
      objectives: [{hash: "h1", count: 0, required: 1}]},
    elsewhere: {quest_identifier: "elsewhere", definition: {turnIn: {zone: "town", ncu: "warden"}}, objectives: []},
    none: {quest_identifier: "none", definition: {}, objectives: []},
  };

  it("is the NCU's turn-ins in this zone, with completion or progress text", () => {
    expect(turnInsFor(active, "warden", "cave", prose)).toEqual([
      {identifier: "deliver", name: "Delivery", ready: true, text: "Thanks!"},
      {identifier: "unfinished", name: "unfinished", ready: false, text: ""},
    ]);
    expect(turnInsFor(active, "grizzle", "cave", prose)).toEqual([]);
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
  const prose = questsById([
    {identifier: "b-quest", name: "B", chainName: "Zeta", offerText: "Go."},
    {identifier: "a-quest", name: "A", chainName: "Alpha", description: "Do the thing."},
  ]);
  const active = activeQuestsById([
    {quest_identifier: "b-quest", definition: {chainIdentifier: "zeta", offeredBy: {zone: "cave", ncu: "grizzle"}, timer: "5m"},
      objectives: [
        {objective: {type: "kill", zone: "cave", unitType: "rat", count: 5}, count: 3, required: 5},
        {objective: {type: "talk", zone: "cave", ncu: "grizzle"}, count: 1, required: 1},
      ]},
    {quest_identifier: "a-quest", definition: {chainIdentifier: "alpha"}, objectives: []},
  ]);

  it("groups quests into chains sorted by name, with progress and prose", () => {
    const chains = questLogChains(active, prose, here);
    expect(chains.map((c) => c.name)).toEqual(["Alpha", "Zeta"]);
    expect(chains[0].quests[0]).toMatchObject({name: "A", description: "Do the thing.", timerSeconds: null, objectives: []});
    expect(chains[1].quests[0]).toMatchObject({
      name: "B",
      description: "Grizzle said: Go.",
      timerSeconds: 300,
      timerStartedAt: active["b-quest"].timer_started_at,
      objectives: [{text: "Kill Rat", count: 3, required: 5}, {text: "Talk to Grizzle", count: 1, required: 1}],
    });
  });

  it("falls back to identifiers when the quests file lacks a quest", () => {
    const chains = questLogChains(active, {}, here);
    expect(chains.map((c) => c.name)).toEqual(["alpha", "zeta"]);
    expect(chains[0].quests[0]).toMatchObject({name: "a-quest", description: ""});
  });
});
