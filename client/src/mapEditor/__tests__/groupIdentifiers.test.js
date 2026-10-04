import {describe, it, expect} from "vitest";
import {newGroupIdentifier, unitGroups} from "../groupIdentifiers";

describe("newGroupIdentifier", () => {
  it("is group- plus six letters, avoiding names already in use", () => {
    const rolls = [0, 0, 0, 0, 0, 0, 0.99, 0, 0, 0, 0, 0];
    const random = () => rolls.shift();
    expect(newGroupIdentifier([{groupIdentifier: "group-aaaaaa"}], random)).toEqual("group-zaaaaa");
  });
});

describe("unitGroups", () => {
  it("groups members in units order, an ungrouped unit as a group of one", () => {
    const units = [{groupIdentifier: "b"}, {}, {groupIdentifier: "a"}, {groupIdentifier: "b"}];
    expect(unitGroups(units)).toEqual([
      {identifier: "b", memberIndices: [0, 3]},
      {identifier: null, memberIndices: [1]},
      {identifier: "a", memberIndices: [2]},
    ]);
  });
});
