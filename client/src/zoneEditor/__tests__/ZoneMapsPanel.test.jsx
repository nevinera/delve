import {describe, it, expect, vi} from "vitest";
import {render, screen, fireEvent} from "@testing-library/react";
import ZoneMapsPanel from "../ZoneMapsPanel";

const availableMapKeys = ["gc1-goblin-cave-entrance", "gc2-goblin-cave-interior"];

const mapDetailsByKey = {
  "gc1-goblin-cave-entrance": {identifier: "cave_entrance", name: "Cave Entrance", connections: [{identifier: "cave_mouth", type: "line"}], thumbnailUrl: "data:image/webp;base64,AAA="},
  "gc2-goblin-cave-interior": {identifier: "cave_interior", name: "Cave Interior", connections: [{identifier: "entrance", type: "line"}], thumbnailUrl: null},
};

function zoneData(maps = []) {
  return {maps, zoneLinks: [], entryPoints: {}, openConnections: {}};
}

function renderPanel(props) {
  return render(
    <ZoneMapsPanel
      dispatch={vi.fn()}
      availableMapKeys={availableMapKeys}
      mapDetailsByKey={mapDetailsByKey}
      onAddMap={vi.fn()}
      zoneKey="goblin-cave"
      newMapUrl="/build/maps/new"
      onRefresh={vi.fn()}
      refreshStatus=""
      {...props}
    />
  );
}

describe("ZoneMapsPanel", () => {
  it("renders a referenced map's resolved name and thumbnail image", () => {
    const maps = [{$ref: "./gc1-goblin-cave-entrance/gc1-goblin-cave-entrance.json", referenceTo: "map"}];
    renderPanel({zoneData: zoneData(maps)});

    expect(screen.getByText("Cave Entrance")).toBeInTheDocument();
    expect(screen.getByRole("img")).toHaveAttribute("src", "data:image/webp;base64,AAA=");
  });

  it("shows a placeholder instead of an image when the map has no thumbnail", () => {
    const maps = [{$ref: "./gc2-goblin-cave-interior/gc2-goblin-cave-interior.json", referenceTo: "map"}];
    renderPanel({zoneData: zoneData(maps)});

    expect(screen.getByText("Cave Interior")).toBeInTheDocument();
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
  });

  it("shows the raw ref key while a referenced map's details haven't resolved yet", () => {
    const maps = [{$ref: "./gc3-unknown/gc3-unknown.json", referenceTo: "map"}];
    renderPanel({zoneData: zoneData(maps), availableMapKeys: [], mapDetailsByKey: {}});

    expect(screen.getByText("gc3-unknown")).toBeInTheDocument();
  });

  it("dispatches REMOVE_MAP with the resolved map identifier when Remove is clicked", () => {
    const maps = [{$ref: "./gc1-goblin-cave-entrance/gc1-goblin-cave-entrance.json", referenceTo: "map"}];
    const dispatch = vi.fn();
    renderPanel({zoneData: zoneData(maps), dispatch});

    fireEvent.click(screen.getByRole("button", {name: "Remove"}));

    expect(dispatch).toHaveBeenCalledWith({type: "REMOVE_MAP", index: 0, mapIdentifier: "cave_entrance"});
  });

  it("offers only the not-yet-referenced maps in the add dropdown, as bare keys", () => {
    const maps = [{$ref: "./gc1-goblin-cave-entrance/gc1-goblin-cave-entrance.json", referenceTo: "map"}];
    renderPanel({zoneData: zoneData(maps)});

    expect(screen.queryByRole("option", {name: "gc1-goblin-cave-entrance"})).not.toBeInTheDocument();
    expect(screen.getByRole("option", {name: "gc2-goblin-cave-interior"})).toBeInTheDocument();
  });

  it("hides the add dropdown entirely when nothing is available to add", () => {
    const maps = [
      {$ref: "./gc1-goblin-cave-entrance/gc1-goblin-cave-entrance.json", referenceTo: "map"},
      {$ref: "./gc2-goblin-cave-interior/gc2-goblin-cave-interior.json", referenceTo: "map"},
    ];
    renderPanel({zoneData: zoneData(maps)});

    expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
  });

  it("adds a $ref entry and lazily fetches the picked map's detail on Add", () => {
    const dispatch = vi.fn();
    const onAddMap = vi.fn();
    renderPanel({zoneData: zoneData([]), dispatch, onAddMap});

    fireEvent.change(screen.getByRole("combobox"), {target: {value: "gc2-goblin-cave-interior"}});
    fireEvent.click(screen.getByRole("button", {name: "Add"}));

    expect(dispatch).toHaveBeenCalledWith({
      type: "ADD_ENTRY",
      section: "maps",
      entry: {$ref: "./gc2-goblin-cave-interior/gc2-goblin-cave-interior.json", referenceTo: "map"},
    });
    expect(onAddMap).toHaveBeenCalledWith("gc2-goblin-cave-interior");
  });

  it("builds the Create Map link with the zone key as a prefix", () => {
    renderPanel({zoneData: zoneData([]), availableMapKeys: [], mapDetailsByKey: {}});

    expect(screen.getByRole("link", {name: "Create Map ↗"})).toHaveAttribute("href", "/build/maps/new?prefix=goblin-cave%2F");
  });

  it("calls onRefresh and shows the refresh status", () => {
    const onRefresh = vi.fn();
    renderPanel({zoneData: zoneData([]), availableMapKeys: [], mapDetailsByKey: {}, onRefresh, refreshStatus: "Refreshed."});

    fireEvent.click(screen.getByRole("button", {name: "Refresh"}));

    expect(onRefresh).toHaveBeenCalled();
    expect(screen.getByText("Refreshed.")).toBeInTheDocument();
  });

  it("collapses the list on heading click, hiding rows and controls", () => {
    const maps = [{$ref: "./gc1-goblin-cave-entrance/gc1-goblin-cave-entrance.json", referenceTo: "map"}];
    renderPanel({zoneData: zoneData(maps)});

    fireEvent.click(screen.getByText(/Maps \(/));

    expect(screen.queryByText("Cave Entrance")).not.toBeInTheDocument();
  });

  it("expanding a map row reveals its own connections list", () => {
    const maps = [{$ref: "./gc1-goblin-cave-entrance/gc1-goblin-cave-entrance.json", referenceTo: "map"}];
    renderPanel({zoneData: zoneData(maps)});

    expect(screen.queryByText("cave_mouth")).not.toBeInTheDocument();

    fireEvent.click(screen.getByText("Cave Entrance"));

    expect(screen.getByText("cave_mouth")).toBeInTheDocument();
  });

  it("offers cross-map linking: expanding both rows lets one map's open connection link to another's", () => {
    const maps = [
      {$ref: "./gc1-goblin-cave-entrance/gc1-goblin-cave-entrance.json", referenceTo: "map"},
      {$ref: "./gc2-goblin-cave-interior/gc2-goblin-cave-interior.json", referenceTo: "map"},
    ];
    const dispatch = vi.fn();
    renderPanel({zoneData: zoneData(maps), dispatch});

    fireEvent.click(screen.getByText("Cave Entrance"));
    fireEvent.change(screen.getByRole("combobox"), {target: {value: "cave_interior/entrance"}});

    expect(dispatch).toHaveBeenCalledWith({
      type: "ADD_ZONE_LINK",
      connectionA: {map: "cave_entrance", connection: "cave_mouth"},
      connectionB: {map: "cave_interior", connection: "entrance"},
    });
  });

  it("removing a map row does not toggle its own expanded state", () => {
    const maps = [{$ref: "./gc1-goblin-cave-entrance/gc1-goblin-cave-entrance.json", referenceTo: "map"}];
    const dispatch = vi.fn();
    renderPanel({zoneData: zoneData(maps), dispatch});

    fireEvent.click(screen.getByRole("button", {name: "Remove"}));

    expect(screen.queryByText("cave_mouth")).not.toBeInTheDocument();
  });
});
