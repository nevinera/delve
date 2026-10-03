import {describe, it, expect, vi, afterEach} from "vitest";
import {useState} from "react";
import {render, screen, fireEvent, within} from "@testing-library/react";
import WorldLevel from "../levels/WorldLevel";
import {fixtureDraft} from "../state/__tests__/fixtureWorld";
import {worldData} from "../state/worldOps";

// Holds the live draft the way WorldBuilderApp does, exposing the latest.
function renderLevel() {
  const result = {draft: null, navigate: vi.fn()};
  function Harness() {
    const [draft, setDraft] = useState(fixtureDraft);
    result.draft = draft;
    return <WorldLevel draft={draft} onChange={setDraft} navigate={result.navigate} repo="o/content" />;
  }
  render(<Harness />);
  return result;
}

const zones = () => within(screen.getByRole("region", {name: "Zones"}));

afterEach(() => {
  vi.restoreAllMocks();
});

describe("WorldLevel", () => {
  it("lists the world's zones and opens one", () => {
    const result = renderLevel();

    fireEvent.click(zones().getByRole("button", {name: /Cave/}));

    expect(result.navigate).toHaveBeenCalledWith({zone: "cave"});
  });

  it("edits world attributes in the live draft", () => {
    const result = renderLevel();

    fireEvent.change(screen.getByPlaceholderText("Northern Barrens"), {target: {value: "Wider"}});

    expect(worldData(result.draft).name).toEqual("Wider");
  });

  it("creates a zone and opens it", () => {
    const result = renderLevel();

    fireEvent.click(zones().getByRole("button", {name: "+ New zone"}));
    fireEvent.change(zones().getByRole("textbox", {name: "Zone identifier"}), {target: {value: "swamp"}});
    fireEvent.change(zones().getByRole("textbox", {name: "Zone name"}), {target: {value: "The Swamp"}});
    fireEvent.click(zones().getByRole("button", {name: "Create"}));

    expect(worldData(result.draft).zones.swamp.name).toEqual("The Swamp");
    expect(result.navigate).toHaveBeenCalledWith({zone: "swamp"});
  });

  it("explains an identifier it can't use, leaving the draft alone", () => {
    const result = renderLevel();

    fireEvent.click(zones().getByRole("button", {name: "+ New zone"}));
    fireEvent.change(zones().getByRole("textbox", {name: "Zone identifier"}), {target: {value: "small/swamp"}});
    fireEvent.click(zones().getByRole("button", {name: "Create"}));

    expect(zones().getByRole("alert")).toHaveTextContent("isn't a valid identifier");
    expect(result.draft.hasChanges).toBe(false);
  });

  it("renames a zone, marking it unsaved", () => {
    const result = renderLevel();

    fireEvent.click(zones().getByRole("button", {name: "Rename forest"}));
    fireEvent.change(zones().getByRole("textbox", {name: "New identifier for forest"}), {target: {value: "woods"}});
    fireEvent.click(zones().getByRole("button", {name: "Rename"}));

    expect(Object.keys(worldData(result.draft).zones)).toEqual(["woods", "cave"]);
    expect(zones().getByText("woods • unsaved")).toBeInTheDocument();
  });

  it("deletes a zone after confirming what goes with it", () => {
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(true);
    const result = renderLevel();

    fireEvent.click(zones().getByRole("button", {name: "Delete forest"}));

    expect(confirm.mock.calls[0][0]).toMatch(/5 file\(s\), 1 world link\(s\) and 1 entry point\(s\)/);
    expect(Object.keys(worldData(result.draft).zones)).toEqual(["cave"]);
  });

  it("keeps the zone when the delete isn't confirmed", () => {
    vi.spyOn(window, "confirm").mockReturnValue(false);
    const result = renderLevel();

    fireEvent.click(zones().getByRole("button", {name: "Delete forest"}));

    expect(result.draft.hasChanges).toBe(false);
  });
});
