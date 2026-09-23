import {describe, it, expect, vi} from "vitest";
import {render, screen, fireEvent} from "@testing-library/react";
import ClassDpsEstimatePanel from "../ClassDpsEstimatePanel";

const estimate = {
  results: [
    {durationSeconds: 60, elevation: -20, elevationLabel: "trainee", dps: 6.5},
    {durationSeconds: 60, elevation: 0, elevationLabel: "heroic", dps: 12.3},
    {durationSeconds: 300, elevation: -20, elevationLabel: "trainee", dps: 6.1},
    {durationSeconds: 300, elevation: 0, elevationLabel: "heroic", dps: 12.9},
  ],
};

function renderPanel(props = {}) {
  return render(
    <ClassDpsEstimatePanel
      strategy={[]}
      onStrategyChange={() => {}}
      powerNames={["Punch", "Firebolt"]}
      estimate={null}
      estimating={false}
      error={null}
      onEstimate={() => {}}
      {...props}
    />
  );
}

describe("ClassDpsEstimatePanel", () => {
  it("shows just the button and strategy editor before any estimate", () => {
    renderPanel();

    expect(screen.getByRole("button", {name: "Estimate DPS"})).toBeEnabled();
    expect(screen.getAllByRole("table")).toHaveLength(1); // strategy table always present, no results table yet
    expect(screen.queryByText(/dps$/)).not.toBeInTheDocument();
  });

  it("calls onEstimate when the button is clicked", () => {
    const onEstimate = vi.fn();
    renderPanel({onEstimate});

    fireEvent.click(screen.getByRole("button", {name: "Estimate DPS"}));

    expect(onEstimate).toHaveBeenCalled();
  });

  it("disables the button while estimating", () => {
    renderPanel({estimating: true});

    expect(screen.getByRole("button", {name: "Estimating…"})).toBeDisabled();
  });

  it("shows an error message", () => {
    renderPanel({error: "game server unavailable"});

    expect(screen.getByText("game server unavailable")).toBeInTheDocument();
  });

  it("renders an elevation x duration matrix", () => {
    renderPanel({estimate});

    expect(screen.getByRole("columnheader", {name: "1m"})).toBeInTheDocument();
    expect(screen.getByRole("columnheader", {name: "5m"})).toBeInTheDocument();
    expect(screen.getByRole("rowheader", {name: "trainee"})).toBeInTheDocument();
    expect(screen.getByRole("rowheader", {name: "heroic"})).toBeInTheDocument();
    expect(screen.getByText("12.3 dps")).toBeInTheDocument();
    expect(screen.getByText("6.1 dps")).toBeInTheDocument();
  });

  it("adds a strategy entry", () => {
    const onStrategyChange = vi.fn();
    renderPanel({onStrategyChange});

    fireEvent.click(screen.getByRole("button", {name: "+ Add power"}));

    expect(onStrategyChange).toHaveBeenCalledWith([{power: "", condition: null}]);
  });

  it("updates a strategy entry's power", () => {
    const onStrategyChange = vi.fn();
    renderPanel({strategy: [{power: "", condition: null}], onStrategyChange});

    fireEvent.change(screen.getByDisplayValue("(choose a power)"), {target: {value: "Punch"}});

    expect(onStrategyChange).toHaveBeenCalledWith([{power: "Punch", condition: null}]);
  });

  it("adds a condition to a strategy entry and reveals the on/status fields", () => {
    const onStrategyChange = vi.fn();
    renderPanel({strategy: [{power: "Punch", condition: null}], onStrategyChange});

    fireEvent.change(screen.getByDisplayValue("always"), {target: {value: "missingStatus"}});

    expect(onStrategyChange).toHaveBeenCalledWith([{power: "Punch", condition: {type: "missingStatus", on: "target", status: ""}}]);
  });

  it("edits the condition's status field once a condition is set", () => {
    const onStrategyChange = vi.fn();
    renderPanel({
      strategy: [{power: "Moonfire", condition: {type: "missingStatus", on: "target", status: ""}}],
      onStrategyChange,
    });

    fireEvent.change(screen.getByPlaceholderText("status name"), {target: {value: "Moonfire"}});

    expect(onStrategyChange).toHaveBeenCalledWith([{power: "Moonfire", condition: {type: "missingStatus", on: "target", status: "Moonfire"}}]);
  });

  it("removes a strategy entry", () => {
    const onStrategyChange = vi.fn();
    renderPanel({strategy: [{power: "Punch", condition: null}], onStrategyChange});

    fireEvent.click(screen.getByRole("button", {name: "Remove"}));

    expect(onStrategyChange).toHaveBeenCalledWith([]);
  });

  it("reorders strategy entries with the move buttons", () => {
    const onStrategyChange = vi.fn();
    renderPanel({
      strategy: [{power: "A", condition: null}, {power: "B", condition: null}],
      onStrategyChange,
    });

    fireEvent.click(screen.getAllByRole("button", {name: "↓"})[0]);

    expect(onStrategyChange).toHaveBeenCalledWith([{power: "B", condition: null}, {power: "A", condition: null}]);
  });
});
