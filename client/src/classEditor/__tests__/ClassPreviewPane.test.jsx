import {describe, it, expect, vi} from "vitest";
import {forwardRef, useImperativeHandle} from "react";
import {render, screen, fireEvent} from "@testing-library/react";
import ClassPreviewPane from "../ClassPreviewPane";
import {firePowerEffects} from "../../game/effectPlayback";

vi.mock("../../game/effectPlayback", () => ({firePowerEffects: vi.fn()}));

// A real WebGLRenderer needs a canvas jsdom can't back - stub it the same
// way AbilityEditor.test.jsx stubs AbilityPreviewPane, just one level lower.
vi.mock("../../editor/AbilityPreviewCanvas", () => ({
  default: forwardRef((props, ref) => {
    useImperativeHandle(ref, () => ({positions: () => ({})}));
    return <div data-testid="canvas" />;
  }),
}));

// Exposes the `hint` AbilityTooltip is given (e.g. "Use ability" vs "Out of
// range") without needing to simulate its hover-delay popup.
vi.mock("../../AbilityTooltip", () => ({
  AbilityTooltip: ({hint, children}) => <div data-testid="tooltip" data-hint={hint}>{children}</div>,
}));

const availableAbilities = {
  "classes/x/short": {ability: {name: "Punch", castTime: null, maxRange: 5, iconURL: "punch.svg"}, assetMap: {}},
  "classes/x/long": {ability: {name: "Firebolt", castTime: null, maxRange: 20, iconURL: "firebolt.svg"}, assetMap: {}},
};

const powers = [
  {$ref: "../abilities/classes/x/short.json", referenceTo: "power"},
  {$ref: "../abilities/classes/x/long.json", referenceTo: "power"},
];

function renderPane() {
  return render(<ClassPreviewPane classKey="x" powers={powers} availableAbilities={availableAbilities} stockAssets={{}} />);
}

describe("ClassPreviewPane", () => {
  it("starts the slider at the longest ability's range, so both slots are in range", () => {
    renderPane();

    expect(screen.getByText("Target distance: 20.0 ft")).toBeInTheDocument();
    const icons = screen.getAllByRole("img");
    expect(icons[0]).toHaveClass("disabled"); // Punch (range 5) is out of range at distance 20
    expect(icons[1]).not.toHaveClass("disabled");
  });

  it("disables only the abilities whose own range is shorter than the current target distance", () => {
    renderPane();

    fireEvent.change(screen.getByRole("slider"), {target: {value: "10"}});

    const icons = screen.getAllByRole("img");
    expect(icons[0]).toHaveClass("disabled"); // Punch: range 5 < distance 10
    expect(icons[1]).not.toHaveClass("disabled"); // Firebolt: range 20 >= distance 10
  });

  it("shows an out-of-range hint instead of the normal one when disabled for range", () => {
    renderPane();
    fireEvent.change(screen.getByRole("slider"), {target: {value: "10"}});

    const tooltips = screen.getAllByTestId("tooltip");
    expect(tooltips[0]).toHaveAttribute("data-hint", "Out of range");
    expect(tooltips[1]).toHaveAttribute("data-hint", "Use ability");
  });

  it("does not fire an out-of-range ability on click", () => {
    renderPane();
    fireEvent.change(screen.getByRole("slider"), {target: {value: "10"}});

    fireEvent.click(screen.getAllByRole("img")[0]);

    expect(firePowerEffects).not.toHaveBeenCalled();
  });

  it("fires an in-range ability on click", () => {
    renderPane();
    fireEvent.change(screen.getByRole("slider"), {target: {value: "10"}});

    fireEvent.click(screen.getAllByRole("img")[1]);

    expect(firePowerEffects).toHaveBeenCalledTimes(1);
  });

  it("re-enables a slot once the slider moves back within its range", () => {
    renderPane();
    fireEvent.change(screen.getByRole("slider"), {target: {value: "10"}});
    expect(screen.getAllByRole("img")[0]).toHaveClass("disabled");

    fireEvent.change(screen.getByRole("slider"), {target: {value: "5"}});

    expect(screen.getAllByRole("img")[0]).not.toHaveClass("disabled");
  });
});
