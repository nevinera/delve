import {describe, it, expect} from "vitest";
import {fixtureDraft} from "./fixtureWorld";
import {
  chainColor, createQuest, deleteQuest, followUps, ncuQuests, prerequisites, questData, questGraph, questPositions,
  questsFile, questsLayoutFile, renameQuest, setQuestPositions, updateQuest, worldQuests,
} from "../questOps";

const quest = (identifier, fields = {}) => ({
  identifier, name: identifier, chainIdentifier: "rats", chainName: "Rats",
  offeredBy: {zone: "forest", ncu: "grizzle"}, offerText: "Work?", description: "Rats.", objectives: [], ...fields,
});

function withQuests(...quests) {
  return fixtureDraft().write("worlds/w/quests.json", quests);
}

describe("questOps", () => {
  it("finds the quests file at the default path, or questsPath", () => {
    expect(questsFile(fixtureDraft())).toBe("worlds/w/quests.json");
    expect(questsLayoutFile(fixtureDraft())).toBe("worlds/w/quests.layout.json");
    const moved = fixtureDraft().update("worlds/w/w.json", (world) => ({...world, questsPath: "./story/q.json"}));
    expect(questsFile(moved)).toBe("worlds/w/story/q.json");
    expect(questsLayoutFile(moved)).toBe("worlds/w/story/q.layout.json");
  });

  it("creates quests in a new file, sorted by chain then identifier", () => {
    let draft = createQuest(fixtureDraft(), "b-quest", {zone: "forest", ncu: "grizzle"});
    draft = createQuest(draft, "a-quest");
    expect(worldQuests(draft).map((q) => q.identifier)).toEqual(["a-quest", "b-quest"]);
    expect(questData(draft, "b-quest")).toMatchObject({chainIdentifier: "b-quest", offeredBy: {zone: "forest", ncu: "grizzle"}, objectives: []});
    expect(() => createQuest(draft, "a-quest")).toThrow(/already exists/);
    expect(() => createQuest(draft, "a/b")).toThrow(/valid quest identifier/);
    expect(() => createQuest(draft, "a".repeat(55))).toThrow(/valid quest identifier/);
  });

  it("keeps a quest's identifier on update, and shares its chain name across the chain", () => {
    const draft = updateQuest(withQuests(quest("a"), quest("b"), quest("c", {chainIdentifier: "other", chainName: "Other"})), "a",
      {...quest("a"), identifier: "zzz", chainName: "Rat Troubles"});
    expect(worldQuests(draft).map((q) => [q.identifier, q.chainName])).toEqual([["c", "Other"], ["a", "Rat Troubles"], ["b", "Rat Troubles"]]);
  });

  it("finds prerequisites and follow-ups", () => {
    const draft = withQuests(quest("a"), quest("b", {requiresFlags: ["quest/completed/a", "custom/brave"]}));
    expect(prerequisites(questData(draft, "b"))).toEqual(["a"]);
    expect(followUps(draft, "a")).toEqual(["b"]);
  });

  it("renames a quest, rewriting requirements and its position", () => {
    const draft = setQuestPositions(withQuests(quest("a"), quest("b", {requiresFlags: ["quest/completed/a"]})), {a: {x: 1, y: 2}});
    const renamed = renameQuest(draft, "a", "first");
    expect(questData(renamed, "first")).toBeTruthy();
    expect(questData(renamed, "b").requiresFlags).toEqual(["quest/completed/first"]);
    expect(questPositions(renamed)).toEqual({first: {x: 1, y: 2}});
  });

  it("refuses to delete a quest others require", () => {
    const draft = withQuests(quest("a"), quest("b", {requiresFlags: ["quest/completed/a"]}));
    expect(() => deleteQuest(draft, "a")).toThrow('"a" is required by b');
    expect(worldQuests(deleteQuest(draft, "b")).map((q) => q.identifier)).toEqual(["a"]);
  });

  it("only writes positions when they change", () => {
    const draft = setQuestPositions(fixtureDraft(), {});
    expect(draft.dirtyPaths()).toEqual([]);
  });

  it("lists an NCU's offers and turn-ins", () => {
    const draft = withQuests(quest("a"), quest("b", {turnIn: {zone: "forest", ncu: "grizzle"}, offeredBy: {zone: "cave", ncu: "x"}}));
    expect(ncuQuests(draft, "forest", "grizzle")).toEqual({offers: ["a"], turnIns: ["b"]});
  });

  it("gives each chain a stable colour", () => {
    expect(chainColor("rats")).toBe(chainColor("rats"));
    expect(chainColor("rats")).not.toBe(chainColor("goblins"));
  });

  it("graphs quests, other flags, and their links", () => {
    const graph = questGraph([
      quest("a", {grantsFlags: ["custom/brave"], marker: true}),
      quest("b", {requiresFlags: ["quest/completed/a", "custom/brave", "quest/completed/gone"]}),
    ]);
    expect(graph.nodes.map((n) => n.id)).toEqual(["quest:a", "quest:b", "flag:custom/brave", "flag:quest/completed/gone"]);
    expect(graph.nodes[0]).toMatchObject({kind: "quest", marker: true, chainName: "Rats"});
    expect(graph.edges).toEqual([
      {from: "quest:a", to: "flag:custom/brave", kind: "grants"},
      {from: "quest:a", to: "quest:b", kind: "prerequisite"},
      {from: "flag:custom/brave", to: "quest:b", kind: "requires"},
      {from: "flag:quest/completed/gone", to: "quest:b", kind: "requires"},
    ]);
  });
});
