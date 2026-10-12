import {describe, it, expect, vi} from "vitest";
import {useState} from "react";
import {render, screen, fireEvent, within} from "@testing-library/react";
import QuestEditor from "../levels/QuestEditor";
import {fixtureDraft} from "../state/__tests__/fixtureWorld";
import {questData, worldQuests} from "../state/questOps";
import {zoneData} from "../state/zoneOps";
import {itemKeys} from "../state/itemOps";

const quest = (identifier, fields = {}) => ({
  identifier, name: identifier, chainIdentifier: "rats", chainName: "Rats",
  offeredBy: {zone: "forest", ncu: "grizzle"}, offerText: "Work?", description: "Rats.", objectives: [], ...fields,
});

function questDraft() {
  return fixtureDraft()
    .update("worlds/w/zones/forest/hub/hub.json", (map) => ({...map, ncus: [{identifier: "grizzle", name: "Grizzle"}, {identifier: "warden", name: "Warden"}],
      interactables: [{identifier: "snare-1", name: "Goblin Snare"}, {identifier: "snare-2", name: "Goblin Snare"}]}))
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

  it("switches an objective to use, ticking the zone's interactables", () => {
    const {result} = renderEditor("rat-hunt");
    fireEvent.change(screen.getByDisplayValue("kill"), {target: {value: "use"}});
    expect(questData(result.draft, "rat-hunt").objectives).toEqual([{type: "use", text: "Kill goblins", zone: "forest", interactables: []}]);
    fireEvent.click(screen.getByLabelText(/^snare-2 /));
    fireEvent.click(screen.getByLabelText(/^snare-1 /));
    fireEvent.click(screen.getByLabelText(/^snare-2 /));
    expect(questData(result.draft, "rat-hunt").objectives[0].interactables).toEqual(["snare-1"]);
    expect(screen.getByLabelText(/^snare-1 /).closest("label").textContent).toBe("snare-1 (Goblin Snare, Hub)");
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

  it("rewards any of the world's items, adding it to the reward's zone", () => {
    const {result} = renderEditor("rat-hunt");
    fireEvent.click(screen.getByRole("button", {name: "Add reward"}));
    fireEvent.change(screen.getByDisplayValue("Item…"), {target: {value: "iron-ring"}});
    expect(questData(result.draft, "rat-hunt").rewards).toEqual([{zone: "forest", item: "iron-ring"}]);
    expect(zoneData(result.draft, "forest").items).toHaveProperty("iron-ring");
  });

  it("creates a new item as a reward, editing it first", () => {
    const {result} = renderEditor("rat-hunt");
    fireEvent.click(screen.getByRole("button", {name: "New item…"}));
    fireEvent.click(screen.getByRole("button", {name: "Create new…"}));
    const form = screen.getByRole("dialog", {name: "Add a new item"});
    fireEvent.change(within(form).getAllByRole("textbox")[0], {target: {value: "rat-tail"}});
    fireEvent.submit(within(form).getAllByRole("textbox")[0].closest("form"));
    expect(itemKeys(result.draft)).toContain("rat-tail");
    expect(screen.getByRole("dialog", {name: "Edit item rat-tail"})).toBeInTheDocument();
    fireEvent.click(within(screen.getByRole("dialog", {name: "Edit item rat-tail"})).getByRole("button", {name: "Done"}));
    expect(questData(result.draft, "rat-hunt").rewards).toEqual([{zone: "forest", item: "rat-tail"}]);
    expect(zoneData(result.draft, "forest").items).toHaveProperty("rat-tail");
  });

  it("shows no annotations for a quest without any", () => {
    renderEditor("rat-hunt");
    expect(screen.queryByText("Annotations")).not.toBeInTheDocument();
  });

  it("edits annotations a quest has", () => {
    const result = {draft: null};
    function Harness() {
      const [current, setCurrent] = useState(() => questDraft().write("worlds/w/quests.json", [quest("rat-hunt", {annotations: {plan: "The first kill quest."}})]));
      result.draft = current;
      return <QuestEditor draft={current} quest="rat-hunt" onChange={setCurrent} onOpenQuest={() => {}} onClose={() => {}} />;
    }
    render(<Harness />);
    fireEvent.change(screen.getByLabelText("plan"), {target: {value: "The first quest."}});
    expect(questData(result.draft, "rat-hunt").annotations).toEqual({plan: "The first quest."});
  });
});
