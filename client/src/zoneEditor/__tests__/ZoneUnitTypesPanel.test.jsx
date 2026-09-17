import {describe, it, expect} from "vitest";
import {render, screen, fireEvent} from "@testing-library/react";
import ZoneUnitTypesPanel from "../ZoneUnitTypesPanel";

const mapDetailsByKey = {
  "gc1-goblin-cave-entrance": {
    identifier: "cave_entrance",
    units: [
      {unitType: "goblin_raider", itemKeys: []},
      {unitType: "goblin_raider", itemKeys: []},
    ],
  },
  "gc2-goblin-cave-interior": {
    identifier: "cave_interior",
    units: [{unitType: "goblin_boss", itemKeys: []}],
  },
};

function zoneData(overrides = {}) {
  return {
    maps: [
      {$ref: "./gc1-goblin-cave-entrance/gc1-goblin-cave-entrance.json", referenceTo: "map"},
      {$ref: "./gc2-goblin-cave-interior/gc2-goblin-cave-interior.json", referenceTo: "map"},
    ],
    unitTypes: {},
    ...overrides,
  };
}

function expand() {
  fireEvent.click(screen.getByText(/Unit Types \(/));
}

describe("ZoneUnitTypesPanel", () => {
  it("starts collapsed", () => {
    render(<ZoneUnitTypesPanel zoneData={zoneData()} mapDetailsByKey={mapDetailsByKey} />);
    expect(screen.queryByText("goblin_raider")).not.toBeInTheDocument();
  });

  it("shows a hint instead of a list when nothing is referenced", () => {
    render(<ZoneUnitTypesPanel zoneData={zoneData({maps: []})} mapDetailsByKey={{}} />);
    expand();
    expect(screen.getByText("No unit types referenced yet.")).toBeInTheDocument();
  });

  it("counts every unit using a type, across every map", () => {
    render(<ZoneUnitTypesPanel zoneData={zoneData()} mapDetailsByKey={mapDetailsByKey} />);
    expand();

    expect(screen.getByText("goblin_raider")).toBeInTheDocument();
    expect(screen.getByText("2 units")).toBeInTheDocument();
    expect(screen.getByText("goblin_boss")).toBeInTheDocument();
    expect(screen.getByText("1 unit")).toBeInTheDocument();
  });

  it("marks a unit type not present in the zone's own unitTypes dict as invalid", () => {
    render(<ZoneUnitTypesPanel zoneData={zoneData({unitTypes: {goblin_boss: {}}})} mapDetailsByKey={mapDetailsByKey} />);
    expand();

    const raiderRow = screen.getByText("goblin_raider").closest(".zone-item-row");
    const bossRow = screen.getByText("goblin_boss").closest(".zone-item-row");
    expect(raiderRow.querySelector(".zone-item-invalid")).not.toBeNull();
    expect(bossRow.querySelector(".zone-item-invalid")).toBeNull();
  });

  it("toggles between expanded and collapsed on heading click", () => {
    render(<ZoneUnitTypesPanel zoneData={zoneData()} mapDetailsByKey={mapDetailsByKey} />);

    expand();
    expect(screen.getByText("goblin_raider")).toBeInTheDocument();

    expand();
    expect(screen.queryByText("goblin_raider")).not.toBeInTheDocument();
  });
});
