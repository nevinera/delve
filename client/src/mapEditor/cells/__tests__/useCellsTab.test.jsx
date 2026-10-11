import {describe, it, expect, vi, beforeEach} from "vitest";
import {useState} from "react";
import {act, fireEvent, render, renderHook, screen} from "@testing-library/react";

vi.mock("../../../cellMap/cache", () => ({
  cachedCellMapImage: vi.fn(async () => ({image: {width: 10, height: 10}, timings: {}, stats: {}, stored: Promise.resolve(null)})),
}));

import {useCellsTab, EDITOR_PIXELS_PER_FOOT} from "../useCellsTab";
import CellsPanel from "../CellsPanel";
import {CellMapDraft} from "../CellMapDraft";
import {cellCenter, cellPoint} from "../../../cellMap/hexGrid";
import {cachedCellMapImage} from "../../../cellMap/cache";

// An all-meadow map (a new one starts all trees).
const start = () => CellMapDraft.blank({cols: 6, rows: 5}).with({cells: Array.from({length: 5}, () => "......")}).data;

// A canvas pixel over the given cell coordinates.
const at = (col, row) => {
  const {x, y} = Number.isInteger(col) && Number.isInteger(row) ? cellCenter(col, row, 5) : cellPoint(col, row, 5);
  return {x: x * EDITOR_PIXELS_PER_FOOT, y: y * EDITOR_PIXELS_PER_FOOT};
};

// The hook as MapWorkbench hosts it: the cellMap lives in the host's state.
function useHosted(initial, options) {
  const [cellMap, setCellMap] = useState(initial);
  return useCellsTab({mapKey: "m", cellMap, onCellMapChange: setCellMap, ...options});
}

function setup(cellMap = start()) {
  return renderHook(({editing}) => useHosted(cellMap, {editing}), {initialProps: {editing: true}});
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

  it("places a bridge in a straight line, and deletes it", () => {
    const {result} = setup();
    act(() => result.current.update({tool: "bridge"}));
    act(() => {
      result.current.canvas.onPointer("down", at(1, 0));
    });
    act(() => {
      result.current.canvas.onPointer("up");
    });
    // Off the line down column 1, so it snaps onto it.
    act(() => {
      result.current.canvas.onPointer("down", at(1.2, 3));
    });
    expect(result.current.draft.bridges).toEqual([{from: [1, 0], to: [1, 3]}]);
    expect(result.current.ui.selectedBridge).toBe(0);
    act(() => {
      document.dispatchEvent(new KeyboardEvent("keydown", {key: "Delete"}));
    });
    expect(result.current.draft.bridges).toEqual([]);
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

  it("renders only while editing, without storing previews", async () => {
    vi.useFakeTimers();
    const {rerender} = setup();
    await act(async () => vi.advanceTimersByTime(500));
    expect(cachedCellMapImage).toHaveBeenCalledWith(expect.objectContaining({cells: start().cells}), {pixelsPerFoot: EDITOR_PIXELS_PER_FOOT, persist: false});
    vi.clearAllMocks();
    rerender({editing: false});
    await act(async () => vi.advanceTimersByTime(500));
    expect(cachedCellMapImage).not.toHaveBeenCalled();
    vi.useRealTimers();
  });
});

describe("CellsPanel", () => {
  function Panel({cellMap = null, feetDimensions = {width: 100, height: 80}, hasImage = false}) {
    const cells = useHosted(cellMap, {editing: false});
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
      const cells = useHosted(start(), {editing: false});
      return <CellsPanel cells={cells} feetDimensions={null} hasImage={false} />;
    }
    render(<Panel />);
    fireEvent.change(screen.getByLabelText("Columns"), {target: {value: "8"}});
    fireEvent.click(screen.getByRole("button", {name: "Resize"}));
    fireEvent.click(screen.getByRole("button", {name: "Undo"}));
    expect(screen.getByLabelText("Columns")).toHaveValue(6);
  });
});

describe("useCellsTab thumbnails", () => {
  it("makes one after an edit, once the render catches up - not on open", async () => {
    vi.useFakeTimers();
    HTMLCanvasElement.prototype.getContext = () => ({drawImage: () => {}});
    HTMLCanvasElement.prototype.toBlob = function (done) {
      done(new Blob(["thumb"]));
    };
    const onThumbnail = vi.fn();
    const {result} = renderHook(() => useHosted(start(), {editing: true, onThumbnail}));
    await act(async () => vi.advanceTimersByTime(500));
    await act(async () => vi.advanceTimersByTime(3000));
    expect(onThumbnail).not.toHaveBeenCalled();
    act(() => result.current.change((d) => d.paint(0, 0, "T")));
    await act(async () => vi.advanceTimersByTime(500));
    await act(async () => vi.advanceTimersByTime(3000));
    expect(onThumbnail).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
  });
});

describe("CellsPanel's Delete point", () => {
  it("removes the selected trail point, for touch screens", () => {
    let cells;
    function Panel() {
      cells = useHosted({...start(), trails: [{width: 1, points: [[0, 0], [2, 2], [4, 1]]}]}, {editing: true});
      return <CellsPanel cells={cells} feetDimensions={null} hasImage={false} />;
    }
    render(<Panel />);
    fireEvent.click(screen.getByRole("button", {name: "Trails"}));
    expect(screen.getByRole("button", {name: "Delete point"})).toBeDisabled();
    act(() => {
      cells.canvas.onPointer("down", at(2, 2));
      cells.canvas.onPointer("up");
    });
    fireEvent.click(screen.getByRole("button", {name: "Delete point"}));
    expect(cells.draft.trails[0].points).toEqual([[0, 0], [4, 1]]);
    expect(screen.getByRole("button", {name: "Delete point"})).toBeDisabled();
  });
});

describe("useCellsTab trail snapping", () => {
  const twoTrails = () => ({...start(), trails: [{width: 1, points: [[0, 1], [5, 1]]}, {width: 1, points: [[2, 4], [3, 3]]}]});
  const near = (col, row, dx = 1.2) => {
    const p = at(col, row);
    return {x: p.x + dx * EDITOR_PIXELS_PER_FOOT, y: p.y};
  };
  const tap = (result, px, event) => act(() => {
    result.current.canvas.onPointer("down", px, event);
    result.current.canvas.onPointer("up");
  });

  it("joins the selected trail onto another trail's point", () => {
    const {result} = setup(twoTrails());
    act(() => result.current.update({tool: "trail", selected: {trail: 1, point: 1}}));
    tap(result, near(5, 1));
    expect(result.current.draft.trails[1].points).toEqual([[2, 4], [3, 3], [5, 1]]);
    expect(result.current.draft.trails[0].points).toEqual([[0, 1], [5, 1]]);
  });

  it("doesn't snap with Shift", () => {
    const {result} = setup(twoTrails());
    act(() => result.current.update({tool: "trail", selected: {trail: 1, point: 1}}));
    tap(result, near(5, 1), {shiftKey: true});
    expect(result.current.draft.trails[1].points[2]).not.toEqual([5, 1]);
  });

  it("starts a new trail on another's point after New trail", () => {
    const {result} = setup(twoTrails());
    act(() => result.current.update({tool: "trail", newTrail: true}));
    tap(result, near(0, 1, 0.5));
    tap(result, at(1, 3));
    expect(result.current.draft.trails[2].points).toEqual([[0, 1], [1, 3]]);
  });

  it("snaps a dragged point onto another trail's, but not onto itself", () => {
    const {result} = setup(twoTrails());
    act(() => result.current.update({tool: "trail"}));
    act(() => {
      result.current.canvas.onPointer("down", at(3, 3));
    });
    act(() => {
      result.current.canvas.onPointer("drag", near(5, 1));
    });
    act(() => {
      result.current.canvas.onPointer("up");
    });
    expect(result.current.draft.trails[1].points[1]).toEqual([5, 1]);
  });

  it("still grabs a point when nothing is selected", () => {
    const {result} = setup(twoTrails());
    act(() => result.current.update({tool: "trail"}));
    tap(result, near(5, 1, 0.5));
    expect(result.current.ui.selected).toEqual({trail: 0, point: 1});
    expect(result.current.draft.trails).toHaveLength(2);
  });
});
