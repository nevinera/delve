import {describe, it, expect, vi, beforeEach} from "vitest";
import {forwardRef, useImperativeHandle} from "react";
import {render, screen, fireEvent} from "@testing-library/react";
import UnitTypePreviewPane from "../UnitTypePreviewPane";
import {firePowerEffects} from "../../game/effectPlayback";

vi.mock("../../game/effectPlayback", () => ({firePowerEffects: vi.fn()}));

// A real WebGLRenderer needs a canvas jsdom can't back - stub it the same
// way ClassPreviewPane.test.jsx does, and expose the token props it was
// given so tests can assert on self/target token selection.
vi.mock("../../editor/AbilityPreviewCanvas", () => ({
  default: forwardRef(({selfTokenUrl, targetTokenUrl}, ref) => {
    useImperativeHandle(ref, () => ({positions: () => ({})}));
    return <div data-testid="canvas" data-self={selfTokenUrl} data-target={targetTokenUrl} />;
  }),
}));

vi.mock("../../AbilityTooltip", () => ({
  AbilityTooltip: ({hint, children}) => <div data-testid="tooltip" data-hint={hint}>{children}</div>,
}));

const availableAbilities = {
  "units/goblin/short": {
    ability: {name: "Slash", castTime: null, maxRange: 5, iconURL: "slash.svg", effects: [{type: "harm", affects: "bTarget", range: 5, amount: 5}]},
    assetMap: {},
  },
  "units/goblin/long": {
    ability: {name: "Hurl", castTime: null, maxRange: 20, iconURL: "hurl.svg", effects: [{type: "harm", affects: "bTarget", range: 20, amount: 10}]},
    assetMap: {},
  },
};

const powers = [
  {$ref: "../abilities/units/goblin/short.json", referenceTo: "ability"},
  {$ref: "../abilities/units/goblin/long.json", referenceTo: "ability"},
];

function renderPane(overrides = {}) {
  const unitTypeData = {tokenImageUrl: [], powers, ...overrides};
  return render(<UnitTypePreviewPane unitTypeKey="goblin" unitTypeData={unitTypeData} availableAbilities={availableAbilities} stockAssets={{}} />);
}

describe("UnitTypePreviewPane", () => {
  beforeEach(() => {
    firePowerEffects.mockClear();
  });

  it("uses the stock goblin token as self and the elf token as target when no tokenImageUrl is set", () => {
    renderPane();

    expect(screen.getByTestId("canvas")).toHaveAttribute("data-self", "/tokens/goblin-1.webp");
    expect(screen.getByTestId("canvas")).toHaveAttribute("data-target", "/tokens/male-elf-guard.webp");
  });

  it("uses the unit type's own supplied token as self when one is set", () => {
    renderPane({tokenImageUrl: ["../assets/tokens/my-goblin.webp"]});

    expect(screen.getByTestId("canvas")).toHaveAttribute("data-self", "../assets/tokens/my-goblin.webp");
  });

  it("starts the slider at the longest power's range, so both powers are in range", () => {
    renderPane();

    expect(screen.getByText("Target distance: 20.0 ft")).toBeInTheDocument();
    const icons = screen.getAllByRole("img");
    expect(icons[0]).toHaveClass("disabled"); // Slash (range 5) is out of range at distance 20
    expect(icons[1]).not.toHaveClass("disabled");
  });

  it("disables only the powers whose own range is shorter than the current target distance", () => {
    renderPane();

    fireEvent.change(screen.getByRole("slider"), {target: {value: "10"}});

    const icons = screen.getAllByRole("img");
    expect(icons[0]).toHaveClass("disabled");
    expect(icons[1]).not.toHaveClass("disabled");
  });

  it("does not fire an out-of-range power on click", () => {
    renderPane();
    fireEvent.change(screen.getByRole("slider"), {target: {value: "10"}});

    fireEvent.click(screen.getAllByRole("img")[0]);

    expect(firePowerEffects).not.toHaveBeenCalled();
  });

  it("fires an in-range power on click", () => {
    renderPane();
    fireEvent.change(screen.getByRole("slider"), {target: {value: "10"}});

    fireEvent.click(screen.getAllByRole("img")[1]);

    expect(firePowerEffects).toHaveBeenCalledTimes(1);
  });

  it("shows no power icons (just an empty slot) when the unit type has no powers", () => {
    renderPane({powers: []});

    expect(screen.queryAllByRole("img")).toHaveLength(0);
  });
});
