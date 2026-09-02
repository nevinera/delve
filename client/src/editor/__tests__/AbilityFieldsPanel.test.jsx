import {describe, it, expect, vi} from "vitest";
import {render, screen, fireEvent} from "@testing-library/react";
import AbilityFieldsPanel from "../AbilityFieldsPanel";

const ability = {
  name: "Firebolt",
  castTime: null,
  globalCooldown: 1.0,
  speed: 60.0,
  maxRange: 40.0,
  graphicEffects: [{sourceURL: "../graphics/animations/firebolt.sprites2x2.png", duration: 0.5, when: "immediate"}],
  effects: [{type: "harm", affects: "bTarget", amount: [89.0, 140.0], tags: ["magic", "ranged"]}],
};

describe("AbilityFieldsPanel", () => {
  it("renders read-only fields as plain text", () => {
    render(<AbilityFieldsPanel ability={ability} dispatch={() => {}} />);
    expect(screen.getByText("Firebolt")).toBeInTheDocument();
    expect(screen.getByText("Global cooldown")).toBeInTheDocument();
  });

  it("renders speed and maxRange as editable number inputs", () => {
    render(<AbilityFieldsPanel ability={ability} dispatch={() => {}} />);
    expect(screen.getByDisplayValue("60")).toBeInTheDocument();
    expect(screen.getByDisplayValue("40")).toBeInTheDocument();
  });

  it("dispatches SET_FIELD when the speed input changes", () => {
    const dispatch = vi.fn();
    render(<AbilityFieldsPanel ability={ability} dispatch={dispatch} />);
    fireEvent.change(screen.getByDisplayValue("60"), {target: {value: "75"}});
    expect(dispatch).toHaveBeenCalledWith({type: "SET_FIELD", field: "speed", value: 75});
  });

  it("dispatches SET_FIELD when the maxRange input changes", () => {
    const dispatch = vi.fn();
    render(<AbilityFieldsPanel ability={ability} dispatch={dispatch} />);
    fireEvent.change(screen.getByDisplayValue("40"), {target: {value: "50"}});
    expect(dispatch).toHaveBeenCalledWith({type: "SET_FIELD", field: "maxRange", value: 50});
  });

  it("renders collapsible sections for each array field with per-entry summaries", () => {
    render(<AbilityFieldsPanel ability={ability} dispatch={() => {}} />);
    expect(screen.getByText("Graphic effects (1)")).toBeInTheDocument();
    expect(screen.getByText("Effects (1)")).toBeInTheDocument();
    expect(screen.getByText("1. harm")).toBeInTheDocument();
    expect(screen.getByText("magic, ranged")).toBeInTheDocument();
  });
});
