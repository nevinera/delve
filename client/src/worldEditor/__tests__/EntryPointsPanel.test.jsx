import {describe, it, expect, vi} from "vitest";
import {render, screen, fireEvent} from "@testing-library/react";
import EntryPointsPanel from "../EntryPointsPanel";
import {WorldDraft} from "../WorldDraft";

function draftWith(data) {
  return new WorldDraft({name: "Northern Barrens", zones: {}, worldLinks: [], entryPoints: {}, ...data});
}

describe("EntryPointsPanel", () => {
  it("shows a hint and no entry points when none exist yet", () => {
    render(<EntryPointsPanel draft={draftWith({})} onChange={vi.fn()} zoneDetailsByKey={{}} />);
    expect(screen.getByText("No entry points yet - a world needs at least one.")).toBeInTheDocument();
  });

  it("only offers a zone's entry point once that zone is picked", () => {
    const draft = draftWith({zones: {goblin_cave: {path: "./x.json"}}});
    const zoneDetailsByKey = {goblin_cave: {name: "Goblin Cave", entryPoints: {"cave_entrance/cave_mouth": null}}};

    render(<EntryPointsPanel draft={draft} onChange={vi.fn()} zoneDetailsByKey={zoneDetailsByKey} />);

    expect(screen.queryByText("cave_entrance/cave_mouth", {selector: "option"})).not.toBeInTheDocument();

    fireEvent.change(screen.getByText("Select a zone…").closest("select"), {target: {value: "goblin_cave"}});

    expect(screen.getByText("cave_entrance/cave_mouth", {selector: "option"})).toBeInTheDocument();
  });

  it("adds a worldEntryPointKey-serialized entry once zone and entry point are both picked", () => {
    const draft = draftWith({zones: {goblin_cave: {path: "./x.json"}}});
    const zoneDetailsByKey = {goblin_cave: {name: "Goblin Cave", entryPoints: {"cave_entrance/cave_mouth": null}}};
    const onChange = vi.fn();

    render(<EntryPointsPanel draft={draft} onChange={onChange} zoneDetailsByKey={zoneDetailsByKey} />);

    fireEvent.change(screen.getByText("Select a zone…").closest("select"), {target: {value: "goblin_cave"}});
    fireEvent.change(screen.getByText("Select an entry point…").closest("select"), {target: {value: "cave_entrance/cave_mouth"}});
    fireEvent.click(screen.getByText("+ Add Entry Point"));

    expect(onChange).toHaveBeenCalled();
    const result = onChange.mock.calls[0][0];
    expect(result.data.entryPoints).toEqual({"goblin_cave/cave_entrance/cave_mouth": null});
  });

  it("excludes an entry point that's already been added from the picker", () => {
    const draft = draftWith({
      zones: {goblin_cave: {path: "./x.json"}},
      entryPoints: {"goblin_cave/cave_entrance/cave_mouth": null},
    });
    const zoneDetailsByKey = {
      goblin_cave: {name: "Goblin Cave", entryPoints: {"cave_entrance/cave_mouth": null, "cave_entrance/back_door": null}},
    };

    render(<EntryPointsPanel draft={draft} onChange={vi.fn()} zoneDetailsByKey={zoneDetailsByKey} />);
    fireEvent.change(screen.getByText("Select a zone…").closest("select"), {target: {value: "goblin_cave"}});

    expect(screen.queryByText("cave_entrance/cave_mouth", {selector: "option"})).not.toBeInTheDocument();
    expect(screen.getByText("cave_entrance/back_door", {selector: "option"})).toBeInTheDocument();
  });

  it("removes an entry point by its serialized key", () => {
    const draft = draftWith({entryPoints: {"goblin_cave/cave_entrance/cave_mouth": null}});
    const onChange = vi.fn();

    render(<EntryPointsPanel draft={draft} onChange={onChange} zoneDetailsByKey={{}} />);
    fireEvent.click(screen.getByText("Remove"));

    expect(onChange.mock.calls[0][0].data.entryPoints).toEqual({});
  });
});
