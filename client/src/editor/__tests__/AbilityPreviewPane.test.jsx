import {describe, it, expect, vi} from "vitest";
import {forwardRef, useImperativeHandle} from "react";
import {render, screen, fireEvent} from "@testing-library/react";
import AbilityPreviewPane from "../AbilityPreviewPane";

vi.mock("../../game/effectPlayback", () => ({firePowerEffects: vi.fn()}));

// A real WebGLRenderer needs a canvas jsdom can't back - stub it the same
// way ClassPreviewPane.test.jsx does, and expose the token props it was
// given so tests can assert on the swap/override controls.
vi.mock("../AbilityPreviewCanvas", () => ({
  default: forwardRef(({selfTokenUrl, targetTokenUrl}, ref) => {
    useImperativeHandle(ref, () => ({positions: () => ({})}));
    return <div data-testid="canvas" data-self={selfTokenUrl} data-target={targetTokenUrl} />;
  }),
}));

vi.mock("../../AbilityTooltip", () => ({
  AbilityTooltip: ({children}) => <div>{children}</div>,
}));

const ability = {name: "Slash", castTime: null, maxRange: 5, iconURL: "slash.svg", effects: []};

describe("AbilityPreviewPane", () => {
  it("defaults to the elf token as self and the goblin token as target", () => {
    render(<AbilityPreviewPane ability={ability} assetMap={{}} assetOverrides={{}} stockAssets={{}} />);

    expect(screen.getByTestId("canvas")).toHaveAttribute("data-self", "/tokens/male-elf-guard.webp");
    expect(screen.getByTestId("canvas")).toHaveAttribute("data-target", "/tokens/goblin-1.webp");
  });

  it("swaps self and target when 'Swap tokens' is checked", () => {
    render(<AbilityPreviewPane ability={ability} assetMap={{}} assetOverrides={{}} stockAssets={{}} />);

    fireEvent.click(screen.getByLabelText(/Swap tokens/));

    expect(screen.getByTestId("canvas")).toHaveAttribute("data-self", "/tokens/goblin-1.webp");
    expect(screen.getByTestId("canvas")).toHaveAttribute("data-target", "/tokens/male-elf-guard.webp");
  });

  it("overrides only the self token when a token URL is typed in, leaving target untouched", () => {
    render(<AbilityPreviewPane ability={ability} assetMap={{}} assetOverrides={{}} stockAssets={{}} />);

    fireEvent.change(screen.getByLabelText(/Token URL/), {target: {value: "/tokens/my-monster.webp"}});

    expect(screen.getByTestId("canvas")).toHaveAttribute("data-self", "/tokens/my-monster.webp");
    expect(screen.getByTestId("canvas")).toHaveAttribute("data-target", "/tokens/goblin-1.webp");
  });

  it("still applies a token URL override after swapping (self stays overridden either way)", () => {
    render(<AbilityPreviewPane ability={ability} assetMap={{}} assetOverrides={{}} stockAssets={{}} />);

    fireEvent.click(screen.getByLabelText(/Swap tokens/));
    fireEvent.change(screen.getByLabelText(/Token URL/), {target: {value: "/tokens/my-monster.webp"}});

    expect(screen.getByTestId("canvas")).toHaveAttribute("data-self", "/tokens/my-monster.webp");
    expect(screen.getByTestId("canvas")).toHaveAttribute("data-target", "/tokens/male-elf-guard.webp");
  });

  it("still renders a clickable button when the ability has no iconURL", () => {
    const noIconAbility = {name: "Enrage", castTime: null, effects: []};
    render(<AbilityPreviewPane ability={noIconAbility} assetMap={{}} assetOverrides={{}} stockAssets={{}} />);

    expect(screen.queryByRole("img", {name: "ability icon"})).not.toBeInTheDocument();
    expect(screen.getByRole("button", {name: "EN"})).toBeInTheDocument();
  });

  it("falls back to the default self token once the override is cleared", () => {
    render(<AbilityPreviewPane ability={ability} assetMap={{}} assetOverrides={{}} stockAssets={{}} />);
    fireEvent.change(screen.getByLabelText(/Token URL/), {target: {value: "/tokens/my-monster.webp"}});

    fireEvent.change(screen.getByLabelText(/Token URL/), {target: {value: ""}});

    expect(screen.getByTestId("canvas")).toHaveAttribute("data-self", "/tokens/male-elf-guard.webp");
  });
});
