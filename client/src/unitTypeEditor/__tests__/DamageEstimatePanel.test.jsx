import {describe, it, expect, vi} from "vitest";
import {render, screen, fireEvent} from "@testing-library/react";
import DamageEstimatePanel from "../DamageEstimatePanel";

const estimate = {
  results: [
    {gearingPlan: "offense", elevation: -10, dps: 12.34, ttdSeconds: 10.0},
    {gearingPlan: "offense", elevation: 0, dps: 8.0, ttdSeconds: null},
    {gearingPlan: "defense", elevation: -10, dps: 5.0, ttdSeconds: 30.5},
    {gearingPlan: "defense", elevation: 0, dps: 2.0, ttdSeconds: 60.0},
  ],
};

describe("DamageEstimatePanel", () => {
  it("shows just the button before any estimate", () => {
    render(<DamageEstimatePanel estimate={null} estimating={false} error={null} onEstimate={() => {}} />);

    expect(screen.getByRole("button", {name: "Estimate damage"})).toBeEnabled();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
  });

  it("calls onEstimate when clicked", () => {
    const onEstimate = vi.fn();
    render(<DamageEstimatePanel estimate={null} estimating={false} error={null} onEstimate={onEstimate} />);

    fireEvent.click(screen.getByRole("button", {name: "Estimate damage"}));

    expect(onEstimate).toHaveBeenCalled();
  });

  it("disables the button while estimating", () => {
    render(<DamageEstimatePanel estimate={null} estimating={true} error={null} onEstimate={() => {}} />);

    expect(screen.getByRole("button", {name: "Estimating…"})).toBeDisabled();
  });

  it("shows an error message", () => {
    render(<DamageEstimatePanel estimate={null} estimating={false} error="game server unavailable" onEstimate={() => {}} />);

    expect(screen.getByText("game server unavailable")).toBeInTheDocument();
  });

  it("renders a plan x elevation matrix with dps and time-to-kill per cell", () => {
    render(<DamageEstimatePanel estimate={estimate} estimating={false} error={null} onEstimate={() => {}} />);

    expect(screen.getByRole("columnheader", {name: "-10"})).toBeInTheDocument();
    expect(screen.getByRole("columnheader", {name: "+0"})).toBeInTheDocument();
    expect(screen.getByRole("rowheader", {name: "Offense gear (squishy)"})).toBeInTheDocument();
    expect(screen.getByRole("rowheader", {name: "Defense gear (tank)"})).toBeInTheDocument();
    expect(screen.getByText("12.3 dps")).toBeInTheDocument();
    expect(screen.getByText("30.5s to kill")).toBeInTheDocument();
    expect(screen.getByText("no damage")).toBeInTheDocument();
  });

  it("assumes an untagged unit is open", () => {
    render(<DamageEstimatePanel estimate={null} estimating={false} error={null} onEstimate={() => {}} unitType={{maxHP: 300, dps: 8}} />);

    expect(screen.getByText(/Targets for open, solo/)).toBeInTheDocument();
    expect(screen.getByText("300 HP (this unit: 300)")).toHaveClass("target-on");
  });

  it("shows the unit's HP and dps against its tags' targets", () => {
    render(<DamageEstimatePanel estimate={null} estimating={false} error={null} onEstimate={() => {}} unitType={{tags: ["open", "pair"], maxHP: 195, dps: 10}} />);

    expect(screen.getByText("195 HP (this unit: 195)")).toHaveClass("target-on");
    expect(screen.getByText("5.1 dps (this unit: 10)")).toHaveClass("target-off");
  });

  it("shows each cell's time-to-kill target", () => {
    render(<DamageEstimatePanel estimate={estimate} estimating={false} error={null} onEstimate={() => {}} unitType={{tags: ["open"]}} />);

    expect(screen.getAllByText("target 60s")).toHaveLength(1); // offense, ee 0
    expect(screen.getByText("target 46s")).toBeInTheDocument(); // offense, ee -10: 60 / 1.3
    expect(screen.getByText("30.5s to kill").closest("td")).toHaveClass("target-off"); // defense -10, target 138s
  });
});

