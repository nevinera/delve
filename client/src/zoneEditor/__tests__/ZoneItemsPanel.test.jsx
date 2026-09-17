import {describe, it, expect} from "vitest";
import {render, screen, fireEvent} from "@testing-library/react";
import ZoneItemsPanel from "../ZoneItemsPanel";

const mapDetailsByKey = {
  "gc1-goblin-cave-entrance": {
    identifier: "cave_entrance",
    name: "Cave Entrance",
    units: [
      {unitType: "goblin_raider", itemKeys: ["sword-of-doom"]},
      {unitType: "goblin_raider", itemKeys: ["sword-of-doom", "iron-shield"]},
    ],
  },
  "gc2-goblin-cave-interior": {
    identifier: "cave_interior",
    name: "Cave Interior",
    units: [{unitType: "goblin_boss", itemKeys: ["sword-of-doom"]}],
  },
};

function zoneData(overrides = {}) {
  return {
    maps: [
      {$ref: "./gc1-goblin-cave-entrance/gc1-goblin-cave-entrance.json", referenceTo: "map"},
      {$ref: "./gc2-goblin-cave-interior/gc2-goblin-cave-interior.json", referenceTo: "map"},
    ],
    items: {},
    ...overrides,
  };
}

describe("ZoneItemsPanel", () => {
  it("shows a hint instead of a list when nothing is referenced", () => {
    render(<ZoneItemsPanel zoneData={zoneData({maps: []})} mapDetailsByKey={{}} zoneKey="goblin-cave" />);
    expect(screen.getByText("No items referenced yet.")).toBeInTheDocument();
  });

  it("counts every unit referencing an item, across every map, and links to the single map when there's only one", () => {
    render(<ZoneItemsPanel zoneData={zoneData()} mapDetailsByKey={mapDetailsByKey} zoneKey="goblin-cave" />);

    // iron-shield is only used by one unit, on one map.
    expect(screen.getByText("iron-shield")).toBeInTheDocument();
    expect(screen.getByText(/1 unit on/)).toBeInTheDocument();
    expect(screen.getByRole("link", {name: "Cave Entrance ↗"})).toHaveAttribute("href", "/build/maps/goblin-cave/gc1-goblin-cave-entrance/edit");
  });

  it("shows the across-maps count with no link when more than one map uses it", () => {
    render(<ZoneItemsPanel zoneData={zoneData()} mapDetailsByKey={mapDetailsByKey} zoneKey="goblin-cave" />);

    // sword-of-doom is used by 3 units total, across both maps.
    expect(screen.getByText("3 units across 2 maps")).toBeInTheDocument();
  });

  it("marks an item not present in the zone's own items dict as invalid", () => {
    render(<ZoneItemsPanel zoneData={zoneData({items: {"iron-shield": {}}})} mapDetailsByKey={mapDetailsByKey} zoneKey="goblin-cave" />);

    const swordRow = screen.getByText("sword-of-doom").closest(".zone-item-row");
    const shieldRow = screen.getByText("iron-shield").closest(".zone-item-row");
    expect(swordRow.querySelector(".zone-item-invalid")).not.toBeNull();
    expect(shieldRow.querySelector(".zone-item-invalid")).toBeNull();
  });

  it("collapses the list on heading click, hiding rows", () => {
    render(<ZoneItemsPanel zoneData={zoneData()} mapDetailsByKey={mapDetailsByKey} zoneKey="goblin-cave" />);

    fireEvent.click(screen.getByText(/Items \(/));

    expect(screen.queryByText("iron-shield")).not.toBeInTheDocument();
  });
});
