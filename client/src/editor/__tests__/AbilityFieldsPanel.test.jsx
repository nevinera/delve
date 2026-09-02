import {describe, it, expect, vi} from "vitest";
import {render, screen, fireEvent} from "@testing-library/react";
import AbilityFieldsPanel from "../AbilityFieldsPanel";

const ability = {
  name: "Firebolt",
  iconURL: "../graphics/icons/firebolt.svg",
  castTime: null,
  globalCooldown: 1.0,
  speed: 60.0,
  maxRange: 40.0,
  graphicEffects: [{sourceURL: "../graphics/animations/firebolt.sprites2x2.png", duration: 0.5, when: "immediate"}],
  effects: [{type: "harm", affects: "bTarget", amount: [89.0, 140.0], tags: ["magic", "ranged"]}],
};

describe("AbilityFieldsPanel", () => {
  it("renders name as read-only plain text, not an input", () => {
    render(<AbilityFieldsPanel ability={ability} dispatch={() => {}} />);
    expect(screen.getByText("Firebolt")).toBeInTheDocument();
    expect(screen.queryByDisplayValue("Firebolt")).not.toBeInTheDocument();
  });

  it("renders every recognized field even when the ability lacks it, e.g. cooldown", () => {
    render(<AbilityFieldsPanel ability={ability} dispatch={() => {}} />);
    expect(screen.getByText("Cooldown")).toBeInTheDocument();
  });

  it("renders iconURL/castTime/globalCooldown/cooldown/maxRange/speed as editable inputs", () => {
    render(<AbilityFieldsPanel ability={ability} dispatch={() => {}} />);
    expect(screen.getByDisplayValue("../graphics/icons/firebolt.svg")).toBeInTheDocument();
    expect(screen.getByDisplayValue("1")).toBeInTheDocument(); // globalCooldown
    expect(screen.getByDisplayValue("60")).toBeInTheDocument(); // speed
    expect(screen.getByDisplayValue("40")).toBeInTheDocument(); // maxRange
  });

  it("dispatches SET_FIELD with a string when an editable text field changes", () => {
    const dispatch = vi.fn();
    render(<AbilityFieldsPanel ability={ability} dispatch={dispatch} />);
    fireEvent.change(screen.getByDisplayValue("../graphics/icons/firebolt.svg"), {target: {value: "../graphics/icons/new.svg"}});
    expect(dispatch).toHaveBeenCalledWith({type: "SET_FIELD", field: "iconURL", value: "../graphics/icons/new.svg"});
  });

  it("dispatches SET_FIELD with a parsed number when an editable number field changes", () => {
    const dispatch = vi.fn();
    render(<AbilityFieldsPanel ability={ability} dispatch={dispatch} />);
    fireEvent.change(screen.getByDisplayValue("60"), {target: {value: "75"}});
    expect(dispatch).toHaveBeenCalledWith({type: "SET_FIELD", field: "speed", value: 75});
  });

  it("dispatches SET_FIELD with null when a number field is cleared", () => {
    const dispatch = vi.fn();
    render(<AbilityFieldsPanel ability={ability} dispatch={dispatch} />);
    fireEvent.change(screen.getByDisplayValue("40"), {target: {value: ""}});
    expect(dispatch).toHaveBeenCalledWith({type: "SET_FIELD", field: "maxRange", value: null});
  });

  it("renders collapsible sections for each array field with per-entry summaries", () => {
    render(<AbilityFieldsPanel ability={ability} dispatch={() => {}} />);
    expect(screen.getByText("Graphic effects (1)")).toBeInTheDocument();
    expect(screen.getByText("Effects (1)")).toBeInTheDocument();
    expect(screen.getByText("1. harm")).toBeInTheDocument();
    expect(screen.getByText("magic, ranged")).toBeInTheDocument();
  });
});
