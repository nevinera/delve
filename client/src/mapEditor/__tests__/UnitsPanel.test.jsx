import {describe, it, expect, vi} from "vitest";
import {render, screen, fireEvent} from "@testing-library/react";
import UnitsPanel from "../UnitsPanel";

function noop() {}

const AVAILABLE_UNIT_TYPE_KEYS = ["goblin-raider", "slime"];
const UNIT_TYPE_DETAILS = {
  "goblin-raider": {name: "Goblin Raider", tokenImageUrl: "data:image/webp;base64,AAAA"},
  slime: {name: "Slime", tokenImageUrl: null},
};

const DEFAULT_PROPS = {
  selectedIndex: null, onSelect: noop, onHover: noop,
  availableUnitTypeKeys: AVAILABLE_UNIT_TYPE_KEYS, unitTypeDetails: UNIT_TYPE_DETAILS, onChooseUnitType: noop,
  newUnitTypeUrl: "/build/unit_types/new", onRefreshUnitTypes: noop, refreshStatus: "",
  tool: "select", placement: null, canPlaceOnMap: true, pendingUnitType: null, onStartAddUnit: noop,
  unitPlacement: null, onStartUnitPlacement: noop, dispatch: noop,
};

function expandSection() {
  fireEvent.click(document.querySelector(".map-sidebar-section-heading"));
}

describe("UnitsPanel", () => {
  it("starts collapsed, showing only the section heading", () => {
    const units = [{unitType: "goblin-raider", identifier: "a", position: {x: 0, y: 0, angle: 0}, hostility: "hostile", currentHpFraction: 1, movement: {type: "still"}}];
    render(<UnitsPanel {...DEFAULT_PROPS} units={units} />);

    expect(screen.getByText("Units (1)")).toBeInTheDocument();
    expect(screen.queryByText(/Unit 1:/)).not.toBeInTheDocument();
  });

  it("shows a placeholder when there are no units yet, once expanded", () => {
    render(<UnitsPanel {...DEFAULT_PROPS} units={[]} />);
    expandSection();
    expect(screen.getByText(/No units yet/)).toBeInTheDocument();
  });

  it("lists the unit type dropdown with real available unit types", () => {
    render(<UnitsPanel {...DEFAULT_PROPS} units={[]} />);
    expandSection();

    expect(screen.getByRole("option", {name: "Goblin Raider"})).toBeInTheDocument();
    expect(screen.getByRole("option", {name: "Slime"})).toBeInTheDocument();
  });

  it("disables '+ Add Unit' until a unit type is chosen", () => {
    render(<UnitsPanel {...DEFAULT_PROPS} units={[]} />);
    expandSection();

    expect(screen.getByRole("button", {name: "+ Add Unit"})).toBeDisabled();
    fireEvent.change(screen.getByRole("combobox"), {target: {value: "goblin-raider"}});
    expect(screen.getByRole("button", {name: "+ Add Unit"})).not.toBeDisabled();
  });

  it("starts add-unit mode with the chosen unit type, without dispatching anything itself", () => {
    const dispatch = vi.fn();
    const onStartAddUnit = vi.fn();
    render(<UnitsPanel {...DEFAULT_PROPS} units={[]} dispatch={dispatch} onStartAddUnit={onStartAddUnit} />);
    expandSection();

    fireEvent.change(screen.getByRole("combobox"), {target: {value: "slime"}});
    fireEvent.click(screen.getByRole("button", {name: "+ Add Unit"}));

    expect(onStartAddUnit).toHaveBeenCalledWith("slime");
    expect(dispatch).not.toHaveBeenCalled();
  });

  it("disables '+ Add Unit' while any tool/placement is active, or with no feetDimensions", () => {
    const {rerender} = render(<UnitsPanel {...DEFAULT_PROPS} units={[]} tool="add-circle" />);
    expandSection();
    fireEvent.change(screen.getByRole("combobox"), {target: {value: "slime"}});
    expect(screen.getByRole("button", {name: "+ Add Unit"})).toBeDisabled();

    rerender(<UnitsPanel {...DEFAULT_PROPS} units={[]} tool="select" placement={{barrierIndex: 0, pointIndex: 0}} />);
    expect(screen.getByRole("button", {name: "+ Add Unit"})).toBeDisabled();

    rerender(<UnitsPanel {...DEFAULT_PROPS} units={[]} tool="select" placement={null} canPlaceOnMap={false} />);
    expect(screen.getByRole("button", {name: "+ Add Unit"})).toBeDisabled();
    expect(screen.getByText(/Set feet dimensions/)).toBeInTheDocument();
  });

  it("shows a pending placeholder entry while add-unit is armed, labeled with the pending unit type", () => {
    render(<UnitsPanel {...DEFAULT_PROPS} units={[]} tool="add-unit" pendingUnitType="goblin-raider" />);
    expandSection();

    expect(screen.getByText(/Unit 1: Goblin Raider/)).toBeInTheDocument();
    expect(screen.getByText("(placing…)")).toBeInTheDocument();
    expect(screen.queryByText(/No units yet/)).not.toBeInTheDocument();
  });

  it("lists each unit with its type label, identifier field, and HP slider", () => {
    const units = [{unitType: "goblin-raider", identifier: "goblin_a", position: {x: 0, y: 0, angle: 0}, hostility: "hostile", currentHpFraction: 0.5, movement: {type: "still"}}];
    render(<UnitsPanel {...DEFAULT_PROPS} units={units} />);
    expandSection();

    expect(screen.getByText(/Unit 1: Goblin Raider/)).toBeInTheDocument();
    expect(screen.getByDisplayValue("goblin_a")).toBeInTheDocument();
    expect(screen.getByText("50%")).toBeInTheDocument();
  });

  it("shows a unit's real token image in its own panel beside the editing form", () => {
    const units = [{unitType: "goblin-raider", identifier: "a", position: {x: 0, y: 0, angle: 0}, hostility: "hostile", currentHpFraction: 1, movement: {type: "still"}}];
    render(<UnitsPanel {...DEFAULT_PROPS} units={units} />);
    expandSection();

    const body = document.querySelector(".map-unit-body");
    expect(body).toBeInTheDocument();
    expect(body.querySelector("table")).toBeInTheDocument();
    const panel = body.querySelector(".map-unit-token-panel");
    expect(panel).toBeInTheDocument();
    expect(panel.querySelector("img.map-unit-token-thumb")).toHaveAttribute("src", "data:image/webp;base64,AAAA");
  });

  it("falls back to a plain hostility-colored dot when the unit type has no tokenImageUrl", () => {
    const units = [{unitType: "slime", identifier: "a", position: {x: 0, y: 0, angle: 0}, hostility: "hostile", currentHpFraction: 1, movement: {type: "still"}}];
    render(<UnitsPanel {...DEFAULT_PROPS} units={units} />);
    expandSection();

    expect(document.querySelector(".map-unit-token-panel img")).not.toBeInTheDocument();
    expect(document.querySelector(".map-unit-token-panel .map-unit-token-thumb-fallback")).toBeInTheDocument();
  });

  it("shows a unit's position as a clickable coordinate pill that starts position placement", () => {
    const onStartUnitPlacement = vi.fn();
    const units = [{unitType: "goblin-raider", identifier: "a", position: {x: 12.34, y: 8, angle: 0}, hostility: "hostile", currentHpFraction: 1, movement: {type: "still"}}];
    render(<UnitsPanel {...DEFAULT_PROPS} units={units} onStartUnitPlacement={onStartUnitPlacement} />);
    expandSection();

    fireEvent.click(screen.getByRole("button", {name: "12.3, 8"}));

    expect(onStartUnitPlacement).toHaveBeenCalledWith(0);
  });

  it("shows a pending '…' on the position pill while placing, and disables it", () => {
    const units = [{unitType: "goblin-raider", identifier: "a", position: {x: 0, y: 0, angle: 0}, hostility: "hostile", currentHpFraction: 1, movement: {type: "still"}}];
    render(<UnitsPanel {...DEFAULT_PROPS} units={units} unitPlacement={{unitIndex: 0}} />);
    expandSection();

    const pending = screen.getByRole("button", {name: "…"});
    expect(pending).toBeDisabled();
    expect(screen.queryByRole("button", {name: "0, 0"})).not.toBeInTheDocument();
  });

  it("disables '+ Add Unit' while a unit's position is being placed", () => {
    render(<UnitsPanel {...DEFAULT_PROPS} units={[]} unitPlacement={{unitIndex: 0}} />);
    expandSection();

    fireEvent.change(screen.getByRole("combobox"), {target: {value: "slime"}});
    expect(screen.getByRole("button", {name: "+ Add Unit"})).toBeDisabled();
  });

  it("falls back to the raw unitType key when it's not in availableUnitTypes", () => {
    const units = [{unitType: "unknown-type", identifier: "a", position: {x: 0, y: 0, angle: 0}, hostility: "hostile", currentHpFraction: 1, movement: {type: "still"}}];
    render(<UnitsPanel {...DEFAULT_PROPS} units={units} />);
    expandSection();

    expect(screen.getByText(/Unit 1: unknown-type/)).toBeInTheDocument();
  });

  it("edits a unit's type via the dropdown", () => {
    const dispatch = vi.fn();
    const units = [{unitType: "goblin-raider", identifier: "a", position: {x: 0, y: 0, angle: 0}, hostility: "hostile", currentHpFraction: 1, movement: {type: "still"}}];
    render(<UnitsPanel {...DEFAULT_PROPS} units={units} dispatch={dispatch} />);
    expandSection();

    const selects = screen.getAllByRole("combobox");
    const typeSelect = selects.find((el) => el.closest(".entry-block"));
    fireEvent.change(typeSelect, {target: {value: "slime"}});

    expect(dispatch).toHaveBeenCalledWith({
      type: "UPDATE_ENTRY_FIELD", section: "units", index: 0, field: "unitType", value: "slime",
    });
  });

  it("shows a unit's current type as a distinctly-labeled extra option when it's not a real unit type, without losing it", () => {
    const units = [{unitType: "goblin", identifier: "a", position: {x: 0, y: 0, angle: 0}, hostility: "hostile", currentHpFraction: 1, movement: {type: "still"}}];
    render(<UnitsPanel {...DEFAULT_PROPS} units={units} />);
    expandSection();

    expect(screen.getByRole("option", {name: "goblin (not a real unit type)"})).toBeInTheDocument();
    const selects = screen.getAllByRole("combobox");
    const typeSelect = selects.find((el) => el.closest(".entry-block"));
    expect(typeSelect).toHaveValue("goblin");
  });

  it("edits a unit's identifier", () => {
    const dispatch = vi.fn();
    const units = [{unitType: "goblin-raider", identifier: "old", position: {x: 0, y: 0, angle: 0}, hostility: "hostile", currentHpFraction: 1, movement: {type: "still"}}];
    render(<UnitsPanel {...DEFAULT_PROPS} units={units} dispatch={dispatch} />);
    expandSection();

    fireEvent.change(screen.getByDisplayValue("old"), {target: {value: "new_id"}});

    expect(dispatch).toHaveBeenCalledWith({
      type: "UPDATE_ENTRY_FIELD", section: "units", index: 0, field: "identifier", value: "new_id",
    });
  });

  it("edits a unit's HP via the slider", () => {
    const dispatch = vi.fn();
    const units = [{unitType: "goblin-raider", identifier: "a", position: {x: 0, y: 0, angle: 0}, hostility: "hostile", currentHpFraction: 1, movement: {type: "still"}}];
    render(<UnitsPanel {...DEFAULT_PROPS} units={units} dispatch={dispatch} />);
    expandSection();

    fireEvent.change(screen.getByRole("slider"), {target: {value: "0.25"}});

    expect(dispatch).toHaveBeenCalledWith({
      type: "UPDATE_ENTRY_FIELD", section: "units", index: 0, field: "currentHpFraction", value: 0.25,
    });
  });

  it("selects an entry on click, highlighting it", () => {
    const onSelect = vi.fn();
    const units = [{unitType: "goblin-raider", identifier: "a", position: {x: 0, y: 0, angle: 0}, hostility: "hostile", currentHpFraction: 1, movement: {type: "still"}}];
    render(<UnitsPanel {...DEFAULT_PROPS} units={units} onSelect={onSelect} />);
    expandSection();

    fireEvent.click(screen.getByText(/Unit 1:/));
    expect(onSelect).toHaveBeenCalledWith(0);
  });

  it("calls onHover on mouse enter/leave of an entry", () => {
    const onHover = vi.fn();
    const units = [{unitType: "goblin-raider", identifier: "a", position: {x: 0, y: 0, angle: 0}, hostility: "hostile", currentHpFraction: 1, movement: {type: "still"}}];
    render(<UnitsPanel {...DEFAULT_PROPS} units={units} onHover={onHover} />);
    expandSection();

    const entry = document.querySelector(".entry-block");
    fireEvent.mouseEnter(entry);
    expect(onHover).toHaveBeenCalledWith(0);
    fireEvent.mouseLeave(entry);
    expect(onHover).toHaveBeenCalledWith(null);
  });

  it("removes a unit, clearing selection if it was selected", () => {
    const dispatch = vi.fn();
    const onSelect = vi.fn();
    const units = [{unitType: "goblin-raider", identifier: "a", position: {x: 0, y: 0, angle: 0}, hostility: "hostile", currentHpFraction: 1, movement: {type: "still"}}];
    render(<UnitsPanel {...DEFAULT_PROPS} units={units} selectedIndex={0} onSelect={onSelect} dispatch={dispatch} />);
    expandSection();

    fireEvent.click(screen.getByRole("button", {name: "Remove"}));

    expect(dispatch).toHaveBeenCalledWith({type: "REMOVE_ENTRY", section: "units", index: 0});
    expect(onSelect).toHaveBeenCalledWith(null);
  });

  it("calls onRefreshUnitTypes from the Refresh button, and shows refreshStatus", () => {
    const onRefreshUnitTypes = vi.fn();
    render(<UnitsPanel {...DEFAULT_PROPS} units={[]} onRefreshUnitTypes={onRefreshUnitTypes} refreshStatus="Refreshed." />);
    expandSection();

    fireEvent.click(screen.getByRole("button", {name: "Refresh"}));

    expect(onRefreshUnitTypes).toHaveBeenCalled();
    expect(screen.getByText("Refreshed.")).toBeInTheDocument();
  });

  it("links '+ New Unit Type' to newUnitTypeUrl, opening in a new tab", () => {
    render(<UnitsPanel {...DEFAULT_PROPS} units={[]} newUnitTypeUrl="/build/unit_types/new" />);
    expandSection();

    const link = screen.getByRole("link", {name: "+ New Unit Type"});
    expect(link).toHaveAttribute("href", "/build/unit_types/new");
    expect(link).toHaveAttribute("target", "_blank");
  });
});
