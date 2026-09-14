import {describe, it, expect, vi} from "vitest";
import {render, screen, fireEvent} from "@testing-library/react";
import ConnectionsPanel from "../ConnectionsPanel";

function noop() {}

const DEFAULT_PROPS = {
  selectedIndex: null, onSelect: noop, onHover: noop, tool: "select", placement: null,
  onStartAddPointConnection: noop, onStartAddLineConnection: noop, dispatch: noop,
};

function expandSection() {
  fireEvent.click(document.querySelector(".map-sidebar-section-heading"));
}

describe("ConnectionsPanel", () => {
  it("starts collapsed, showing only the section heading", () => {
    const connections = [{identifier: "a", type: "point", position: {x: 0, y: 0, angle: 0}, fuzzRadius: 2, fuzzAngle: 90}];
    render(<ConnectionsPanel {...DEFAULT_PROPS} connections={connections} />);

    expect(screen.getByText("Connections (1)")).toBeInTheDocument();
    expect(screen.queryByText(/Connection 1:/)).not.toBeInTheDocument();
  });

  it("shows a placeholder when there are no connections yet, once expanded", () => {
    render(<ConnectionsPanel {...DEFAULT_PROPS} connections={[]} />);
    expandSection();
    expect(screen.getByText(/No connections yet/)).toBeInTheDocument();
  });

  it("lists a point connection with its position, facing, and fuzz fields", () => {
    const connections = [{identifier: "landing_site", type: "point", position: {x: 12, y: 8, angle: 270}, fuzzRadius: 2, fuzzAngle: 90}];
    render(<ConnectionsPanel {...DEFAULT_PROPS} connections={connections} />);
    expandSection();

    expect(screen.getByText(/Connection 1: point/)).toBeInTheDocument();
    expect(screen.getByText("12, 8")).toBeInTheDocument(); // position - display only, set by dragging the map
    expect(screen.getByDisplayValue("landing_site")).toBeInTheDocument();
    expect(screen.getByDisplayValue("270")).toBeInTheDocument(); // facing
    expect(screen.getByDisplayValue("2")).toBeInTheDocument(); // fuzzRadius
    expect(screen.getByDisplayValue("90")).toBeInTheDocument(); // fuzzAngle
  });

  it("lists a line connection with its start/end, but no typed position fields", () => {
    const connections = [{identifier: "north_door", type: "line", start: {x: 8, y: 20}, end: {x: 12, y: 20}}];
    render(<ConnectionsPanel {...DEFAULT_PROPS} connections={connections} />);
    expandSection();

    expect(screen.getByText(/Connection 1: line/)).toBeInTheDocument();
    expect(screen.getByText("8, 20")).toBeInTheDocument();
    expect(screen.getByText("12, 20")).toBeInTheDocument();
  });

  it("edits a connection's identifier", () => {
    const dispatch = vi.fn();
    const connections = [{identifier: "old_name", type: "line", start: {x: 0, y: 0}, end: {x: 1, y: 1}}];
    render(<ConnectionsPanel {...DEFAULT_PROPS} connections={connections} dispatch={dispatch} />);
    expandSection();

    fireEvent.change(screen.getByDisplayValue("old_name"), {target: {value: "new_name"}});

    expect(dispatch).toHaveBeenCalledWith({
      type: "UPDATE_ENTRY_FIELD", section: "connections", index: 0, field: "identifier", value: "new_name",
    });
  });

  it("edits a point connection's facing angle and fuzz fields", () => {
    const dispatch = vi.fn();
    const connections = [{identifier: "a", type: "point", position: {x: 0, y: 0, angle: 0}, fuzzRadius: 2, fuzzAngle: 90}];
    render(<ConnectionsPanel {...DEFAULT_PROPS} connections={connections} dispatch={dispatch} />);
    expandSection();

    fireEvent.change(screen.getByDisplayValue("2"), {target: {value: "5"}});
    expect(dispatch).toHaveBeenCalledWith({
      type: "UPDATE_ENTRY_FIELD", section: "connections", index: 0, field: "fuzzRadius", value: 5,
    });
  });

  it("selects an entry on click, highlighting it", () => {
    const onSelect = vi.fn();
    const connections = [{identifier: "a", type: "line", start: {x: 0, y: 0}, end: {x: 1, y: 1}}];
    render(<ConnectionsPanel {...DEFAULT_PROPS} connections={connections} onSelect={onSelect} />);
    expandSection();

    fireEvent.click(screen.getByText(/Connection 1: line/));
    expect(onSelect).toHaveBeenCalledWith(0);
  });

  it("calls onHover on mouse enter/leave of an entry", () => {
    const onHover = vi.fn();
    const connections = [{identifier: "a", type: "line", start: {x: 0, y: 0}, end: {x: 1, y: 1}}];
    render(<ConnectionsPanel {...DEFAULT_PROPS} connections={connections} onHover={onHover} />);
    expandSection();

    const entry = document.querySelector(".entry-block");
    fireEvent.mouseEnter(entry);
    expect(onHover).toHaveBeenCalledWith(0);
    fireEvent.mouseLeave(entry);
    expect(onHover).toHaveBeenCalledWith(null);
  });

  it("removes a connection, clearing selection if it was selected", () => {
    const dispatch = vi.fn();
    const onSelect = vi.fn();
    const connections = [{identifier: "a", type: "line", start: {x: 0, y: 0}, end: {x: 1, y: 1}}];
    render(<ConnectionsPanel {...DEFAULT_PROPS} connections={connections} selectedIndex={0} onSelect={onSelect} dispatch={dispatch} />);
    expandSection();

    fireEvent.click(screen.getByRole("button", {name: "Remove"}));

    expect(dispatch).toHaveBeenCalledWith({type: "REMOVE_ENTRY", section: "connections", index: 0});
    expect(onSelect).toHaveBeenCalledWith(null);
  });

  it("starts add-point-connection / add-line-connection mode without dispatching anything itself", () => {
    const dispatch = vi.fn();
    const onStartAddPointConnection = vi.fn();
    const onStartAddLineConnection = vi.fn();
    render(
      <ConnectionsPanel
        {...DEFAULT_PROPS} connections={[]} dispatch={dispatch}
        onStartAddPointConnection={onStartAddPointConnection} onStartAddLineConnection={onStartAddLineConnection}
      />
    );
    expandSection();

    fireEvent.click(screen.getByRole("button", {name: "+ Add Point Connection"}));
    expect(onStartAddPointConnection).toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", {name: "+ Add Line Connection"}));
    expect(onStartAddLineConnection).toHaveBeenCalled();

    expect(dispatch).not.toHaveBeenCalled();
  });

  it("disables both add buttons while any tool is active, or while barrier placement is active", () => {
    const {rerender} = render(<ConnectionsPanel {...DEFAULT_PROPS} connections={[]} tool="add-circle" />);
    expandSection();
    expect(screen.getByRole("button", {name: "+ Add Point Connection"})).toBeDisabled();
    expect(screen.getByRole("button", {name: "+ Add Line Connection"})).toBeDisabled();

    rerender(<ConnectionsPanel {...DEFAULT_PROPS} connections={[]} tool="select" placement={{barrierIndex: 0, insertIndex: 0}} />);
    expect(screen.getByRole("button", {name: "+ Add Point Connection"})).toBeDisabled();
    expect(screen.getByRole("button", {name: "+ Add Line Connection"})).toBeDisabled();

    rerender(<ConnectionsPanel {...DEFAULT_PROPS} connections={[]} tool="select" placement={null} />);
    expect(screen.getByRole("button", {name: "+ Add Point Connection"})).not.toBeDisabled();
    expect(screen.getByRole("button", {name: "+ Add Line Connection"})).not.toBeDisabled();
  });
});
