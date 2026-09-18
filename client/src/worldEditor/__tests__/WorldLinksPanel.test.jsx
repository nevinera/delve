import {describe, it, expect, vi} from "vitest";
import {render, screen, fireEvent} from "@testing-library/react";
import WorldLinksPanel from "../WorldLinksPanel";
import {WorldDraft} from "../WorldDraft";

function draftWith(data) {
  return new WorldDraft({name: "Northern Barrens", zones: {}, worldLinks: [], entryPoints: {}, ...data});
}

describe("WorldLinksPanel", () => {
  it("shows a hint when there are no world links yet", () => {
    render(<WorldLinksPanel draft={draftWith({})} onChange={vi.fn()} zoneDetailsByKey={{}} />);
    expect(screen.getByText("No world links yet.")).toBeInTheDocument();
  });

  it("offers a zone's real openConnections/entryPoints once fetched, by kind", () => {
    const draft = draftWith({
      zones: {goblin_cave: {path: "./x.json"}},
      worldLinks: [{zoneA: {zone: "goblin_cave", kind: "open", connection: ""}, zoneB: {zone: "", kind: "open", connection: ""}, oneWay: false, requiredKey: null}],
    });
    const zoneDetailsByKey = {
      goblin_cave: {name: "Goblin Cave", openConnections: {"a/b": "cliff_above"}, entryPoints: {"c/d": null}},
    };

    render(<WorldLinksPanel draft={draft} onChange={vi.fn()} zoneDetailsByKey={zoneDetailsByKey} />);

    expect(screen.getByText("cliff_above", {selector: "option"})).toBeInTheDocument();
    expect(screen.queryByText("c/d", {selector: "option"})).not.toBeInTheDocument();
  });

  it("falls back to a free-text field when the zone's detail hasn't been fetched yet", () => {
    const draft = draftWith({
      zones: {goblin_cave: {path: "./x.json"}},
      worldLinks: [{zoneA: {zone: "goblin_cave", kind: "open", connection: ""}, zoneB: {zone: "", kind: "open", connection: ""}, oneWay: false, requiredKey: null}],
    });

    render(<WorldLinksPanel draft={draft} onChange={vi.fn()} zoneDetailsByKey={{}} />);

    expect(screen.getAllByPlaceholderText("connection name").length).toBe(2);
  });

  it("clears the picked connection when the zone or kind changes", () => {
    const draft = draftWith({
      zones: {
        goblin_cave: {path: "./a.json"},
        stagnant_oasis: {path: "./b.json"},
      },
      worldLinks: [{
        zoneA: {zone: "goblin_cave", kind: "open", connection: "cliff_above"},
        zoneB: {zone: "", kind: "open", connection: ""},
        oneWay: false,
        requiredKey: null,
      }],
    });
    const onChange = vi.fn();

    render(<WorldLinksPanel draft={draft} onChange={onChange} zoneDetailsByKey={{}} />);

    const zoneASelects = screen.getAllByText("Select a zone…");
    fireEvent.change(zoneASelects[0].closest("select"), {target: {value: "stagnant_oasis"}});

    const result = onChange.mock.calls[0][0];
    expect(result.data.worldLinks[0].zoneA).toEqual({zone: "stagnant_oasis", kind: "open", connection: ""});
  });

  it("adds a new blank world link", () => {
    const draft = draftWith({zones: {goblin_cave: {path: "./x.json"}}});
    const onChange = vi.fn();

    render(<WorldLinksPanel draft={draft} onChange={onChange} zoneDetailsByKey={{}} />);
    fireEvent.click(screen.getByText("+ Add World Link"));

    const result = onChange.mock.calls[0][0];
    expect(result.data.worldLinks).toEqual([
      {zoneA: {zone: "", kind: "open", connection: ""}, zoneB: {zone: "", kind: "open", connection: ""}, oneWay: false, requiredKey: null},
    ]);
  });

  it("removes a world link", () => {
    const draft = draftWith({
      worldLinks: [{zoneA: {zone: "a", kind: "open", connection: "x"}, zoneB: {zone: "b", kind: "open", connection: "y"}, oneWay: false, requiredKey: null}],
    });
    const onChange = vi.fn();

    render(<WorldLinksPanel draft={draft} onChange={onChange} zoneDetailsByKey={{}} />);
    fireEvent.click(screen.getByText("Remove"));

    expect(onChange.mock.calls[0][0].data.worldLinks).toEqual([]);
  });
});
