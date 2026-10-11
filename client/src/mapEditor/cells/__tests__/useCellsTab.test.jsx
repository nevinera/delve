import {describe, it, expect, vi, beforeEach} from "vitest";
import {act, fireEvent, render, renderHook, screen} from "@testing-library/react";

vi.mock("../../../cellMap/cache", () => ({
  cachedCellMapImage: vi.fn(async () => ({image: {width: 10, height: 10}, timings: {}, stats: {}, stored: Promise.resolve(null)})),
}));

import {useCellsTab, EDITOR_PIXELS_PER_FOOT} from "../useCellsTab";
import CellsPanel from "../CellsPanel";
import {CellMapDraft} from "../CellMapDraft";
import {cellCenter, cellPoint} from "../../../cellMap/hexGrid";
import {cachedCellMapImage} from "../../../cellMap/cache";

const start = () => CellMapDraft.blank({cols: 6, rows: 5}).data;

// A canvas pixel over the given cell coordinates.
const at = (col, row) => {
  const {x, y} = Number.isInteger(col) && Number.isInteger(row) ? cellCenter(col, row, 5) : cellPoint(col, row, 5);
  return {x: x * EDITOR_PIXELS_PER_FOOT, y: y * EDITOR_PIXELS_PER_FOOT};
};

function setup(cellMap = start()) {
  return renderHook(({active}) => useCellsTab({mapKey: "m", cellMap, active}), {initialProps: {active: true}});
}

describe("useCellsTab", () => {
  beforeEach(() => vi.clearAllMocks());

  it("paints a stroke, which undoes at once", () => {
    const {result} = setup();
    act(() => result.current.update({terrain: "T"}));
    act(() => {
      result.current.canvas.onPointer("down", at(0, 0));
    });
    act(() => {
      result.current.canvas.onPointer("drag", at(3, 0));
    });
    act(() => {
      result.current.canvas.onPointer("up");
    });
    expect(result.current.draft.data.cells[0]).toBe("TTTT..");
    act(() => result.current.history.undo());
    expect(result.current.draft.data.cells[0]).toBe("......");
    act(() => result.current.history.redo());
    expect(result.current.draft.data.cells[0]).toBe("TTTT..");
  });

  it("pans with the pan tool", () => {
    const {result} = setup();
    act(() => result.current.update({tool: "pan"}));
    let handled;
    act(() => {
      handled = result.current.canvas.onPointer("down", at(1, 1));
    });
    expect(handled).toBe(false);
  });

  it("fills", () => {
    const {result} = setup();
    act(() => result.current.update({tool: "fill", terrain: "~"}));
    act(() => {
      result.current.canvas.onPointer("down", at(2, 2));
    });
    expect(result.current.draft.data.cells.every((row) => row === "~~~~~~")).toBe(true);
  });

  it("draws, extends and moves trails", () => {
    const {result} = setup();
    act(() => result.current.update({tool: "trail"}));
    const click = (col, row) => act(() => {
      result.current.canvas.onPointer("down", at(col, row));
      result.current.canvas.onPointer("up");
    });
    click(0.5, 1);
    expect(result.current.draft.trails).toEqual([]);
    click(3, 1);
    click(5, 2);
    expect(result.current.draft.trails[0].points).toEqual([[0.5, 1], [3, 1], [5, 2]]);

    act(() => {
      result.current.canvas.onPointer("down", at(3, 1));
    });
    act(() => {
      result.current.canvas.onPointer("drag", at(3, 3));
    });
    act(() => {
      result.current.canvas.onPointer("drag", at(3, 4));
    });
    act(() => {
      result.current.canvas.onPointer("up");
    });
    expect(result.current.draft.trails[0].points[1]).toEqual([3, 4]);
    act(() => result.current.history.undo());
    expect(result.current.draft.trails[0].points[1]).toEqual([3, 1]);
  });

  it("deletes the selected trail point with the Delete key, and undoes with ctrl-z", () => {
    const {result} = setup({...start(), trails: [{width: 1, points: [[0, 0], [2, 2], [4, 1]]}]});
    act(() => result.current.update({tool: "trail"}));
    act(() => {
      result.current.canvas.onPointer("down", at(2, 2));
      result.current.canvas.onPointer("up");
    });
    act(() => {
      fireEvent.keyDown(document, {key: "Delete"});
    });
    expect(result.current.draft.trails[0].points).toEqual([[0, 0], [4, 1]]);
    act(() => {
      fireEvent.keyDown(document, {key: "z", ctrlKey: true});
    });
    expect(result.current.draft.trails[0].points).toHaveLength(3);
  });

  it("renders only while active, without storing previews", async () => {
    vi.useFakeTimers();
    const {rerender} = setup();
    await act(async () => vi.advanceTimersByTime(500));
    expect(cachedCellMapImage).toHaveBeenCalledWith(expect.objectContaining({cells: start().cells}), {pixelsPerFoot: EDITOR_PIXELS_PER_FOOT, persist: false});
    vi.clearAllMocks();
    rerender({active: false});
    await act(async () => vi.advanceTimersByTime(500));
    expect(cachedCellMapImage).not.toHaveBeenCalled();
    vi.useRealTimers();
  });
});

describe("CellsPanel", () => {
  function Panel({cellMap = null, feetDimensions = {width: 100, height: 80}, hasImage = false}) {
    const cells = useCellsTab({mapKey: "m", cellMap, active: false});
    return <CellsPanel cells={cells} feetDimensions={feetDimensions} hasImage={hasImage} />;
  }

  it("starts a cell map sized to the map", () => {
    render(<Panel />);
    expect(screen.getByLabelText("Columns")).toHaveValue(23);
    expect(screen.getByLabelText("Rows")).toHaveValue(16);
    fireEvent.click(screen.getByRole("button", {name: "New cell map"}));
    expect(screen.getByRole("group", {name: "Tool"})).toBeInTheDocument();
    expect(screen.getByRole("button", {name: "Undo"})).toBeDisabled();
  });

  it("says the cells aren't used while there's an image", () => {
    render(<Panel cellMap={start()} hasImage />);
    expect(screen.getByText(/has an image, so these cells aren't shown in play/)).toBeInTheDocument();
  });

  it("overrides and resets a color", () => {
    render(<Panel cellMap={start()} />);
    fireEvent.input(screen.getByLabelText("meadow"), {target: {value: "#112233"}});
    expect(screen.getByRole("button", {name: "Reset meadow"})).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", {name: "Reset meadow"}));
    expect(screen.queryByRole("button", {name: "Reset meadow"})).not.toBeInTheDocument();
  });

  it("resizes the grid", () => {
    render(<Panel cellMap={start()} />);
    fireEvent.change(screen.getByLabelText("Columns"), {target: {value: "8"}});
    fireEvent.click(screen.getByRole("button", {name: "Resize"}));
    expect(screen.queryByRole("button", {name: "Resize"})).not.toBeInTheDocument();
    expect(screen.getByLabelText("Columns")).toHaveValue(8);
  });
});

describe("CellsPanel's grid fields", () => {
  it("follow an undone resize", () => {
    function Panel() {
      const cells = useCellsTab({mapKey: "m", cellMap: start(), active: false});
      return <CellsPanel cells={cells} feetDimensions={null} hasImage={false} />;
    }
    render(<Panel />);
    fireEvent.change(screen.getByLabelText("Columns"), {target: {value: "8"}});
    fireEvent.click(screen.getByRole("button", {name: "Resize"}));
    fireEvent.click(screen.getByRole("button", {name: "Undo"}));
    expect(screen.getByLabelText("Columns")).toHaveValue(6);
  });
});
