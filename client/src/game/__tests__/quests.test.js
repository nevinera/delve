import {describe, expect, it} from "vitest";
import {offersFor, questMessageAction, questNcus, questsById} from "../quests";

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
