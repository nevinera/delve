import {describe, it, expect, vi} from "vitest";
import {render, screen, fireEvent} from "@testing-library/react";
import InteractablesPanel from "../InteractablesPanel";

const SNARE = {identifier: "snare-1", name: "Goblin Snare", imageUrl: "./s.webp", size: {width: 4, height: 3}, position: {x: 1, y: 2, angle: 0}};

function renderPanel(props = {}) {
  const dispatch = vi.fn();
  const utils = render(
    <InteractablesPanel
      interactables={[SNARE]} tool="select" canPlaceOnMap onStartAdd={vi.fn()} onHover={vi.fn()} onSelect={vi.fn()}
      onStartUnitPlacement={vi.fn()} dispatch={dispatch}
      {...props}
    />
  );
  return {dispatch, ...utils};
}

describe("InteractablesPanel", () => {
  it("lists interactables by name, collapsed, and arms add-interactable from its button", () => {
    const onStartAdd = vi.fn();
    const {rerender} = renderPanel({onStartAdd});
    expect(screen.getByText("Interactables (1)")).toBeInTheDocument();
    expect(screen.queryByLabelText("Name")).not.toBeInTheDocument();
    fireEvent.click(screen.getByText("+ Add Interactable"));
    expect(onStartAdd).toHaveBeenCalled();
    rerender(<InteractablesPanel interactables={[]} tool="add-circle" canPlaceOnMap onStartAdd={onStartAdd} dispatch={vi.fn()} />);
    expect(screen.getByText("+ Add Interactable")).toBeDisabled();
  });

  it("edits its fields into the interactables section, showing the used image only when it's drawn used", () => {
    const {dispatch, rerender} = renderPanel();
    fireEvent.click(screen.getByText("Goblin Snare"));
    const last = () => dispatch.mock.calls.at(-1)[0];

    fireEvent.change(screen.getByLabelText("Name"), {target: {value: "Snare"}});
    expect(last()).toEqual({type: "UPDATE_ENTRY_FIELD", section: "interactables", index: 0, field: "name", value: "Snare"});
    fireEvent.change(screen.getByLabelText("Width"), {target: {value: "6"}});
    expect(last()).toMatchObject({field: "size", value: {width: 6, height: 3}});
    fireEvent.change(screen.getByLabelText("Use Time"), {target: {value: "2.5"}});
    expect(last()).toMatchObject({field: "useTime", value: 2.5});
    fireEvent.change(screen.getByLabelText("Use Text"), {target: {value: "Cutting"}});
    expect(last()).toMatchObject({field: "useText", value: "Cutting"});

    expect(screen.queryByText("Used Image")).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("When unavailable"), {target: {value: "used"}});
    expect(last()).toMatchObject({field: "whenUnavailable", value: "used"});
    rerender(
      <InteractablesPanel interactables={[{...SNARE, whenUnavailable: "used"}]} tool="select" canPlaceOnMap onStartAdd={vi.fn()} onHover={vi.fn()} onSelect={vi.fn()} dispatch={dispatch} />
    );
    expect(screen.getByText("Used Image")).toBeInTheDocument();
  });
});
