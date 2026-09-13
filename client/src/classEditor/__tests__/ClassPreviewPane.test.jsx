import {describe, it, expect, vi, beforeEach} from "vitest";
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
  "classes/x/short": {
    ability: {name: "Punch", castTime: null, maxRange: 5, iconURL: "punch.svg", effects: [{type: "harm", affects: "bTarget", range: 5, amount: 5}]},
    assetMap: {},
  },
  "classes/x/long": {
    ability: {name: "Firebolt", castTime: null, maxRange: 20, iconURL: "firebolt.svg", effects: [{type: "harm", affects: "bTarget", range: 20, amount: 10}]},
    assetMap: {},
  },
};

const powers = [
  {$ref: "../abilities/classes/x/short.json", referenceTo: "ability"},
  {$ref: "../abilities/classes/x/long.json", referenceTo: "ability"},
];

function renderPane() {
  return render(<ClassPreviewPane classKey="x" powers={powers} availableAbilities={availableAbilities} stockAssets={{}} />);
}

describe("ClassPreviewPane", () => {
  beforeEach(() => {
    firePowerEffects.mockClear();
  });

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

  it("still renders a clickable button for a power with no iconURL", () => {
    const noIconAbilities = {
      "classes/x/short": {ability: {name: "Enrage", castTime: null, effects: []}, assetMap: {}},
      "classes/x/long": availableAbilities["classes/x/long"],
    };
    render(<ClassPreviewPane classKey="x" powers={powers} availableAbilities={noIconAbilities} stockAssets={{}} />);

    expect(screen.getAllByRole("img")).toHaveLength(1); // just Firebolt
    expect(screen.getByRole("button", {name: "EN"})).toBeInTheDocument();
  });

  describe("a self-only ability (e.g. Recover)", () => {
    const selfOnlyAbilities = {
      "classes/x/recover": {
        ability: {name: "Recover", castTime: null, iconURL: "recover.svg", effects: [{type: "heal", affects: "self", amount: 10}]},
        assetMap: {},
      },
      "classes/x/long": availableAbilities["classes/x/long"],
    };
    const selfOnlyPowers = [
      {$ref: "../abilities/classes/x/recover.json", referenceTo: "ability"},
      {$ref: "../abilities/classes/x/long.json", referenceTo: "ability"},
    ];

    it("is never disabled for range, even at a distance beyond the DEFAULT_MAX_RANGE fallback", () => {
      render(<ClassPreviewPane classKey="x" powers={selfOnlyPowers} availableAbilities={selfOnlyAbilities} stockAssets={{}} />);
      // the slider starts at Firebolt's range (20), well past the 10ft
      // fallback a ranged ability with no maxRange/effect range would get
      expect(screen.getByText("Target distance: 20.0 ft")).toBeInTheDocument();

      expect(screen.getAllByRole("img")[0]).not.toHaveClass("disabled");
    });

    it("does not inflate the shared slider's max range", () => {
      render(<ClassPreviewPane classKey="x" powers={[selfOnlyPowers[0]]} availableAbilities={selfOnlyAbilities} stockAssets={{}} />);

      // with no ranged ability in the class at all, the slider falls back
      // to DEFAULT_MAX_RANGE (10) rather than Recover's own fallback
      expect(screen.getByText("Target distance: 10.0 ft")).toBeInTheDocument();
    });

    it("still fires on click", () => {
      render(<ClassPreviewPane classKey="x" powers={selfOnlyPowers} availableAbilities={selfOnlyAbilities} stockAssets={{}} />);

      fireEvent.click(screen.getAllByRole("img")[0]);

      expect(firePowerEffects).toHaveBeenCalledTimes(1);
    });
  });
});
