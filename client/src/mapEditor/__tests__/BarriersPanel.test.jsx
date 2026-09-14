import {describe, it, expect, vi} from "vitest";
import {render, screen, fireEvent} from "@testing-library/react";
import BarriersPanel from "../BarriersPanel";

describe("BarriersPanel", () => {
  it("shows a placeholder when there are no barriers yet", () => {
    render(<BarriersPanel barriers={[]} selectedIndex={null} onSelect={() => {}} dispatch={() => {}} />);
    expect(screen.getByText(/No barriers yet/)).toBeInTheDocument();
  });

  it("lists each barrier with a type-labeled heading, and selects it on click", () => {
    const onSelect = vi.fn();
    const barriers = [
      {type: "wall", locations: [{x: 0, y: 0}, {x: 10, y: 0}]},
      {type: "circle", location: {x: 5, y: 5}, radius: 3},
    ];
    render(<BarriersPanel barriers={barriers} selectedIndex={null} onSelect={onSelect} dispatch={() => {}} />);

    expect(screen.getByText("Barrier 1: wall")).toBeInTheDocument();
    expect(screen.getByText("Barrier 2: circle")).toBeInTheDocument();

    fireEvent.click(screen.getByText("Barrier 2: circle"));
    expect(onSelect).toHaveBeenCalledWith(1);
  });

  it("highlights the selected entry", () => {
    const barriers = [{type: "wall", locations: [{x: 0, y: 0}, {x: 10, y: 0}]}];
    render(<BarriersPanel barriers={barriers} selectedIndex={0} onSelect={() => {}} dispatch={() => {}} />);

    expect(document.querySelector(".entry-block")).toHaveClass("map-entry-selected");
  });

  it("edits a wall point's coordinates, dispatching the whole updated locations array", () => {
    const dispatch = vi.fn();
    const barriers = [{type: "wall", locations: [{x: 0, y: 0}, {x: 10, y: 0}]}];
    render(<BarriersPanel barriers={barriers} selectedIndex={0} onSelect={() => {}} dispatch={dispatch} />);

    fireEvent.change(screen.getByDisplayValue("10"), {target: {value: "20"}});

    expect(dispatch).toHaveBeenCalledWith({
      type: "UPDATE_ENTRY_FIELD", section: "barriers", index: 0, field: "locations",
      value: [{x: 0, y: 0}, {x: 20, y: 0}],
    });
  });

  it("removes a wall point, but only when more than 2 remain", () => {
    const dispatch = vi.fn();
    const barriers = [{type: "wall", locations: [{x: 0, y: 0}, {x: 10, y: 0}, {x: 10, y: 10}]}];
    render(<BarriersPanel barriers={barriers} selectedIndex={0} onSelect={() => {}} dispatch={dispatch} />);

    expect(screen.getAllByRole("button", {name: "×"}).length).toBe(3);
    fireEvent.click(screen.getAllByRole("button", {name: "×"})[0]);

    expect(dispatch).toHaveBeenCalledWith({
      type: "UPDATE_ENTRY_FIELD", section: "barriers", index: 0, field: "locations",
      value: [{x: 10, y: 0}, {x: 10, y: 10}],
    });
  });

  it("hides the point-remove button once only 2 points remain (the schema minimum)", () => {
    const barriers = [{type: "wall", locations: [{x: 0, y: 0}, {x: 10, y: 0}]}];
    render(<BarriersPanel barriers={barriers} selectedIndex={0} onSelect={() => {}} dispatch={() => {}} />);

    expect(screen.queryByRole("button", {name: "×"})).not.toBeInTheDocument();
  });

  it("edits a circle's center and radius", () => {
    const dispatch = vi.fn();
    const barriers = [{type: "circle", location: {x: 5, y: 5}, radius: 3}];
    render(<BarriersPanel barriers={barriers} selectedIndex={0} onSelect={() => {}} dispatch={dispatch} />);

    fireEvent.change(screen.getByDisplayValue("3"), {target: {value: "8"}});

    expect(dispatch).toHaveBeenCalledWith({
      type: "UPDATE_ENTRY_FIELD", section: "barriers", index: 0, field: "radius", value: 8,
    });
  });

  it("removes a barrier, clearing selection if it was selected", () => {
    const dispatch = vi.fn();
    const onSelect = vi.fn();
    const barriers = [{type: "circle", location: {x: 5, y: 5}, radius: 3}];
    render(<BarriersPanel barriers={barriers} selectedIndex={0} onSelect={onSelect} dispatch={dispatch} />);

    fireEvent.click(screen.getByRole("button", {name: "Remove"}));

    expect(dispatch).toHaveBeenCalledWith({type: "REMOVE_ENTRY", section: "barriers", index: 0});
    expect(onSelect).toHaveBeenCalledWith(null);
  });
});
