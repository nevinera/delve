import {describe, it, expect} from "vitest";
import {useState} from "react";
import {render, screen, fireEvent} from "@testing-library/react";
import ZoneLevel from "../levels/ZoneLevel";
import {fixtureDraft} from "../state/__tests__/fixtureWorld";
import {worldData} from "../state/worldOps";
import {zoneData} from "../state/zoneOps";

function renderLevel(zone = "forest", initial = fixtureDraft()) {
  const result = {draft: null};
  function Harness() {
    const [draft, setDraft] = useState(initial);
    result.draft = draft;
    return <ZoneLevel draft={draft} zone={zone} onChange={setDraft} repo="o/content" />;
  }
  render(<Harness />);
  return result;
}

describe("ZoneLevel", () => {
  it("edits zone fields, keeping the world's cached name in step", () => {
    const result = renderLevel();

    fireEvent.change(screen.getByLabelText("Name"), {target: {value: "Old Forest"}});
    fireEvent.change(screen.getByLabelText("Elevation"), {target: {value: "3"}});

    expect(zoneData(result.draft, "forest")).toMatchObject({name: "Old Forest", elvl: 3});
    expect(worldData(result.draft).zones.forest.name).toEqual("Old Forest");
  });

  it("edits the zone's gear restrictions", () => {
    const result = renderLevel();

    fireEvent.change(screen.getByLabelText("Max item elevation"), {target: {value: "10"}});
    const worlds = screen.getByLabelText(/Other worlds allowed/);
    fireEvent.change(worlds, {target: {value: "demo"}});
    fireEvent.blur(worlds);

    expect(zoneData(result.draft, "forest").provenanceRestrictions).toEqual({worlds: ["demo"], maxElevation: 10});
  });

  it("lists the zone's maps, with no links out to the old map editor", () => {
    renderLevel();

    expect(screen.getAllByText("Hub").length).toBeGreaterThan(0);
    expect(screen.getByText("Maps (1)")).toBeInTheDocument();
    expect(screen.queryByText("Edit ↗")).toBeNull();
    expect(screen.queryByText("Create Map ↗")).toBeNull();
  });

  it("adds a map from the zone's directory and fills in its unit type and item refs", () => {
    const result = renderLevel();

    fireEvent.change(screen.getByRole("combobox"), {target: {value: "passage"}});
    fireEvent.click(screen.getByRole("button", {name: "Add"}));

    expect(zoneData(result.draft, "forest").maps.map((m) => m.$ref)).toEqual(["./hub/hub.json", "./passage/passage.json"]);
    expect(zoneData(result.draft, "forest").unitTypes).toHaveProperty("archer");
  });

  it("removes a map along with its connection settings", () => {
    const result = renderLevel();

    fireEvent.click(screen.getAllByRole("button", {name: "Remove"})[0]);

    expect(zoneData(result.draft, "forest")).toMatchObject({maps: [], entryPoints: {}, openConnections: {}});
  });

  it("warns about unit types and items the world has no file for", () => {
    const initial = fixtureDraft().update("worlds/w/zones/forest/forest.json", (zone) => ({
      ...zone,
      unitTypes: {...zone.unitTypes, archer: {$ref: "../../unit_types/archer.json", referenceTo: "unit_type"}},
    }));

    renderLevel("forest", initial);

    expect(screen.getByRole("alert")).toHaveTextContent("unit type(s) archer");
  });
});
