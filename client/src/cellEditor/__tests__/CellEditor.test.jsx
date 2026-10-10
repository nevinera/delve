import {describe, it, expect, vi} from "vitest";
import {render, screen, fireEvent} from "@testing-library/react";

vi.mock("../../cellMap/render", async (importOriginal) => ({
  ...(await importOriginal()),
  cachedCellMapImage: vi.fn(async () => ({image: {width: 4, height: 3}, source: "rendered"})),
}));

import CellEditor from "../CellEditor";
import {cachedCellMapImage} from "../../cellMap/render";

HTMLCanvasElement.prototype.getContext = () => new Proxy({}, {get: () => () => {}});

describe("CellEditor", () => {
  it("renders the chosen example with the chosen seed", async () => {
    render(<CellEditor backUrl="/build" />);
    expect(await screen.findByText(/Rendered in \d+ms \(4×3\)/)).toBeInTheDocument();

    fireEvent.change(screen.getByRole("combobox"), {target: {value: "forest-edge"}});
    fireEvent.change(screen.getByRole("spinbutton"), {target: {value: "42"}});

    expect(cachedCellMapImage).toHaveBeenLastCalledWith(expect.objectContaining({name: "Forest edge", seed: 42}), {pixelsPerFoot: 10});
  });
});
