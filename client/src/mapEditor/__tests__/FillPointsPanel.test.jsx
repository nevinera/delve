import {describe, it, expect, vi} from "vitest";
import {render, screen, fireEvent} from "@testing-library/react";
import FillPointsPanel from "../FillPointsPanel";

const DEFAULT_PROPS = {fillPoints: [], tool: "select", canAdd: true, onStartAdd: () => {}, onHover: () => {}, dispatch: () => {}};

function expand() {
  fireEvent.click(document.querySelector(".map-sidebar-section-heading"));
}

describe("FillPointsPanel", () => {
  it("starts collapsed, showing only its heading", () => {
    render(<FillPointsPanel {...DEFAULT_PROPS} fillPoints={[{x: 1, y: 2}]} />);
    expect(screen.getByText("Fill Points (1)")).toBeInTheDocument();
    expect(screen.queryByText("+ Add Fill Point")).not.toBeInTheDocument();
  });

  it("arms the fill-point tool from its button", () => {
    const onStartAdd = vi.fn();
    render(<FillPointsPanel {...DEFAULT_PROPS} onStartAdd={onStartAdd} />);
    expand();
    fireEvent.click(screen.getByText("+ Add Fill Point"));
    expect(onStartAdd).toHaveBeenCalled();
  });

  it("lists each fill point, and removes one from its ×", () => {
    const dispatch = vi.fn();
    render(<FillPointsPanel {...DEFAULT_PROPS} fillPoints={[{x: 1.25, y: 2}, {x: 3, y: 4}]} dispatch={dispatch} />);
    expand();
    expect(screen.getByText("(1.3, 2)")).toBeInTheDocument();
    fireEvent.click(screen.getByLabelText("Remove fill point 2"));
    expect(dispatch).toHaveBeenCalledWith({type: "REMOVE_ENTRY", section: "fillPoints", index: 1});
  });

  it("can't be armed while something else is", () => {
    render(<FillPointsPanel {...DEFAULT_PROPS} canAdd={false} />);
    expand();
    expect(screen.getByText("+ Add Fill Point")).toBeDisabled();
  });
});
