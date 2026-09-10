import {describe, it, expect, vi, beforeEach, afterEach} from "vitest";
import {render, screen, fireEvent, waitFor} from "@testing-library/react";
import AbilityEditor from "../AbilityEditor";
import {commitFiles, GithubAuthError} from "../../github/commitFiles";
import {validateAbility} from "../../validators/validateContent";

vi.mock("../../github/commitFiles", async (importOriginal) => {
  const actual = await importOriginal();
  return {...actual, commitFiles: vi.fn()};
});

vi.mock("../../validators/validateContent", () => ({
  validateAbility: vi.fn(),
}));

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

  describe("saving", () => {
    beforeEach(() => {
      commitFiles.mockReset();
      validateAbility.mockReset();
      validateAbility.mockResolvedValue({valid: true});
    });

    it("commits the ability under abilities/<key>.json and shows a success message", async () => {
      commitFiles.mockResolvedValue({commitSha: "abc123", branch: "main"});
      render(<AbilityEditor abilityKey="firebolt" initialAbility={initialAbility} assetMap={{}} />);

      fireEvent.click(screen.getByRole("button", {name: "Save"}));

      await waitFor(() => expect(screen.getByText("Saved.")).toBeInTheDocument());
      expect(commitFiles).toHaveBeenCalledWith(
        {"abilities/firebolt.json": initialAbility},
        {message: "Update Firebolt"}
      );
    });

    it("disables the button and shows a saving indicator while the commit is in flight", async () => {
      let resolveCommit;
      commitFiles.mockReturnValue(new Promise((resolve) => {
        resolveCommit = resolve;
      }));
      render(<AbilityEditor abilityKey="firebolt" initialAbility={initialAbility} assetMap={{}} />);

      fireEvent.click(screen.getByRole("button", {name: "Save"}));

      expect(screen.getByRole("button", {name: "Saving…"})).toBeDisabled();

      resolveCommit({commitSha: "x", branch: "main"});
      await waitFor(() => expect(screen.getByText("Saved.")).toBeInTheDocument());
    });

    it("shows an error message when the commit fails", async () => {
      commitFiles.mockRejectedValue(new Error("network exploded"));
      render(<AbilityEditor abilityKey="firebolt" initialAbility={initialAbility} assetMap={{}} />);

      fireEvent.click(screen.getByRole("button", {name: "Save"}));

      await waitFor(() => expect(screen.getByText("network exploded")).toBeInTheDocument());
      expect(screen.getByRole("button", {name: "Save"})).not.toBeDisabled();
    });

    it("redirects to the reported URL instead of showing an error when GitHub auth is required", async () => {
      commitFiles.mockRejectedValue(new GithubAuthError("reauth_required", "/github/reauth"));
      const originalLocation = window.location;
      delete window.location;
      window.location = {href: ""};

      render(<AbilityEditor abilityKey="firebolt" initialAbility={initialAbility} assetMap={{}} />);
      fireEvent.click(screen.getByRole("button", {name: "Save"}));

      await waitFor(() => expect(window.location.href).toEqual("/github/reauth"));

      window.location = originalLocation;
    });

    it("shows the validation error and never commits when the draft is invalid", async () => {
      validateAbility.mockResolvedValue({valid: false, error: {message: "castTime must be a number or null (at $.castTime)", path: "$.castTime"}});
      render(<AbilityEditor abilityKey="firebolt" initialAbility={initialAbility} assetMap={{}} />);

      fireEvent.click(screen.getByRole("button", {name: "Save"}));

      await waitFor(() => expect(screen.getByText("castTime must be a number or null (at $.castTime)")).toBeInTheDocument());
      expect(commitFiles).not.toHaveBeenCalled();
    });
  });
});
