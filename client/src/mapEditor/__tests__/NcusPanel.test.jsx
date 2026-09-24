import {describe, it, expect, vi} from "vitest";
import {render, screen, fireEvent} from "@testing-library/react";
import NcusPanel from "../NcusPanel";

const GRIZZLE = {
  identifier: "grizzle", name: "Grizzle", tokenImageUrl: "./g.webp", tokenRadius: 2,
  position: {x: 1, y: 2, angle: 0}, movement: {type: "still"}, dialogue: ["Psst."],
};

function renderPanel(props = {}) {
  const dispatch = vi.fn();
  const utils = render(
    <NcusPanel
      ncus={[GRIZZLE]} tool="select" canPlaceOnMap onStartAddNcu={vi.fn()} onHover={vi.fn()} onSelect={vi.fn()}
      onStartUnitPlacement={vi.fn()} onUpdateMovement={vi.fn()} dispatch={dispatch}
      {...props}
    />
  );
  return {dispatch, ...utils};
}

function openRow() {
  fireEvent.click(screen.getByText(/^NCUs/));
  fireEvent.click(screen.getByText("Grizzle"));
}

describe("NcusPanel", () => {
  it("lists NCUs by name with a dialogue marker, collapsed", () => {
    renderPanel();
    fireEvent.click(screen.getByText("NCUs (1)"));
    expect(screen.getByText("Grizzle")).toBeInTheDocument();
    expect(screen.getByTitle("Has dialogue")).toBeInTheDocument();
    expect(screen.queryByLabelText("Name")).not.toBeInTheDocument();
  });

  it("arms add-ncu from its button, disabled while another tool is busy", () => {
    const onStartAddNcu = vi.fn();
    const {rerender} = renderPanel({onStartAddNcu});
    fireEvent.click(screen.getByText(/^NCUs/));
    fireEvent.click(screen.getByText("+ Add NCU"));
    expect(onStartAddNcu).toHaveBeenCalled();

    rerender(<NcusPanel ncus={[]} tool="add-circle" canPlaceOnMap onStartAddNcu={onStartAddNcu} dispatch={vi.fn()} />);
    expect(screen.getByText("+ Add NCU")).toBeDisabled();
  });

  it("edits inline fields into the ncus section", () => {
    const {dispatch} = renderPanel();
    openRow();

    fireEvent.change(screen.getByLabelText("Name"), {target: {value: "Grizzle the Bold"}});
    expect(dispatch).toHaveBeenLastCalledWith({type: "UPDATE_ENTRY_FIELD", section: "ncus", index: 0, field: "name", value: "Grizzle the Bold"});

    fireEvent.change(screen.getByLabelText("Token Radius"), {target: {value: "3"}});
    expect(dispatch).toHaveBeenLastCalledWith({type: "UPDATE_ENTRY_FIELD", section: "ncus", index: 0, field: "tokenRadius", value: 3});

    fireEvent.change(screen.getByLabelText("Dialogue line 1"), {target: {value: "Hey."}});
    expect(dispatch).toHaveBeenLastCalledWith({type: "UPDATE_ENTRY_FIELD", section: "ncus", index: 0, field: "dialogue", value: ["Hey."]});
  });

  it("switches movement type within the ncus section", () => {
    const {dispatch} = renderPanel();
    openRow();

    fireEvent.change(screen.getByDisplayValue("Still"), {target: {value: "wander"}});
    expect(dispatch).toHaveBeenLastCalledWith(expect.objectContaining({section: "ncus", index: 0, field: "movement"}));
  });

  it("only shows its own section's placement as pending", () => {
    renderPanel({unitPlacement: {unitIndex: 0, section: "units"}});
    openRow();
    expect(screen.getByText("1, 2")).toBeInTheDocument();
  });

  it("removes an NCU", () => {
    const {dispatch} = renderPanel();
    openRow();
    fireEvent.click(screen.getByText("Remove"));
    expect(dispatch).toHaveBeenCalledWith({type: "REMOVE_ENTRY", section: "ncus", index: 0});
  });
});
