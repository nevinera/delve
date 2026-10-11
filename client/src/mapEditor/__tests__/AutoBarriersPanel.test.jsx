import {describe, it, expect, vi} from "vitest";
import {render, screen, fireEvent} from "@testing-library/react";
import AutoBarriersPanel from "../AutoBarriersPanel";

describe("AutoBarriersPanel", () => {
  const wall = {type: "wall", locations: [{x: 0, y: 0}, {x: 10, y: 0}]};

  it("runs only with no barriers yet, and says what it added", () => {
    const onAutoBarriers = vi.fn(() => ({added: {walls: 3, circles: 2, segments: 120, fillPoints: 1, connections: 2, places: 4}, openEdge: true, error: null}));
    const {rerender} = render(<AutoBarriersPanel barriers={[wall]} busy={false} onAutoBarriers={onAutoBarriers} />);
    expect(screen.getByRole("button", {name: "Auto Barriers"})).toBeDisabled();
    rerender(<AutoBarriersPanel barriers={[]} busy={true} onAutoBarriers={onAutoBarriers} />);
    expect(screen.getByRole("button", {name: "Auto Barriers"})).toBeDisabled();
    rerender(<AutoBarriersPanel barriers={[]} busy={false} onAutoBarriers={onAutoBarriers} />);
    fireEvent.click(screen.getByRole("button", {name: "Auto Barriers"}));
    expect(onAutoBarriers).toHaveBeenCalled();
    expect(screen.getByText(/Added 3 walls, 2 circles \(120 segments\), 1 fill points, 2 connections and 4 places\. Open ground reaches the map's edge/)).toBeInTheDocument();
  });

  it("says why it couldn't make any", () => {
    render(<AutoBarriersPanel barriers={[]} busy={false} onAutoBarriers={() => ({error: "Too many segments."})} />);
    fireEvent.click(screen.getByRole("button", {name: "Auto Barriers"}));
    expect(screen.getByText("Too many segments.")).toBeInTheDocument();
  });
});
