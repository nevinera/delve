import {describe, it, expect, vi} from "vitest";
import {render, screen, fireEvent} from "@testing-library/react";
import ZoneMapConnectionsPanel from "../ZoneMapConnectionsPanel";

const connections = [{identifier: "cave_mouth", type: "line"}, {identifier: "clearing_entrance", type: "point"}];

function zoneData(overrides = {}) {
  return {zoneLinks: [], entryPoints: {}, openConnections: {}, ...overrides};
}

describe("ZoneMapConnectionsPanel", () => {
  it("shows a hint instead of a list when the map has no connections", () => {
    render(<ZoneMapConnectionsPanel mapIdentifier="cave_entrance" connections={[]} zoneData={zoneData()} dispatch={vi.fn()} />);
    expect(screen.getByText("No connections on this map yet.")).toBeInTheDocument();
  });

  it("shows a hint instead of a list when the map's identifier hasn't resolved yet", () => {
    render(<ZoneMapConnectionsPanel mapIdentifier={undefined} connections={connections} zoneData={zoneData()} dispatch={vi.fn()} />);
    expect(screen.getByText("No connections on this map yet.")).toBeInTheDocument();
  });

  it("labels an unreferenced connection Open, with buttons to mark it entry point or open connection", () => {
    render(<ZoneMapConnectionsPanel mapIdentifier="cave_entrance" connections={connections} zoneData={zoneData()} dispatch={vi.fn()} />);

    expect(screen.getAllByText("Open")).toHaveLength(2);
    expect(screen.getAllByRole("button", {name: "+ Entry Point"})).toHaveLength(2);
    expect(screen.getAllByRole("button", {name: "+ Open Connection"})).toHaveLength(2);
  });

  it("dispatches SET_ENTRY_POINT with a null required key when marking a connection an entry point", () => {
    const dispatch = vi.fn();
    render(<ZoneMapConnectionsPanel mapIdentifier="cave_entrance" connections={[connections[0]]} zoneData={zoneData()} dispatch={dispatch} />);

    fireEvent.click(screen.getByRole("button", {name: "+ Entry Point"}));

    expect(dispatch).toHaveBeenCalledWith({type: "SET_ENTRY_POINT", key: "cave_entrance/cave_mouth", requiredKey: null});
  });

  it("shows an entry point's required key, editable, with a Remove button", () => {
    const dispatch = vi.fn();
    const data = zoneData({entryPoints: {"cave_entrance/cave_mouth": "iron_key"}});
    render(<ZoneMapConnectionsPanel mapIdentifier="cave_entrance" connections={[connections[0]]} zoneData={data} dispatch={dispatch} />);

    expect(screen.getByDisplayValue("iron_key")).toBeInTheDocument();

    fireEvent.change(screen.getByDisplayValue("iron_key"), {target: {value: "bronze_key"}});
    expect(dispatch).toHaveBeenCalledWith({type: "SET_ENTRY_POINT", key: "cave_entrance/cave_mouth", requiredKey: "bronze_key"});

    fireEvent.click(screen.getByRole("button", {name: "Remove"}));
    expect(dispatch).toHaveBeenCalledWith({type: "REMOVE_ENTRY_POINT", key: "cave_entrance/cave_mouth"});
  });

  it("clearing the required key field sets it back to null, not an empty string", () => {
    const dispatch = vi.fn();
    const data = zoneData({entryPoints: {"cave_entrance/cave_mouth": "iron_key"}});
    render(<ZoneMapConnectionsPanel mapIdentifier="cave_entrance" connections={[connections[0]]} zoneData={data} dispatch={dispatch} />);

    fireEvent.change(screen.getByDisplayValue("iron_key"), {target: {value: ""}});

    expect(dispatch).toHaveBeenCalledWith({type: "SET_ENTRY_POINT", key: "cave_entrance/cave_mouth", requiredKey: null});
  });

  it("shows an open connection's exposed name, editable, with a Remove button", () => {
    const dispatch = vi.fn();
    const data = zoneData({openConnections: {"cave_entrance/cave_mouth": "back_way"}});
    render(<ZoneMapConnectionsPanel mapIdentifier="cave_entrance" connections={[connections[0]]} zoneData={data} dispatch={dispatch} />);

    fireEvent.change(screen.getByDisplayValue("back_way"), {target: {value: "upper_way"}});
    expect(dispatch).toHaveBeenCalledWith({type: "SET_OPEN_CONNECTION", key: "cave_entrance/cave_mouth", name: "upper_way"});

    fireEvent.click(screen.getByRole("button", {name: "Remove"}));
    expect(dispatch).toHaveBeenCalledWith({type: "REMOVE_OPEN_CONNECTION", key: "cave_entrance/cave_mouth"});
  });

  it("shows a zoneLink's other side, oneWay checkbox, and required key, with a Remove Link button", () => {
    const dispatch = vi.fn();
    const data = zoneData({
      zoneLinks: [{connectionA: {map: "cave_entrance", connection: "cave_mouth"}, connectionB: {map: "cave_interior", connection: "entrance"}, oneWay: false, requiredKey: null}],
    });
    render(<ZoneMapConnectionsPanel mapIdentifier="cave_entrance" connections={[connections[0]]} zoneData={data} dispatch={dispatch} />);

    expect(screen.getByText("Linked to cave_interior/entrance")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("checkbox", {name: "One-way"}));
    expect(dispatch).toHaveBeenCalledWith({type: "UPDATE_ZONE_LINK", index: 0, field: "oneWay", value: true});

    fireEvent.click(screen.getByRole("button", {name: "Remove Link"}));
    expect(dispatch).toHaveBeenCalledWith({type: "REMOVE_ZONE_LINK", index: 0});
  });
});
