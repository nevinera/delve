import {describe, it, expect, vi} from "vitest";
import {render, screen, fireEvent} from "@testing-library/react";

vi.mock("../../cellMap/cache", () => ({
  cachedCellMapImage: vi.fn(async () => ({
    image: {width: 4, height: 3},
    source: "rendered",
    timings: {scene: 10, sprites: 2, paint: 30, thread: "worker"},
    stats: {width: 4, height: 3, crowns: 5, patches: 1, tufts: 2},
    stored: Promise.resolve({encode: 7}),
  })),
}));

import CellEditor from "../CellEditor";
import {cachedCellMapImage} from "../../cellMap/cache";

HTMLCanvasElement.prototype.getContext = () => new Proxy({}, {get: () => () => {}});

describe("CellEditor", () => {
  it("renders the chosen example with the chosen seed", async () => {
    render(<CellEditor backUrl="/build" />);
    expect(await screen.findByText(/Rendered \(worker\) in \d+ms/)).toBeInTheDocument();
    expect(await screen.findByText(/scene 10ms · sprites 2ms · paint 30ms · display \d+ms · encode \(after\) 7ms/)).toBeInTheDocument();
    expect(screen.getByText("4×3px, 5 crowns, 1 patches, 2 tufts")).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Map"), {target: {value: "forest-edge"}});
    fireEvent.change(screen.getByRole("spinbutton"), {target: {value: "42"}});

    expect(cachedCellMapImage).toHaveBeenLastCalledWith(expect.objectContaining({name: "Forest edge", seed: 42}), {pixelsPerFoot: 10});
  });

  it("offers the stress test map", () => {
    render(<CellEditor />);
    expect(screen.getByRole("option", {name: "Stress test (200×200)"})).toBeInTheDocument();
  });

  it("shows a legend for the cells overlay", () => {
    render(<CellEditor />);
    expect(screen.queryByText("trees")).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Overlay"), {target: {value: "cells"}});
    expect(screen.getByText("trees")).toBeInTheDocument();
    expect(screen.getByText("meadow")).toBeInTheDocument();
  });
});
