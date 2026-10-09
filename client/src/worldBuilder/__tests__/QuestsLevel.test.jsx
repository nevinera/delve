import {describe, it, expect, vi} from "vitest";
import {useState} from "react";
import {render, screen, fireEvent} from "@testing-library/react";
import QuestsLevel from "../levels/QuestsLevel";
import {fixtureDraft} from "../state/__tests__/fixtureWorld";
import {questData} from "../state/questOps";

const quest = (identifier, fields = {}) => ({
  identifier, name: identifier, chainIdentifier: "rats", chainName: "Rats",
  offeredBy: {zone: "forest", ncu: "grizzle"}, offerText: "Work?", description: "Rats.", objectives: [], ...fields,
});

function renderLevel(quests) {
  const result = {draft: null};
  const onOpenQuest = vi.fn();
  function Harness() {
    const [current, setCurrent] = useState(() => fixtureDraft().write("worlds/w/quests.json", quests));
    result.draft = current;
    return <QuestsLevel draft={current} onChange={setCurrent} onOpenQuest={onOpenQuest} />;
  }
  render(<Harness />);
  return {result, onOpenQuest};
}

describe("QuestsLevel", () => {
  it("graphs quests and the other flags they use, with chain badges", () => {
    renderLevel([quest("rat-hunt", {name: "Rat Hunt", marker: true, grantsFlags: ["custom/brave"]}), quest("rat-king", {requiresFlags: ["quest/completed/rat-hunt"]})]);
    expect(screen.getByRole("button", {name: "Quest Rat Hunt"})).toBeInTheDocument();
    expect(screen.getByRole("button", {name: "Quest rat-king"})).toBeInTheDocument();
    expect(document.querySelectorAll(".quest-graph-flag title")[0].textContent).toBe("custom/brave");
    expect(document.querySelector(".quest-graph-chain title").textContent).toBe("Rats");
    expect(document.querySelectorAll("line")).toHaveLength(2);
  });

  it("opens a quest from the graph or the list", () => {
    const {onOpenQuest} = renderLevel([quest("rat-hunt", {name: "Rat Hunt"})]);
    const node = screen.getByRole("button", {name: "Quest Rat Hunt"});
    fireEvent.pointerDown(node);
    fireEvent.pointerUp(node);
    expect(onOpenQuest).toHaveBeenCalledWith("rat-hunt");
    fireEvent.click(screen.getByRole("button", {name: "Rat Hunt"}));
    expect(onOpenQuest).toHaveBeenCalledTimes(2);
  });

  it("creates a quest and opens it", () => {
    const {result, onOpenQuest} = renderLevel([]);
    fireEvent.change(screen.getByLabelText("New quest identifier"), {target: {value: "first-steps"}});
    fireEvent.click(screen.getByRole("button", {name: "New quest"}));
    expect(questData(result.draft, "first-steps")).toMatchObject({chainIdentifier: "first-steps"});
    expect(onOpenQuest).toHaveBeenCalledWith("first-steps");
  });

  it("reports a taken identifier", () => {
    renderLevel([quest("rat-hunt")]);
    fireEvent.change(screen.getByLabelText("New quest identifier"), {target: {value: "rat-hunt"}});
    fireEvent.click(screen.getByRole("button", {name: "New quest"}));
    expect(screen.getByText('Quest "rat-hunt" already exists')).toBeInTheDocument();
  });

  it("pinch-zooms the graph, a pinch starting on a quest not opening it", () => {
    vi.stubGlobal("requestAnimationFrame", (cb) => {
      cb();
      return 1;
    });
    const {onOpenQuest} = renderLevel([quest("rat-hunt", {name: "Rat Hunt"})]);
    const node = screen.getByRole("button", {name: "Quest Rat Hunt"});
    const touch = (pointerId, clientX, clientY) => ({pointerId, pointerType: "touch", clientX, clientY});

    fireEvent.pointerDown(node, touch(1, 90, 50));
    fireEvent.pointerDown(document.querySelector(".quest-graph"), touch(2, 110, 50));
    fireEvent.pointerMove(node, touch(2, 150, 50)); // from 20px to 60px apart, midpoint 100 -> 120
    fireEvent.pointerUp(node, touch(1, 90, 50));
    fireEvent.pointerUp(node, touch(2, 150, 50));

    expect(document.querySelector(".quest-graph svg > g")).toHaveAttribute("transform", "translate(-180 -100) scale(3)");
    expect(onOpenQuest).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });
});
