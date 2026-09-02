import {describe, it, expect, vi, beforeEach, afterEach} from "vitest";
import {render, screen, fireEvent} from "@testing-library/react";
import AbilityEditor from "../AbilityEditor";

// AbilityPreviewPane mounts a real Three.js WebGLRenderer, which jsdom can't
// back - stub it so this test can exercise the reducer/upload wiring in isolation.
vi.mock("../AbilityPreviewPane", () => ({
  default: ({ability, assetOverrides}) => (
    <div>
      <div data-testid="preview-speed">{ability.speed}</div>
      <div data-testid="preview-icon-override">{assetOverrides.iconURL ?? ""}</div>
    </div>
  ),
}));

const initialAbility = {name: "Firebolt", castTime: null, globalCooldown: 1.0, speed: 60.0, maxRange: 40.0, graphicEffects: [], soundEffects: [], effects: []};

describe("AbilityEditor", () => {
  it("flows an edit from the fields panel into the ability state passed to the preview", () => {
    render(<AbilityEditor initialAbility={initialAbility} assetMap={{}} />);
    expect(screen.getByTestId("preview-speed")).toHaveTextContent("60");

    fireEvent.change(screen.getByDisplayValue("60"), {target: {value: "99"}});

    expect(screen.getByTestId("preview-speed")).toHaveTextContent("99");
  });

  describe("icon upload", () => {
    beforeEach(() => {
      URL.createObjectURL = vi.fn(() => "blob:fake-url");
      URL.revokeObjectURL = vi.fn();
    });

    afterEach(() => {
      delete URL.createObjectURL;
      delete URL.revokeObjectURL;
    });

    it("passes an object URL for the uploaded file down as an assetOverride", () => {
      render(<AbilityEditor initialAbility={initialAbility} assetMap={{}} />);
      const file = new File(["fake-bytes"], "icon.png", {type: "image/png"});

      fireEvent.change(document.querySelector('input[type="file"]'), {target: {files: [file]}});

      expect(URL.createObjectURL).toHaveBeenCalledWith(file);
      expect(screen.getByTestId("preview-icon-override")).toHaveTextContent("blob:fake-url");
    });

    it("clears the override and revokes the object URL when Restore is clicked", () => {
      render(<AbilityEditor initialAbility={initialAbility} assetMap={{}} />);
      const file = new File(["fake-bytes"], "icon.png", {type: "image/png"});
      fireEvent.change(document.querySelector('input[type="file"]'), {target: {files: [file]}});
      expect(screen.getByTestId("preview-icon-override")).toHaveTextContent("blob:fake-url");

      fireEvent.click(screen.getByRole("button", {name: "Restore"}));

      expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:fake-url");
      expect(screen.getByTestId("preview-icon-override")).toHaveTextContent("");
      expect(screen.queryByRole("button", {name: "Restore"})).not.toBeInTheDocument();
    });
  });
});
