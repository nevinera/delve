import {describe, it, expect} from "vitest";
import {lootFailureMessages} from "../lootMessages";

const sword = {identifier: "sword", name: "Rusty Sword"};

describe("lootFailureMessages", () => {
  it("explains loot that can't be kept in a directly played zone", () => {
    expect(lootFailureMessages([{claimed_by: "me", item: sword, reason: "not_persisted"}], "me")).toEqual([
      "Can't keep Rusty Sword: loot isn't kept when trying a zone directly.",
    ]);
  });

  it("asks to retry any other failure", () => {
    expect(lootFailureMessages([{claimed_by: "me", item: sword}], "me")).toEqual(["Failed to loot Rusty Sword - please try again."]);
  });

  it("ignores other players' failures", () => {
    expect(lootFailureMessages([{claimed_by: "them", item: sword}], "me")).toEqual([]);
  });

  it("says nothing until we know which unit is ours", () => {
    expect(lootFailureMessages([{claimed_by: "me", item: sword}], undefined)).toEqual([]);
  });
});
