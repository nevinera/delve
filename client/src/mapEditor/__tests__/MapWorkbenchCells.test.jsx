import {describe, it, expect, vi, beforeEach} from "vitest";
import {useState} from "react";
import {act, fireEvent, render, screen} from "@testing-library/react";

vi.mock("../../cellMap/cache", () => ({
  cachedCellMapImage: vi.fn(async () => ({image: {width: 10, height: 10}, timings: {}, stats: {}, stored: Promise.resolve(null)})),
}));

import MapWorkbench from "../MapWorkbench";
import {MapDraft} from "../MapDraft";
import {cachedCellMapImage} from "../../cellMap/cache";

// MapWorkbench with a map drawn in cells, hosted like the world editor
// hosts it.
const cellMap = {version: 1, theme: "glade", seed: 1, grid: {type: "hex", cols: 4, rows: 3}, cells: ["....", "....", "...."]};
const CELL_MAP = {
  identifier: "m", name: "M", feetDimensions: {width: 18.764, height: 17.5}, cellMap,
  barriers: [], connections: [], units: [],
};

let current;
function renderHost(map, props = {}) {
  current = {};
  function Host() {
    const [mapData, setMapData] = useState(map);
    current.mapData = mapData;
    return (
      <MapWorkbench
        mapKey="m" mapData={mapData} onMapChange={(fn) => setMapData((d) => fn(new MapDraft(d)).data)}
        imageUrl={map.imageUrl ? "blob:img" : null} onImageUpload={() => {}}
        unitTypes={{keys: [], details: {}}} items={{keys: [], details: {}}} ncuTokenUrls={{}}
        {...props}
      />
    );
  }
  return render(<Host />);
}

describe("MapWorkbench with cells", () => {
  beforeEach(() => vi.clearAllMocks());

  it("shows the cells as the ground on the Map tab, sized by them", async () => {
    const {container} = renderHost(CELL_MAP);
    await act(async () => new Promise((r) => setTimeout(r, 200)));
    expect(cachedCellMapImage).toHaveBeenCalled();
    expect(container.querySelector(".map-canvas-cell-render")).not.toBeNull();
    expect(container.querySelector(".map-canvas-dropzone")).toBeNull();
    expect(screen.getByText("18.764 × 17.5 (the cells' size)")).toBeInTheDocument();
  });

  it("writes cell edits into the map, resizing it", () => {
    renderHost(CELL_MAP);
    fireEvent.click(screen.getByRole("tab", {name: "Cells"}));
    fireEvent.change(screen.getByLabelText("Rows"), {target: {value: "5"}});
    fireEvent.click(screen.getByRole("button", {name: "Resize"}));
    expect(current.mapData.cellMap.grid.rows).toBe(5);
    expect(current.mapData.feetDimensions).toEqual({width: 18.764, height: 27.5});
    fireEvent.click(screen.getByRole("button", {name: "Undo"}));
    expect(current.mapData.cellMap.grid.rows).toBe(3);
    expect(current.mapData.feetDimensions.height).toBe(17.5);
  });

  it("starts a cell map into the map", () => {
    renderHost({...CELL_MAP, cellMap: undefined, feetDimensions: {width: 50, height: 40}});
    fireEvent.click(screen.getByRole("tab", {name: "Cells"}));
    fireEvent.click(screen.getByRole("button", {name: "New cell map"}));
    expect(current.mapData.cellMap.grid).toMatchObject({cols: 11, rows: 8});
  });

  it("keeps an image as the ground, and offers to remove it", () => {
    const onImageRemove = vi.fn();
    vi.spyOn(window, "confirm").mockReturnValue(true);
    const {container} = renderHost({...CELL_MAP, imageUrl: "m.png", pixelDimensions: {width: 100, height: 100}}, {onImageRemove});
    expect(container.querySelector(".map-canvas-cell-render")).toBeNull();
    expect(cachedCellMapImage).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("tab", {name: "Cells"}));
    expect(container.querySelector(".map-canvas-cell-render")).not.toBeNull();
    fireEvent.click(screen.getByRole("button", {name: "Remove the image"}));
    expect(onImageRemove).toHaveBeenCalled();
  });
});
