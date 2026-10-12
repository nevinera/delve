import {describe, it, expect} from "vitest";
import {inUseRange, interactableStates} from "../interactables";

const snare = (extra = {}) => ({size: {width: 4, height: 2}, position: {x: 0, y: 0, angle: 0}, ...extra});
const interactables = {
  "snare-1": snare(),
  "snare-2": snare({whenUnavailable: "used", usedImageUrl: "./cut.webp"}),
  "snare-3": snare({whenUnavailable: "used"}),
  "totem-1": snare(),
};
const quest = (objectives) => ({quest_identifier: "q", objectives});
const use = (list, used = [], extra = {}) => ({
  objective: {type: "use", zone: "hills", interactables: list, ...extra}, used, count: used.length, required: list.length,
});

describe("interactableStates", () => {
  it("makes the ones an active use objective still wants available, the rest as they say", () => {
    const states = interactableStates(interactables, {q: quest([use(["snare-1", "snare-2", "snare-3"], ["snare-2"])])}, "hills");
    expect(states).toEqual({"snare-1": "available", "snare-2": "used", "snare-3": "available", "totem-1": "hidden"});
  });

  it("hides them all with no quest wanting them, or one in another zone, or a finished objective", () => {
    const none = {"snare-1": "hidden", "snare-2": "hidden", "snare-3": "hidden", "totem-1": "hidden"};
    expect(interactableStates(interactables, {}, "hills")).toEqual(none);
    expect(interactableStates(interactables, {q: quest([use(["snare-1"], [], {zone: "woods"})])}, "hills")).toEqual(none);
    const done = {...use(["snare-1"], []), count: 1};
    expect(interactableStates(interactables, {q: quest([done])}, "hills")).toEqual(none);
    expect(interactableStates(interactables, {q: quest([{objective: {type: "kill", zone: "hills"}, count: 0, required: 1}])}, "hills")).toEqual(none);
  });

  it("shows the used image only for ones this player used, while the quest is active", () => {
    const finished = use(["snare-1", "snare-2"], ["snare-1", "snare-2"]);
    expect(interactableStates(interactables, {q: quest([finished])}, "hills")).toMatchObject({"snare-1": "hidden", "snare-2": "used"});
  });
});

describe("inUseRange", () => {
  it("measures from its edge, half its larger side, plus the unit's radius", () => {
    expect(inUseRange({x: 13, y: 0}, 1, snare())).toBe(true);
    expect(inUseRange({x: 13.5, y: 0}, 1, snare())).toBe(false);
  });
});
