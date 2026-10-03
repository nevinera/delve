import {describe, it, expect, vi, afterEach} from "vitest";
import {useState} from "react";
import {render, screen, fireEvent, within, waitFor} from "@testing-library/react";
import MapLevel from "../levels/MapLevel";
import ZoneLevel from "../levels/ZoneLevel";
import {fixtureDraft} from "../state/__tests__/fixtureWorld";
import {mapData} from "../state/mapOps";
import {zoneData} from "../state/zoneOps";
import {unitTypeData, unitTypeKeys} from "../state/unitTypeOps";
import {LibraryReader} from "../state/libraryReader";
import {fakeClient} from "../state/__tests__/fakeLibrary";

// The unit type editor's preview mounts a WebGL renderer jsdom can't back.
vi.mock("../../unitTypeEditor/UnitTypePreviewPane", () => ({default: () => <div data-testid="preview" />}));

function renderWith(Level, props) {
  const result = {draft: null, navigate: vi.fn()};
  function Harness() {
    const [draft, setDraft] = useState(fixtureDraft);
    result.draft = draft;
    return <Level draft={draft} onChange={setDraft} navigate={result.navigate} repo="o/content" stockAssets={{icons: {}, graphics: {}, sounds: {}}} {...props} />;
  }
  render(<Harness />);
  return result;
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("MapLevel", () => {
  it("edits the map in the live draft", () => {
    const result = renderWith(MapLevel, {zone: "forest", map: "hub"});

    fireEvent.change(screen.getByLabelText("Lighting"), {target: {value: "torchlight"}});

    expect(mapData(result.draft, "forest", "hub").lighting).toEqual("torchlight");
    expect(result.draft.dirtyPaths()).toContain("worlds/w/zones/forest/hub/hub.json");
  });

  describe("getting a unit type into the Units tab's palette", () => {
    function openAdder() {
      fireEvent.click(screen.getByRole("tab", {name: "Units"}));
      fireEvent.click(screen.getByRole("button", {name: "Add a unit type"}));
      return within(screen.getByRole("dialog", {name: "Add a unit type"}));
    }

    it("creates one, edits it in a modal, then arms it", () => {
      const result = renderWith(MapLevel, {zone: "forest", map: "hub"});

      const adder = openAdder();
      fireEvent.click(adder.getByRole("button", {name: "Create new…"}));
      fireEvent.change(adder.getByRole("textbox", {name: "Unit type identifier"}), {target: {value: "troll"}});
      fireEvent.click(adder.getByRole("button", {name: "Create"}));

      const modal = within(screen.getByRole("dialog", {name: "Edit unit type troll"}));
      fireEvent.change(modal.getByDisplayValue("Troll"), {target: {value: "Cave Troll"}});
      fireEvent.click(modal.getByRole("button", {name: "Done"}));

      expect(unitTypeData(result.draft, "troll").name).toEqual("Cave Troll");
      expect(screen.queryByRole("dialog", {name: "Edit unit type troll"})).not.toBeInTheDocument();
      expect(screen.getByRole("button", {name: "Cave Troll", pressed: true})).toBeInTheDocument();
    });

    it("imports one from the library and arms it", async () => {
      const library = new LibraryReader(fakeClient({"unit_types/ogre.json": {name: "Ogre", tokenImageUrl: [], powers: []}}), "c1");
      const result = renderWith(MapLevel, {zone: "forest", map: "hub", library});

      const adder = openAdder();
      fireEvent.click(adder.getByRole("button", {name: "Import from library…"}));
      const select = adder.getByRole("combobox", {name: "Library unit type"});
      await within(select).findByRole("option", {name: "ogre"});
      fireEvent.change(select, {target: {value: "unit_types/ogre.json"}});
      fireEvent.click(adder.getByRole("button", {name: "Import"}));

      await waitFor(() => expect(unitTypeKeys(result.draft)).toContain("ogre"));
      expect(screen.getByRole("button", {name: "Ogre", pressed: true})).toBeInTheDocument();
    });
  });

  it("has no back link of its own (the breadcrumbs do that)", () => {
    renderWith(MapLevel, {zone: "forest", map: "hub"});

    expect(screen.queryByText("← Back")).toBeNull();
  });
});

describe("ZoneLevel maps", () => {
  const maps = () => within(screen.getByRole("region", {name: "Map actions"}));

  it("opens a map from its row or its graph node", () => {
    const result = renderWith(ZoneLevel, {zone: "forest"});

    fireEvent.click(screen.getByRole("button", {name: "Open hub"}));
    fireEvent.doubleClick(document.querySelector('[data-node-key="hub"]'));

    expect(result.navigate.mock.calls).toEqual([[{zone: "forest", map: "hub"}], [{zone: "forest", map: "hub"}]]);
  });

  it("creates a map and opens it", () => {
    const result = renderWith(ZoneLevel, {zone: "forest"});

    fireEvent.click(maps().getByRole("button", {name: "+ New map"}));
    fireEvent.change(maps().getByRole("textbox", {name: "Map identifier"}), {target: {value: "glade"}});
    fireEvent.change(maps().getByRole("textbox", {name: "Map name"}), {target: {value: "The Glade"}});
    fireEvent.click(maps().getByRole("button", {name: "Create"}));

    expect(mapData(result.draft, "forest", "glade")).toMatchObject({identifier: "glade", name: "The Glade"});
    expect(result.navigate).toHaveBeenCalledWith({zone: "forest", map: "glade"});
  });

  it("renames a map", () => {
    const result = renderWith(ZoneLevel, {zone: "forest"});

    fireEvent.click(screen.getByRole("button", {name: "Rename hub"}));
    fireEvent.change(maps().getByRole("textbox", {name: "New identifier for hub"}), {target: {value: "plaza"}});
    fireEvent.click(maps().getByRole("button", {name: "Rename"}));

    expect(zoneData(result.draft, "forest").maps.map((m) => m.$ref)).toEqual(["./plaza/plaza.json"]);
  });

  it("explains a map identifier it can't use", () => {
    renderWith(ZoneLevel, {zone: "forest"});

    fireEvent.click(maps().getByRole("button", {name: "+ New map"}));
    fireEvent.change(maps().getByRole("textbox", {name: "Map identifier"}), {target: {value: "passage"}});
    fireEvent.click(maps().getByRole("button", {name: "Create"}));

    expect(maps().getByRole("alert")).toHaveTextContent('Map "passage" already exists');
  });

  it("deletes a map's files after confirming", () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    const result = renderWith(ZoneLevel, {zone: "forest"});

    fireEvent.click(screen.getByRole("button", {name: "Delete hub"}));

    expect(result.draft.paths("worlds/w/zones/forest/hub")).toEqual([]);
    expect(zoneData(result.draft, "forest").maps).toEqual([]);
  });
});
