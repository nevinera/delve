import {describe, it, expect, vi} from "vitest";
import {render, screen, fireEvent} from "@testing-library/react";
import InteractablesPanel from "../InteractablesPanel";

const SNARE = {identifier: "snare-1", name: "Goblin Snare", stamp: "props/snare", position: {x: 1, y: 2, angle: 0}};
const STAMPS = {
  sets: {props: {name: "Props", imageUrl: "p.png", stamps: {snare: {name: "Snare", feetWidth: 3}, cut: {name: "Cut snare", feetWidth: 3}}}},
  sheets: {},
};

function renderPanel(props = {}) {
  const dispatch = vi.fn();
  const utils = render(
    <InteractablesPanel
      interactables={[SNARE]} tool="select" canPlaceOnMap onStartAdd={vi.fn()} onHover={vi.fn()} onSelect={vi.fn()}
      onStartUnitPlacement={vi.fn()} dispatch={dispatch} stampLayer={STAMPS}
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

  it("edits its fields into the interactables section, offering a used stamp only when it's drawn used", () => {
    const {dispatch, rerender} = renderPanel();
    fireEvent.click(screen.getByText("Goblin Snare"));
    const last = () => dispatch.mock.calls.at(-1)[0];

    fireEvent.change(screen.getByLabelText("Name"), {target: {value: "Snare"}});
    expect(last()).toEqual({type: "UPDATE_ENTRY_FIELD", section: "interactables", index: 0, field: "name", value: "Snare"});
    fireEvent.change(screen.getByLabelText("Scale"), {target: {value: "1.5"}});
    expect(last()).toMatchObject({field: "scale", value: 1.5});
    fireEvent.change(screen.getByLabelText("Stamp"), {target: {value: "props/cut"}});
    expect(dispatch.mock.calls.at(-2)[0]).toMatchObject({field: "stamp", value: "props/cut"});
    fireEvent.change(screen.getByLabelText("Use Time"), {target: {value: "2.5"}});
    expect(last()).toMatchObject({field: "useTime", value: 2.5});
    fireEvent.change(screen.getByLabelText("Use Text"), {target: {value: "Cutting"}});
    expect(last()).toMatchObject({field: "useText", value: "Cutting"});

    expect(screen.queryByText("Used Stamp")).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("When unavailable"), {target: {value: "used"}});
    expect(last()).toMatchObject({field: "whenUnavailable", value: "used"});
    rerender(
      <InteractablesPanel interactables={[{...SNARE, whenUnavailable: "used"}]} tool="select" canPlaceOnMap onStartAdd={vi.fn()} onHover={vi.fn()} onSelect={vi.fn()} dispatch={dispatch} stampLayer={STAMPS} />
    );
    expect(screen.getByText("Used Stamp")).toBeInTheDocument();
    expect(screen.getByRole("option", {name: "Its stamp, grayed out"})).toBeInTheDocument();
  });
});
