import {describe, it, expect, vi, beforeEach, afterEach} from "vitest";
import {render, screen, fireEvent, waitFor} from "@testing-library/react";
import AbilityEditor from "../AbilityEditor";
import {commitFiles, GithubAuthError as CommitGithubAuthError} from "../../github/commitFiles";
import {GithubClient, GithubAuthError} from "../../github/delve-github";
import {validateAbility} from "../../validators/validateContent";

vi.mock("../../github/commitFiles", async (importOriginal) => {
  const actual = await importOriginal();
  return {...actual, commitFiles: vi.fn()};
});

vi.mock("../../github/delve-github", async (importOriginal) => {
  const actual = await importOriginal();
  return {...actual, GithubClient: vi.fn()};
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

// Every test renders against a mocked GithubClient - fetchFile resolves
// the given ability's JSON, assetUrl just echoes the path back (nothing
// here inspects the resolved asset map itself, since AbilityPreviewPane is
// stubbed out below anyway - see collectAssetUrls.test.js/delve-github's
// own tests for that behavior in isolation).
function mockAbilityLoad(ability) {
  GithubClient.mockImplementation(function () {
    return {
      fetchFile: vi.fn().mockResolvedValue(JSON.stringify(ability)),
      assetUrl: vi.fn().mockImplementation(async (path) => path),
    };
  });
}

async function renderReady(ability = initialAbility, props = {}) {
  mockAbilityLoad(ability);
  render(<AbilityEditor abilityKey="firebolt" {...props} />);
  await screen.findByDisplayValue(ability.name);
}

describe("AbilityEditor", () => {
  afterEach(() => vi.clearAllMocks());

  it("shows a loading state, then the fields panel once the fetch resolves", async () => {
    let resolveFetch;
    GithubClient.mockImplementation(function () {
      return {
        fetchFile: vi.fn(() => new Promise((resolve) => (resolveFetch = resolve))),
        assetUrl: vi.fn().mockResolvedValue(""),
      };
    });

    render(<AbilityEditor abilityKey="firebolt" />);
    expect(screen.getByText("Loading…")).toBeInTheDocument();

    resolveFetch(JSON.stringify(initialAbility));
    await waitFor(() => expect(screen.getByDisplayValue("Firebolt")).toBeInTheDocument());
  });

  it("falls back to a blank ability when the file doesn't exist yet (404 -> null)", async () => {
    GithubClient.mockImplementation(function () {
      return {
        fetchFile: vi.fn().mockResolvedValue(null),
        assetUrl: vi.fn().mockResolvedValue(""),
      };
    });

    render(<AbilityEditor abilityKey="fire_bolt" />);

    await screen.findByDisplayValue("Fire Bolt");
  });

  it("shows a load error rather than a blank/loading state when the fetch fails", async () => {
    GithubClient.mockImplementation(function () {
      return {
        fetchFile: vi.fn().mockRejectedValue(new Error("network down")),
        assetUrl: vi.fn(),
      };
    });

    render(<AbilityEditor abilityKey="firebolt" />);

    await screen.findByText(/Failed to load: network down/);
  });

  it("redirects to the GitHub reauth URL when the load itself hits a GithubAuthError", async () => {
    GithubClient.mockImplementation(function () {
      return {
        fetchFile: vi.fn().mockRejectedValue(new GithubAuthError("reauth_required", "/github/reauth")),
        assetUrl: vi.fn(),
      };
    });
    delete window.location;
    window.location = {href: ""};

    render(<AbilityEditor abilityKey="firebolt" />);

    await waitFor(() => expect(window.location.href).toBe("/github/reauth"));
  });

  it("flows an edit from the fields panel into the ability state passed to the preview", async () => {
    await renderReady();
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

    it("passes an object URL for the uploaded file down as an assetOverride", async () => {
      await renderReady();
      const file = new File(["fake-bytes"], "icon.png", {type: "image/png"});

      fireEvent.change(document.querySelector('input[type="file"]'), {target: {files: [file]}});

      expect(URL.createObjectURL).toHaveBeenCalledWith(file);
      expect(screen.getByTestId("preview-icon-override")).toHaveTextContent("blob:fake-url");
    });

    it("clears the override and revokes the object URL when Restore is clicked", async () => {
      await renderReady();
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
    it("adds a placeholder graphicEffects entry to the ability state", async () => {
      await renderReady();
      expect(screen.getByTestId("preview-graphic-effects")).toHaveTextContent("[]");

      fireEvent.click(screen.getByRole("button", {name: "+ Add Graphic effect"}));

      expect(JSON.parse(screen.getByTestId("preview-graphic-effects").textContent)).toHaveLength(1);
    });

    it("removes an entry from the ability state", async () => {
      const withTwoEffects = {
        ...initialAbility,
        graphicEffects: [{sourceURL: "a.png", duration: 0.1}, {sourceURL: "b.png", duration: 0.2}],
      };
      await renderReady(withTwoEffects);

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

      it("shifts a later entry's override down to follow it when an earlier entry is removed", async () => {
        const withTwoEffects = {
          ...initialAbility,
          graphicEffects: [{sourceURL: "a.png", duration: 0.1}, {sourceURL: "b.png", duration: 0.2}],
        };
        await renderReady(withTwoEffects);

        // fileInputs[0] is the top-level iconURL upload; [1]/[2] are graphicEffects[0]/[1]
        const fileInputs = document.querySelectorAll('input[type="file"][accept="image/*"]');
        fireEvent.change(fileInputs[2], {target: {files: [new File(["x"], "b-upload.png", {type: "image/png"})]}});
        expect(JSON.parse(screen.getByTestId("preview-overrides").textContent)).toEqual({"graphicEffects[1].sourceURL": "blob:fake-url-0"});

        // remove entry index 0 ("a.png") - "b.png" is now at index 0
        fireEvent.click(screen.getAllByRole("button", {name: "Remove"})[0]);

        expect(JSON.parse(screen.getByTestId("preview-overrides").textContent)).toEqual({"graphicEffects[0].sourceURL": "blob:fake-url-0"});
      });

      it("drops and revokes the override for the entry that was actually removed", async () => {
        const withTwoEffects = {
          ...initialAbility,
          graphicEffects: [{sourceURL: "a.png", duration: 0.1}, {sourceURL: "b.png", duration: 0.2}],
        };
        await renderReady(withTwoEffects);

        const fileInputs = document.querySelectorAll('input[type="file"][accept="image/*"]');
        fireEvent.change(fileInputs[1], {target: {files: [new File(["x"], "a-upload.png", {type: "image/png"})]}});

        fireEvent.click(screen.getAllByRole("button", {name: "Remove"})[0]);

        expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:fake-url-0");
        expect(JSON.parse(screen.getByTestId("preview-overrides").textContent)).toEqual({});
      });
    });
  });

  describe("validate then save", () => {
    beforeEach(() => {
      commitFiles.mockReset();
      validateAbility.mockReset();
    });

    it("disables Save until Validate passes", async () => {
      validateAbility.mockResolvedValue({valid: true});
      await renderReady();
      expect(screen.getByRole("button", {name: "Save"})).toBeDisabled();

      fireEvent.click(screen.getByRole("button", {name: "Validate"}));

      await waitFor(() => expect(screen.getByRole("button", {name: "Save"})).not.toBeDisabled());
      expect(validateAbility).toHaveBeenCalledWith(initialAbility);
    });

    it("shows the validation error and keeps Save disabled when the draft is invalid", async () => {
      validateAbility.mockResolvedValue({valid: false, error: {message: "castTime must be a number or null (at $.castTime)", path: "$.castTime"}});
      await renderReady();

      fireEvent.click(screen.getByRole("button", {name: "Validate"}));

      await waitFor(() => expect(screen.getByText("castTime must be a number or null (at $.castTime)")).toBeInTheDocument());
      expect(screen.getByRole("button", {name: "Save"})).toBeDisabled();
    });

    it("disables Save again after an edit, even though the draft was previously validated", async () => {
      validateAbility.mockResolvedValue({valid: true});
      await renderReady();
      fireEvent.click(screen.getByRole("button", {name: "Validate"}));
      await waitFor(() => expect(screen.getByRole("button", {name: "Save"})).not.toBeDisabled());

      fireEvent.change(screen.getByDisplayValue("60"), {target: {value: "99"}});

      expect(screen.getByRole("button", {name: "Save"})).toBeDisabled();
    });

    it("commits the ability under abilities/<key>.json and shows a success message", async () => {
      validateAbility.mockResolvedValue({valid: true});
      commitFiles.mockResolvedValue({commitSha: "abc123", branch: "main"});
      await renderReady();
      fireEvent.click(screen.getByRole("button", {name: "Validate"}));
      await waitFor(() => expect(screen.getByRole("button", {name: "Save"})).not.toBeDisabled());

      fireEvent.click(screen.getByRole("button", {name: "Save"}));

      await waitFor(() => expect(screen.getByText("Saved.")).toBeInTheDocument());
      expect(commitFiles).toHaveBeenCalledWith(
        {"abilities/firebolt.json": initialAbility},
        {message: "Update Firebolt"}
      );
    });

    it("disables the button and shows a saving indicator while the commit is in flight", async () => {
      validateAbility.mockResolvedValue({valid: true});
      let resolveCommit;
      commitFiles.mockReturnValue(new Promise((resolve) => {
        resolveCommit = resolve;
      }));
      await renderReady();
      fireEvent.click(screen.getByRole("button", {name: "Validate"}));
      await waitFor(() => expect(screen.getByRole("button", {name: "Save"})).not.toBeDisabled());

      fireEvent.click(screen.getByRole("button", {name: "Save"}));

      expect(screen.getByRole("button", {name: "Saving…"})).toBeDisabled();

      resolveCommit({commitSha: "x", branch: "main"});
      await waitFor(() => expect(screen.getByText("Saved.")).toBeInTheDocument());
    });

    it("shows an error message when the commit fails, without requiring revalidation to retry", async () => {
      validateAbility.mockResolvedValue({valid: true});
      commitFiles.mockRejectedValue(new Error("network exploded"));
      await renderReady();
      fireEvent.click(screen.getByRole("button", {name: "Validate"}));
      await waitFor(() => expect(screen.getByRole("button", {name: "Save"})).not.toBeDisabled());

      fireEvent.click(screen.getByRole("button", {name: "Save"}));

      await waitFor(() => expect(screen.getByText("network exploded")).toBeInTheDocument());
      expect(screen.getByRole("button", {name: "Save"})).not.toBeDisabled();
    });

    it("redirects to the reported URL instead of showing an error when GitHub auth is required", async () => {
      validateAbility.mockResolvedValue({valid: true});
      commitFiles.mockRejectedValue(new CommitGithubAuthError("reauth_required", "/github/reauth"));
      const originalLocation = window.location;
      delete window.location;
      window.location = {href: ""};

      await renderReady();
      fireEvent.click(screen.getByRole("button", {name: "Validate"}));
      await waitFor(() => expect(screen.getByRole("button", {name: "Save"})).not.toBeDisabled());
      fireEvent.click(screen.getByRole("button", {name: "Save"}));

      await waitFor(() => expect(window.location.href).toEqual("/github/reauth"));

      window.location = originalLocation;
    });
  });
});
