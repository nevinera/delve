import {describe, it, expect, vi} from "vitest";
import {render, screen, fireEvent} from "@testing-library/react";
import AbilityEditor from "../AbilityEditor";

// AbilityPreviewPane mounts a real Three.js WebGLRenderer, which jsdom can't
// back - stub it so this test can exercise the reducer wiring in isolation.
vi.mock("../AbilityPreviewPane", () => ({
  default: ({ability}) => <div data-testid="preview-speed">{ability.speed}</div>,
}));

const initialAbility = {name: "Firebolt", castTime: null, globalCooldown: 1.0, speed: 60.0, maxRange: 40.0, graphicEffects: [], soundEffects: [], effects: []};

describe("AbilityEditor", () => {
  it("flows an edit from the fields panel into the ability state passed to the preview", () => {
    render(<AbilityEditor initialAbility={initialAbility} assetMap={{}} />);
    expect(screen.getByTestId("preview-speed")).toHaveTextContent("60");

    fireEvent.change(screen.getByDisplayValue("60"), {target: {value: "99"}});

    expect(screen.getByTestId("preview-speed")).toHaveTextContent("99");
  });
});
