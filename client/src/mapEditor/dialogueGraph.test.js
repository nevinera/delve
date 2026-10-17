import {describe, expect, it} from "vitest";
import {dialogueGraph, dialogueLayout, START_ID} from "./dialogueGraph";

const dialogue = {
  entry: [{node: "a"}],
  nodes: {
    a: {text: "Hello", choices: [{text: "Hi", next: "b"}, {text: "Bye"}]},
    b: {text: "Welcome", next: "gone"},
  },
};

describe("dialogueGraph", () => {
  it("makes npc, choice and quest nodes with directed edges", () => {
    const graph = dialogueGraph(dialogue, [{identifier: "q", name: "Rats"}]);
    expect(graph.nodes.map((n) => [n.id, n.kind])).toEqual([
      [START_ID, "start"], ["a", "npc"], ["a#0", "choice"], ["a#1", "choice"], ["b", "npc"], ["quest:q", "quest"],
    ]);
    expect(graph.edges).toEqual([
      {from: "a", to: "a#0"}, {from: "a#0", to: "b"}, {from: "a", to: "a#1"},
      {from: START_ID, to: "a"}, {from: START_ID, to: "quest:q"},
    ]);
  });

  it("copes with no dialogue", () => {
    expect(dialogueGraph(undefined).nodes).toHaveLength(1);
  });
});

describe("dialogueLayout", () => {
  it("keeps saved positions and puts the rest in columns by depth", () => {
    const graph = dialogueGraph(dialogue);
    const positions = dialogueLayout(graph, {b: {x: 5, y: 6}});
    expect(positions.b).toEqual({x: 5, y: 6});
    expect(positions[START_ID]).toEqual({x: 0, y: 0});
    expect(positions.a.x).toBe(220);
    expect(positions["a#0"].x).toBe(440);
    expect(positions["a#1"].y).toBe(90);
  });
});
