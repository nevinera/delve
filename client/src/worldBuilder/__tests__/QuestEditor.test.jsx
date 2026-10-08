import {describe, it, expect, vi} from "vitest";
import {useState} from "react";
import {render, screen, fireEvent, within} from "@testing-library/react";
import QuestEditor from "../levels/QuestEditor";
import {fixtureDraft} from "../state/__tests__/fixtureWorld";
import {questData, worldQuests} from "../state/questOps";

const quest = (identifier, fields = {}) => ({
  identifier, name: identifier, chainIdentifier: "rats", chainName: "Rats",
  offeredBy: {zone: "forest", ncu: "grizzle"}, offerText: "Work?", description: "Rats.", objectives: [], ...fields,
});

function questDraft() {
  return fixtureDraft()
    .update("worlds/w/zones/forest/hub/hub.json", (map) => ({...map, ncus: [{identifier: "grizzle", name: "Grizzle"}, {identifier: "warden", name: "Warden"}]}))
    .write("worlds/w/quests.json", [
      quest("rat-hunt", {objectives: [{type: "kill", text: "Kill goblins", zone: "forest", unitType: "goblin", count: 3}]}),
      quest("rat-king", {name: "The Rat King", requiresFlags: ["quest/completed/rat-hunt"]}),
    ]);
}

function renderEditor(identifier, props = {}) {
  const result = {draft: null, open: identifier};
  const onOpenQuest = vi.fn();
  function Harness() {
    const [current, setCurrent] = useState(questDraft);
    result.draft = current;
    return <QuestEditor key={identifier} draft={current} quest={identifier} onChange={setCurrent} onOpenQuest={onOpenQuest} onClose={() => {}} {...props} />;
  }
  render(<Harness />);
  return {result, onOpenQuest};
}

describe("QuestEditor", () => {
  it("edits the quest's fields in the draft", () => {
    const {result} = renderEditor("rat-hunt");
    fireEvent.change(screen.getByDisplayValue("Rats."), {target: {value: "Clear the cellar."}});
    fireEvent.click(screen.getByLabelText("Show a quest marker on the NCU"));
    expect(questData(result.draft, "rat-hunt")).toMatchObject({description: "Clear the cellar.", marker: true});
  });

  it("picks the offering NCU from the zone's maps", () => {
    const {result} = renderEditor("rat-hunt");
    const row = screen.getByText("Offered by").closest("tr");
    fireEvent.change(within(row).getAllByRole("combobox")[1], {target: {value: "warden"}});
    expect(questData(result.draft, "rat-hunt").offeredBy).toEqual({zone: "forest", ncu: "warden"});
  });

  it("edits objectives, switching a kill to a specific unit", () => {
    const {result} = renderEditor("rat-hunt");
    fireEvent.change(screen.getByDisplayValue("Any of a unit type"), {target: {value: "unit"}});
    fireEvent.change(screen.getByDisplayValue("Unit…"), {target: {value: "goblin-a"}});
    expect(questData(result.draft, "rat-hunt").objectives).toEqual([
      {type: "kill", text: "Kill goblins", zone: "forest", count: 3, unit: "goblin-a"},
    ]);
  });

  it("adds a requirement on another quest", () => {
    const {result} = renderEditor("rat-hunt");
    const row = screen.getByText("Requires", {selector: "th"}).closest("tr");
    fireEvent.change(within(row).getByRole("combobox"), {target: {value: "quest/completed/rat-king"}});
    expect(questData(result.draft, "rat-hunt").requiresFlags).toEqual(["quest/completed/rat-king"]);
  });

  it("links to prerequisites and follow-ups", () => {
    const {onOpenQuest} = renderEditor("rat-king");
    fireEvent.click(screen.getByRole("button", {name: "rat-hunt"}));
    expect(onOpenQuest).toHaveBeenCalledWith("rat-hunt");
  });

  it("renames, reopening under the new identifier", () => {
    const {result, onOpenQuest} = renderEditor("rat-hunt");
    const row = screen.getByText("Identifier").closest("tr");
    fireEvent.change(within(row).getByRole("textbox"), {target: {value: "rat-patrol"}});
    fireEvent.click(screen.getByRole("button", {name: "Rename"}));
    expect(questData(result.draft, "rat-king").requiresFlags).toEqual(["quest/completed/rat-patrol"]);
    expect(onOpenQuest).toHaveBeenCalledWith("rat-patrol");
  });

  it("refuses to delete a quest another requires", () => {
    const {result} = renderEditor("rat-hunt");
    fireEvent.click(screen.getByRole("button", {name: "Delete this quest"}));
    expect(screen.getByText('"rat-hunt" is required by rat-king')).toBeInTheDocument();
    expect(worldQuests(result.draft)).toHaveLength(2);
  });
});
