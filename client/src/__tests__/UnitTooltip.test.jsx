import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { UnitTooltip } from "../App";

const GOBLIN = {
  zone_unit_identifier: "goblin_a",
  unit_type_identifier: "goblin",
  health: 45,
  max_health: 60,
  status: "engaged",
  tagged_by: null,
};

describe("UnitTooltip", () => {
  it("renders nothing when no unit is given", () => {
    render(<UnitTooltip unit={null} selfUnitId="self-1" />);
    expect(document.body.textContent).toBe("");
  });

  it("shows the formatted name, HP, and combat status", () => {
    render(<UnitTooltip unit={GOBLIN} selfUnitId="self-1" />);
    expect(screen.getByText("Goblin")).toBeInTheDocument();
    expect(screen.getByText(/45\/60/)).toBeInTheDocument();
    expect(screen.getByText("Engaged")).toBeInTheDocument();
  });

  it("omits the tag line when the unit is untagged", () => {
    render(<UnitTooltip unit={GOBLIN} selfUnitId="self-1" />);
    expect(screen.queryByText(/Tagged/)).not.toBeInTheDocument();
  });

  it("shows 'Tagged by you' when tagged_by matches selfUnitId", () => {
    render(<UnitTooltip unit={{ ...GOBLIN, tagged_by: "self-1" }} selfUnitId="self-1" />);
    expect(screen.getByText("Tagged by you")).toBeInTheDocument();
  });

  it("shows 'Tagged by another player' when tagged_by is someone else", () => {
    render(<UnitTooltip unit={{ ...GOBLIN, tagged_by: "other-unit" }} selfUnitId="self-1" />);
    expect(screen.getByText("Tagged by another player")).toBeInTheDocument();
  });

  it("falls back to the raw status string for an unrecognized status", () => {
    render(<UnitTooltip unit={{ ...GOBLIN, status: "mystery" }} selfUnitId="self-1" />);
    expect(screen.getByText("mystery")).toBeInTheDocument();
  });

  it("formats a player's name from zone_unit_identifier", () => {
    const player = {
      zone_unit_identifier: "player:Bob",
      unit_type_identifier: "",
      health: 100,
      max_health: 100,
      status: "idle",
      tagged_by: null,
    };
    render(<UnitTooltip unit={player} selfUnitId="self-1" />);
    expect(screen.getByText("Bob")).toBeInTheDocument();
  });

  it("hides HP and status for a noncombat unit, offering talk when it has dialogue", () => {
    render(<UnitTooltip unit={{ ...GOBLIN, noncombat: true }} selfUnitId="self-1" talkable />);
    expect(screen.queryByText(/45\/60/)).not.toBeInTheDocument();
    expect(screen.getByText("Right-click to talk")).toBeInTheDocument();
  });

  it("offers no talk prompt for a noncombat unit without dialogue", () => {
    render(<UnitTooltip unit={{ ...GOBLIN, noncombat: true }} selfUnitId="self-1" />);
    expect(screen.queryByText("Right-click to talk")).not.toBeInTheDocument();
  });
});
