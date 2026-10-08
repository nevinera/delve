import {describe, expect, it} from "vitest";
import {activeQuestsById, applyQuestAction, offersFor, questLogZones, questMessageAction, questNcus, questsById, timerRemaining, timerSeconds, turnInsFor, zoneNames} from "../quests";

const definitions = questsById([
  {identifier: "rat-hunt", name: "Rat Hunt", offerText: "Any work?", description: "Rats!", marker: true, objectives: []},
  {identifier: "rat-king", name: "The Rat King", offerText: "What else?", description: "Bigger rats."},
]);

describe("questNcus", () => {
  it("is the NCUs offering a marker quest", () => {
    expect(questNcus({grizzle: ["rat-hunt"], warden: ["rat-king"], nobody: []}, definitions)).toEqual(new Set(["grizzle"]));
    expect(questNcus(undefined, definitions)).toEqual(new Set());
  });
});

describe("offersFor", () => {
  it("is the NCU's offers, in order, with their text", () => {
    expect(offersFor({grizzle: ["rat-king", "rat-hunt", "unknown"]}, "grizzle", definitions)).toEqual([
      {identifier: "rat-king", offerText: "What else?", description: "Bigger rats.", marker: false},
      {identifier: "rat-hunt", offerText: "Any work?", description: "Rats!", marker: true},
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
      .toEqual({type: "upsert", quest, log: "Quest started: Rat Hunt"});
    expect(questMessageAction({type: "quest-updated", quest}, definitions)).toEqual({type: "upsert", quest});
  });

  it("removes abandoned quests", () => {
    expect(questMessageAction({type: "quest-abandoned", quest: "rat-king"}, definitions))
      .toEqual({type: "remove", quest: "rat-king", log: "Quest abandoned: The Rat King"});
  });

  it("logs failures by quest name", () => {
    expect(questMessageAction({type: "quest-accept-failed", quest: "rat-king", error: "nope"}, definitions).log)
      .toBe("Couldn't start The Rat King: nope");
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

describe("zoneNames", () => {
  it("names a zone's NCUs and named maps", () => {
    const zone = {maps: [{identifier: "depths", name: "The Depths", ncus: [{identifier: "grizzle", name: "Grizzle"}]}, {identifier: "attic"}]};
    expect(zoneNames(zone)).toEqual({ncus: {grizzle: "Grizzle"}, maps: {depths: "The Depths"}});
  });
});

describe("questLogZones", () => {
  const prose = questsById([
    {identifier: "rat-hunt", name: "Rat Hunt", description: "Rats!"},
    {identifier: "delivery", name: "Delivery", description: "Take this."},
  ]);
  const kill = {hash: "k", objective: {type: "kill", text: "Kill rats", zone: "cave", unitType: "rat", count: 5, map: "depths"}, count: 3, required: 5};
  const talk = {hash: "t", objective: {type: "talk", text: "Talk to the warden", zone: "town", ncu: "warden"}, count: 0, required: 1};
  const reach = {hash: "r", objective: {type: "reach", text: "Find the cave", zone: "cave"}, count: 1, required: 1};
  const active = activeQuestsById([
    {quest_identifier: "rat-hunt", definition: {timer: "5m"}, objectives: [kill, talk, reach]},
    {quest_identifier: "delivery", definition: {turnIn: {zone: "town", ncu: "mayor"}}, objectives: [reach]},
    {quest_identifier: "orphan", definition: {}, objectives: [{...talk, hash: "t2"}]},
  ], 1_000);
  const here = {zoneIdentifier: "cave", zoneNames: {cave: "The Cave", town: "Town"}};

  it("lists unfinished objectives by their zone, and finished quests under their turn-in zone", () => {
    const zones = questLogZones(active, prose, here);
    expect(zones.map((z) => [z.identifier, z.name, z.count])).toEqual([["cave", "The Cave", 1], ["town", "Town", 3]]);
    expect(zones[0].quests).toEqual([{
      identifier: "rat-hunt", name: "Rat Hunt", description: "Rats!", timerSeconds: 300, timerStartedAt: 1_000,
      objectives: [{hash: "k", text: "Kill rats", count: 3, required: 5, map: "depths"}], turnIn: null,
    }]);
    expect(zones[1].quests.map((q) => [q.name, q.objectives.map((o) => o.text), q.turnIn])).toEqual([
      ["Delivery", [], "mayor"],
      ["orphan", ["Talk to the warden"], null],
      ["Rat Hunt", ["Talk to the warden"], null],
    ]);
  });

  it("puts the current zone first, then the rest by name, falling back to identifiers", () => {
    const zones = questLogZones(active, prose, {zoneIdentifier: "town", zoneNames: {}});
    expect(zones.map((z) => z.name)).toEqual(["town", "cave"]);
  });
});
