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
      <div data-testid="preview-overrides">{JSON.stringify(assetOverrides)}</div>
      <div data-testid="preview-graphic-effects">{JSON.stringify(ability.graphicEffects)}</div>
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

  describe("adding and removing entries", () => {
    it("adds a placeholder graphicEffects entry to the ability state", () => {
      render(<AbilityEditor initialAbility={initialAbility} assetMap={{}} />);
      expect(screen.getByTestId("preview-graphic-effects")).toHaveTextContent("[]");

      fireEvent.click(screen.getByRole("button", {name: "+ Add Graphic effect"}));

      expect(JSON.parse(screen.getByTestId("preview-graphic-effects").textContent)).toHaveLength(1);
    });

    it("removes an entry from the ability state", () => {
      const withTwoEffects = {
        ...initialAbility,
        graphicEffects: [{sourceURL: "a.png", duration: 0.1}, {sourceURL: "b.png", duration: 0.2}],
      };
      render(<AbilityEditor initialAbility={withTwoEffects} assetMap={{}} />);

      fireEvent.click(screen.getAllByRole("button", {name: "Remove"})[0]);

      const remaining = JSON.parse(screen.getByTestId("preview-graphic-effects").textContent);
      expect(remaining).toEqual([{sourceURL: "b.png", duration: 0.2}]);
    });

    describe("reindexing asset overrides on removal", () => {
      beforeEach(() => {
        let n = 0;
        URL.createObjectURL = vi.fn(() => `blob:fake-url-${n++}`);
        URL.revokeObjectURL = vi.fn();
      });

      afterEach(() => {
        delete URL.createObjectURL;
        delete URL.revokeObjectURL;
      });

      it("shifts a later entry's override down to follow it when an earlier entry is removed", () => {
        const withTwoEffects = {
          ...initialAbility,
          graphicEffects: [{sourceURL: "a.png", duration: 0.1}, {sourceURL: "b.png", duration: 0.2}],
        };
        render(<AbilityEditor initialAbility={withTwoEffects} assetMap={{}} />);

        // fileInputs[0] is the top-level iconURL upload; [1]/[2] are graphicEffects[0]/[1]
        const fileInputs = document.querySelectorAll('input[type="file"][accept="image/*"]');
        fireEvent.change(fileInputs[2], {target: {files: [new File(["x"], "b-upload.png", {type: "image/png"})]}});
        expect(JSON.parse(screen.getByTestId("preview-overrides").textContent)).toEqual({"graphicEffects[1].sourceURL": "blob:fake-url-0"});

        // remove entry index 0 ("a.png") - "b.png" is now at index 0
        fireEvent.click(screen.getAllByRole("button", {name: "Remove"})[0]);

        expect(JSON.parse(screen.getByTestId("preview-overrides").textContent)).toEqual({"graphicEffects[0].sourceURL": "blob:fake-url-0"});
      });

      it("drops and revokes the override for the entry that was actually removed", () => {
        const withTwoEffects = {
          ...initialAbility,
          graphicEffects: [{sourceURL: "a.png", duration: 0.1}, {sourceURL: "b.png", duration: 0.2}],
        };
        render(<AbilityEditor initialAbility={withTwoEffects} assetMap={{}} />);

        const fileInputs = document.querySelectorAll('input[type="file"][accept="image/*"]');
        fireEvent.change(fileInputs[1], {target: {files: [new File(["x"], "a-upload.png", {type: "image/png"})]}});

        fireEvent.click(screen.getAllByRole("button", {name: "Remove"})[0]);

        expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:fake-url-0");
        expect(JSON.parse(screen.getByTestId("preview-overrides").textContent)).toEqual({});
      });
    });
  });
});
