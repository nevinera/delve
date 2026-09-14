import {describe, it, expect, vi} from "vitest";
import {render, screen, fireEvent} from "@testing-library/react";
import BarriersPanel from "../BarriersPanel";

function noop() {}

const DEFAULT_PROPS = {
  selectedIndex: null, onSelect: noop, onHover: noop, onHoverPoint: noop,
  placement: null, onStartPlacement: noop, onStartPointEdit: noop, tool: "select", onStartAddCircle: noop,
  canPlaceOnMap: true, otherPlacementActive: false, dispatch: noop,
};

// The "Barriers" section itself starts collapsed - expand it before
// asserting on anything inside the list.
function expandSection() {
  fireEvent.click(document.querySelector(".map-sidebar-section-heading"));
}

function pills() {
  return document.querySelectorAll(".map-point-pill");
}

describe("BarriersPanel", () => {
  it("starts collapsed, showing only the section heading", () => {
    const barriers = [{type: "wall", locations: [{x: 0, y: 0}, {x: 10, y: 0}]}];
    render(<BarriersPanel {...DEFAULT_PROPS} barriers={barriers} />);

    expect(screen.getByText("Barriers (1)")).toBeInTheDocument();
    expect(screen.queryByText(/Barrier 1:/)).not.toBeInTheDocument();
  });

  it("shows a placeholder when there are no barriers yet, once expanded", () => {
    render(<BarriersPanel {...DEFAULT_PROPS} barriers={[]} />);
    expandSection();
    expect(screen.getByText(/No barriers yet/)).toBeInTheDocument();
  });

  it("lists each barrier with a type-labeled heading and its fields, all at once (no per-entry collapse)", () => {
    const onSelect = vi.fn();
    const barriers = [
      {type: "wall", locations: [{x: 0, y: 0}, {x: 10, y: 0}]},
      {type: "circle", location: {x: 5, y: 5}, radius: 3},
    ];
    render(<BarriersPanel {...DEFAULT_PROPS} barriers={barriers} onSelect={onSelect} />);
    expandSection();

    expect(screen.getByText(/Barrier 1: wall/)).toBeInTheDocument();
    expect(screen.getByText(/Barrier 2: circle/)).toBeInTheDocument();
    // Both barriers' fields show without needing to select either one.
    expect(pills().length).toBe(2);
    expect(screen.getByDisplayValue("3")).toBeInTheDocument(); // the circle's radius field

    fireEvent.click(screen.getByText(/Barrier 2: circle/));
    expect(onSelect).toHaveBeenCalledWith(1);
  });

  it("deselects an entry on a second click of its heading (fields stay visible either way)", () => {
    const onSelect = vi.fn();
    const barriers = [{type: "wall", locations: [{x: 0, y: 0}, {x: 10, y: 0}]}];
    render(<BarriersPanel {...DEFAULT_PROPS} barriers={barriers} selectedIndex={0} onSelect={onSelect} />);
    expandSection();

    fireEvent.click(screen.getByText(/Barrier 1: wall/));
    expect(onSelect).toHaveBeenCalledWith(null);
    expect(document.querySelector(".map-point-pills")).toBeInTheDocument();
  });

  it("highlights the selected entry", () => {
    const barriers = [{type: "wall", locations: [{x: 0, y: 0}, {x: 10, y: 0}]}];
    render(<BarriersPanel {...DEFAULT_PROPS} barriers={barriers} selectedIndex={0} />);
    expandSection();

    expect(document.querySelector(".entry-block")).toHaveClass("map-entry-selected");
  });

  it("calls onHover on mouse enter/leave of an entry", () => {
    const onHover = vi.fn();
    const barriers = [{type: "wall", locations: [{x: 0, y: 0}, {x: 10, y: 0}]}];
    render(<BarriersPanel {...DEFAULT_PROPS} barriers={barriers} onHover={onHover} />);
    expandSection();

    const entry = document.querySelector(".entry-block");
    fireEvent.mouseEnter(entry);
    expect(onHover).toHaveBeenCalledWith(0);

    fireEvent.mouseLeave(entry);
    expect(onHover).toHaveBeenCalledWith(null);
  });

  it("renders each point as a pill showing its rounded coordinates, whether or not the barrier is selected", () => {
    const barriers = [{type: "wall", locations: [{x: 0, y: 0}, {x: 10.34, y: 0}]}];
    render(<BarriersPanel {...DEFAULT_PROPS} barriers={barriers} />);
    expandSection();

    expect(pills().length).toBe(2);
    expect(pills()[1]).toHaveTextContent("10.3, 0");
  });

  it("calls onHoverPoint with {barrierIndex, pointIndex} on a pill's mouse enter/leave", () => {
    const onHoverPoint = vi.fn();
    const barriers = [{type: "wall", locations: [{x: 0, y: 0}, {x: 10, y: 0}]}];
    render(<BarriersPanel {...DEFAULT_PROPS} barriers={barriers} onHoverPoint={onHoverPoint} />);
    expandSection();

    fireEvent.mouseEnter(pills()[1]);
    expect(onHoverPoint).toHaveBeenCalledWith({barrierIndex: 0, pointIndex: 1});

    fireEvent.mouseLeave(pills()[1]);
    expect(onHoverPoint).toHaveBeenCalledWith(null);
  });

  it("removes a wall point via its pill's × button, but only when more than 2 remain", () => {
    const dispatch = vi.fn();
    const barriers = [{type: "wall", locations: [{x: 0, y: 0}, {x: 10, y: 0}, {x: 10, y: 10}]}];
    render(<BarriersPanel {...DEFAULT_PROPS} barriers={barriers} dispatch={dispatch} />);
    expandSection();

    expect(screen.getAllByRole("button", {name: "×"}).length).toBe(3);
    fireEvent.click(screen.getAllByRole("button", {name: "×"})[0]);

    expect(dispatch).toHaveBeenCalledWith({
      type: "UPDATE_ENTRY_FIELD", section: "barriers", index: 0, field: "locations",
      value: [{x: 10, y: 0}, {x: 10, y: 10}],
    });
  });

  it("clears point hover when removing a point (regression: a removed pill's mouseleave never fires, leaving a stale hoveredPoint index)", () => {
    const onHoverPoint = vi.fn();
    const barriers = [{type: "wall", locations: [{x: 0, y: 0}, {x: 10, y: 0}, {x: 10, y: 10}]}];
    render(<BarriersPanel {...DEFAULT_PROPS} barriers={barriers} onHoverPoint={onHoverPoint} />);
    expandSection();

    fireEvent.click(screen.getAllByRole("button", {name: "×"})[0]);

    expect(onHoverPoint).toHaveBeenCalledWith(null);
  });

  it("does not deselect the entry when removing a point (regression: the button click shouldn't bubble to the heading toggle)", () => {
    const onSelect = vi.fn();
    const barriers = [{type: "wall", locations: [{x: 0, y: 0}, {x: 10, y: 0}, {x: 10, y: 10}]}];
    render(<BarriersPanel {...DEFAULT_PROPS} barriers={barriers} selectedIndex={0} onSelect={onSelect} />);
    expandSection();

    fireEvent.click(screen.getAllByRole("button", {name: "×"})[0]);

    expect(onSelect).not.toHaveBeenCalled();
  });

  it("hides a pill's × button once only 2 points remain (the schema minimum)", () => {
    const barriers = [{type: "wall", locations: [{x: 0, y: 0}, {x: 10, y: 0}]}];
    render(<BarriersPanel {...DEFAULT_PROPS} barriers={barriers} />);
    expandSection();

    expect(screen.queryByRole("button", {name: "×"})).not.toBeInTheDocument();
  });

  it("starts placement with the right insertIndex from a '+' button, and does not select the entry", () => {
    const onStartPlacement = vi.fn();
    const onSelect = vi.fn();
    const barriers = [{type: "wall", locations: [{x: 0, y: 0}, {x: 10, y: 0}]}];
    render(<BarriersPanel {...DEFAULT_PROPS} barriers={barriers} onSelect={onSelect} onStartPlacement={onStartPlacement} />);
    expandSection();

    // Pill "+" buttons: [before point 1, after point 1, after point 2].
    const plusButtons = document.querySelectorAll(".map-point-plus");
    expect(plusButtons.length).toBe(3);

    fireEvent.click(plusButtons[1]);

    expect(onStartPlacement).toHaveBeenCalledWith(0, 1);
    expect(onSelect).not.toHaveBeenCalled();
  });

  it("shows exactly one '+' button for a wall with no points yet", () => {
    const barriers = [{type: "wall", locations: []}];
    render(<BarriersPanel {...DEFAULT_PROPS} barriers={barriers} />);
    expandSection();

    expect(document.querySelectorAll(".map-point-plus").length).toBe(1);
  });

  it("shows a pending pill at the current insertIndex while placing, and disables this barrier's '+' buttons", () => {
    const barriers = [{type: "wall", locations: [{x: 0, y: 0}, {x: 10, y: 0}]}];
    render(<BarriersPanel {...DEFAULT_PROPS} barriers={barriers} placement={{barrierIndex: 0, pointIndex: 1}} />);
    expandSection();

    expect(document.querySelector(".map-point-pill-pending")).toBeInTheDocument();
    document.querySelectorAll(".map-point-plus").forEach((button) => expect(button).toBeDisabled());
  });

  it("does not show a pending pill for a different barrier's placement", () => {
    const barriers = [{type: "wall", locations: [{x: 0, y: 0}, {x: 10, y: 0}]}];
    render(<BarriersPanel {...DEFAULT_PROPS} barriers={barriers} placement={{barrierIndex: 1, pointIndex: 0}} />);
    expandSection();

    expect(document.querySelector(".map-point-pill-pending")).not.toBeInTheDocument();
  });

  it("clicking an existing pill starts edit placement for that point, not insert", () => {
    const onStartPointEdit = vi.fn();
    const barriers = [{type: "wall", locations: [{x: 0, y: 0}, {x: 10, y: 0}]}];
    render(<BarriersPanel {...DEFAULT_PROPS} barriers={barriers} onStartPointEdit={onStartPointEdit} />);
    expandSection();

    fireEvent.click(pills()[1]);

    expect(onStartPointEdit).toHaveBeenCalledWith(0, 1);
  });

  it("shows the edited pill as pending ('…'), keeping the others normal, and disables all '+' buttons for this barrier", () => {
    const barriers = [{type: "wall", locations: [{x: 0, y: 0}, {x: 10, y: 0}]}];
    render(<BarriersPanel {...DEFAULT_PROPS} barriers={barriers} placement={{barrierIndex: 0, pointIndex: 1, mode: "edit"}} />);
    expandSection();

    expect(pills().length).toBe(2);
    expect(pills()[0]).toHaveTextContent("0, 0");
    expect(pills()[1]).toHaveTextContent("…");
    document.querySelectorAll(".map-point-plus").forEach((button) => expect(button).toBeDisabled());
  });

  it("does not show an edit-pending pill for a different barrier's edit placement", () => {
    const barriers = [{type: "wall", locations: [{x: 0, y: 0}, {x: 10, y: 0}]}];
    render(<BarriersPanel {...DEFAULT_PROPS} barriers={barriers} placement={{barrierIndex: 1, pointIndex: 0, mode: "edit"}} />);
    expandSection();

    expect(pills().length).toBe(2);
    expect(pills()[0]).toHaveTextContent("0, 0");
    expect(pills()[1]).toHaveTextContent("10, 0");
  });

  it("adds a new blank wall, selecting it", () => {
    const dispatch = vi.fn();
    const onSelect = vi.fn();
    const barriers = [{type: "wall", locations: [{x: 0, y: 0}, {x: 10, y: 0}]}];
    render(<BarriersPanel {...DEFAULT_PROPS} barriers={barriers} onSelect={onSelect} dispatch={dispatch} />);
    expandSection();

    fireEvent.click(screen.getByRole("button", {name: "+ Add Wall"}));

    expect(dispatch).toHaveBeenCalledWith({type: "ADD_ENTRY", section: "barriers", entry: {type: "wall", locations: []}});
    expect(onSelect).toHaveBeenCalledWith(1); // the new entry lands at the current length
  });

  it("starts add-circle mode via '+ Add Circle', without dispatching anything itself", () => {
    const dispatch = vi.fn();
    const onStartAddCircle = vi.fn();
    const barriers = [];
    render(<BarriersPanel {...DEFAULT_PROPS} barriers={barriers} dispatch={dispatch} onStartAddCircle={onStartAddCircle} />);
    expandSection();

    fireEvent.click(screen.getByRole("button", {name: "+ Add Circle"}));

    expect(onStartAddCircle).toHaveBeenCalled();
    expect(dispatch).not.toHaveBeenCalled();
  });

  it("disables '+ Add Circle' while add-circle is already active, or while placement is active", () => {
    const barriers = [];
    const {rerender} = render(<BarriersPanel {...DEFAULT_PROPS} barriers={barriers} tool="add-circle" />);
    expandSection();
    expect(screen.getByRole("button", {name: "+ Add Circle"})).toBeDisabled();

    rerender(<BarriersPanel {...DEFAULT_PROPS} barriers={barriers} tool="select" placement={{barrierIndex: 0, pointIndex: 0}} />);
    expect(screen.getByRole("button", {name: "+ Add Circle"})).toBeDisabled();
  });

  it("disables '+ Add Circle' while a connection field is being placed elsewhere", () => {
    const barriers = [];
    render(<BarriersPanel {...DEFAULT_PROPS} barriers={barriers} otherPlacementActive />);
    expandSection();

    expect(screen.getByRole("button", {name: "+ Add Circle"})).toBeDisabled();
  });

  it("disables '+ Add Circle' and shows a hint when the map has no feetDimensions yet", () => {
    const barriers = [];
    render(<BarriersPanel {...DEFAULT_PROPS} barriers={barriers} canPlaceOnMap={false} />);
    expandSection();

    expect(screen.getByRole("button", {name: "+ Add Circle"})).toBeDisabled();
    expect(screen.getByText(/Set feet dimensions/)).toBeInTheDocument();
  });

  it("shows a pending placeholder entry while add-circle is armed, in place of the empty-list message", () => {
    render(<BarriersPanel {...DEFAULT_PROPS} barriers={[]} tool="add-circle" />);
    expandSection();

    expect(screen.getByText(/Barrier 1: circle/)).toBeInTheDocument();
    expect(screen.getByText("(placing…)")).toBeInTheDocument();
    expect(screen.queryByText(/No barriers yet/)).not.toBeInTheDocument();
  });

  it("shows no pending placeholder while the tool is 'select'", () => {
    render(<BarriersPanel {...DEFAULT_PROPS} barriers={[]} tool="select" />);
    expandSection();

    expect(screen.queryByText("(placing…)")).not.toBeInTheDocument();
  });

  it("edits a circle's center and radius", () => {
    const dispatch = vi.fn();
    const barriers = [{type: "circle", location: {x: 5, y: 5}, radius: 3}];
    render(<BarriersPanel {...DEFAULT_PROPS} barriers={barriers} dispatch={dispatch} />);
    expandSection();

    fireEvent.change(screen.getByDisplayValue("3"), {target: {value: "8"}});

    expect(dispatch).toHaveBeenCalledWith({
      type: "UPDATE_ENTRY_FIELD", section: "barriers", index: 0, field: "radius", value: 8,
    });
  });

  it("removes a barrier, clearing selection if it was selected", () => {
    const dispatch = vi.fn();
    const onSelect = vi.fn();
    const barriers = [{type: "circle", location: {x: 5, y: 5}, radius: 3}];
    render(<BarriersPanel {...DEFAULT_PROPS} barriers={barriers} selectedIndex={0} onSelect={onSelect} dispatch={dispatch} />);
    expandSection();

    fireEvent.click(screen.getByRole("button", {name: "Remove"}));

    expect(dispatch).toHaveBeenCalledWith({type: "REMOVE_ENTRY", section: "barriers", index: 0});
    expect(onSelect).toHaveBeenCalledWith(null);
  });
});
