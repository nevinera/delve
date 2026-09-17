import {describe, it, expect, vi, beforeEach, afterEach} from "vitest";
import {render, screen, fireEvent, waitFor} from "@testing-library/react";
import ClassEditor from "../ClassEditor";
import {commitFiles, GithubAuthError as CommitGithubAuthError} from "../../github/commitFiles";
import {GithubClient} from "../../github/delve-github";
import {loadAvailableAbilities} from "../loadAvailableAbilities";
import {validateCharacterClass} from "../../validators/validateContent";

vi.mock("../../github/commitFiles", async (importOriginal) => {
  const actual = await importOriginal();
  return {...actual, commitFiles: vi.fn()};
});

vi.mock("../../github/delve-github", async (importOriginal) => {
  const actual = await importOriginal();
  return {...actual, GithubClient: vi.fn()};
});

vi.mock("../loadAvailableAbilities", () => ({
  loadAvailableAbilities: vi.fn(),
}));

vi.mock("../../validators/validateContent", () => ({
  validateCharacterClass: vi.fn(),
}));

// ClassPreviewPane mounts a real Three.js WebGLRenderer via AbilityPreviewCanvas,
// which jsdom can't back - stub it so this test can exercise the reducer wiring
// (fields <-> class state) in isolation, same approach as AbilityEditor.test.jsx.
vi.mock("../ClassPreviewPane", () => ({
  default: ({powers}) => <div data-testid="preview-powers">{JSON.stringify(powers)}</div>,
}));

const initialClass = {
  name: "Puncher", description: "", colors: {major: "888888", minor: "CCCCCC"},
  resources: [], powers: [], primaryStats: [], secondaryStats: [], wields: [],
};

const availableAbilities = {
  "classes/puncher/punch": {ability: {name: "Punch"}, assetMap: {}},
};

function mockClassLoad(classData, abilities = {}) {
  GithubClient.mockImplementation(() => ({fetchFile: vi.fn().mockResolvedValue(JSON.stringify(classData))}));
  loadAvailableAbilities.mockResolvedValue(abilities);
}

async function renderReady(classData = initialClass, abilities = {}) {
  mockClassLoad(classData, abilities);
  render(<ClassEditor classKey="puncher" stockAssets={{}} />);
  await screen.findByDisplayValue(classData.name);
}

describe("ClassEditor", () => {
  afterEach(() => vi.clearAllMocks());

  it("shows a loading state, then the fields panel once the fetch resolves", async () => {
    let resolveFetch;
    GithubClient.mockImplementation(() => ({fetchFile: vi.fn(() => new Promise((resolve) => (resolveFetch = resolve)))}));
    loadAvailableAbilities.mockResolvedValue({});

    render(<ClassEditor classKey="puncher" stockAssets={{}} />);
    expect(screen.getByText("Loading…")).toBeInTheDocument();

    resolveFetch(JSON.stringify(initialClass));
    await waitFor(() => expect(screen.getByDisplayValue("Puncher")).toBeInTheDocument());
  });

  it("falls back to a blank class when the file doesn't exist yet (404 -> null)", async () => {
    GithubClient.mockImplementation(() => ({fetchFile: vi.fn().mockResolvedValue(null)}));
    loadAvailableAbilities.mockResolvedValue({});

    render(<ClassEditor classKey="druid" stockAssets={{}} />);

    await screen.findByDisplayValue("Druid");
  });

  it("shows a load error rather than a blank/loading state when the fetch fails", async () => {
    GithubClient.mockImplementation(() => ({fetchFile: vi.fn().mockRejectedValue(new Error("network down"))}));
    loadAvailableAbilities.mockResolvedValue({});

    render(<ClassEditor classKey="puncher" stockAssets={{}} />);

    await screen.findByText(/Failed to load: network down/);
  });

  it("redirects to the GitHub reauth URL when the load itself hits a GithubAuthError", async () => {
    GithubClient.mockImplementation(() => ({fetchFile: vi.fn().mockRejectedValue(new CommitGithubAuthError("reauth_required", "/github/reauth"))}));
    loadAvailableAbilities.mockResolvedValue({});
    delete window.location;
    window.location = {href: ""};

    render(<ClassEditor classKey="puncher" stockAssets={{}} />);

    await waitFor(() => expect(window.location.href).toBe("/github/reauth"));
  });

  it("flows a name edit from the fields panel into the class state", async () => {
    await renderReady();

    fireEvent.change(screen.getByDisplayValue("Puncher"), {target: {value: "Brawler"}});

    expect(screen.getByDisplayValue("Brawler")).toBeInTheDocument();
  });

  it("adds a power slot's $ref when an ability is picked from an empty slot", async () => {
    await renderReady(initialClass, availableAbilities);
    expect(screen.getByTestId("preview-powers")).toHaveTextContent("[]");

    fireEvent.change(screen.getAllByRole("combobox").find((el) => el.closest("tr")?.textContent.includes("Slot 1")), {
      target: {value: "classes/puncher/punch"},
    });

    const powers = JSON.parse(screen.getByTestId("preview-powers").textContent);
    expect(powers).toEqual([{$ref: "../abilities/classes/puncher/punch.json", referenceTo: "ability"}]);
  });

  it("clears a filled slot back to an empty array", async () => {
    const withPower = {...initialClass, powers: [{$ref: "../abilities/classes/puncher/punch.json", referenceTo: "ability"}]};
    await renderReady(withPower, availableAbilities);

    fireEvent.click(screen.getByRole("button", {name: "Clear"}));

    expect(screen.getByTestId("preview-powers")).toHaveTextContent("[]");
  });

  describe("validate then save", () => {
    beforeEach(() => {
      commitFiles.mockReset();
      validateCharacterClass.mockReset();
    });

    it("disables Save until Validate passes", async () => {
      validateCharacterClass.mockResolvedValue({valid: true});
      await renderReady();
      expect(screen.getByRole("button", {name: "Save"})).toBeDisabled();

      fireEvent.click(screen.getByRole("button", {name: "Validate"}));

      await waitFor(() => expect(screen.getByRole("button", {name: "Save"})).not.toBeDisabled());
    });

    it("disables Save again after an edit, even though the draft was previously validated", async () => {
      validateCharacterClass.mockResolvedValue({valid: true});
      await renderReady();
      fireEvent.click(screen.getByRole("button", {name: "Validate"}));
      await waitFor(() => expect(screen.getByRole("button", {name: "Save"})).not.toBeDisabled());

      fireEvent.change(screen.getByDisplayValue("Puncher"), {target: {value: "Brawler"}});

      expect(screen.getByRole("button", {name: "Save"})).toBeDisabled();
    });

    it("commits the class under classes/<key>.json and shows a success message", async () => {
      validateCharacterClass.mockResolvedValue({valid: true});
      commitFiles.mockResolvedValue({commitSha: "abc123", branch: "main"});
      await renderReady();
      fireEvent.click(screen.getByRole("button", {name: "Validate"}));
      await waitFor(() => expect(screen.getByRole("button", {name: "Save"})).not.toBeDisabled());

      fireEvent.click(screen.getByRole("button", {name: "Save"}));

      await waitFor(() => expect(screen.getByText("Saved.")).toBeInTheDocument());
      expect(commitFiles).toHaveBeenCalledWith(
        {"classes/puncher.json": initialClass, "classes/puncher.full.json": initialClass},
        {message: "Update Puncher"}
      );
    });

    it("shows an error message when the commit fails, without requiring revalidation to retry", async () => {
      validateCharacterClass.mockResolvedValue({valid: true});
      commitFiles.mockRejectedValue(new Error("network exploded"));
      await renderReady();
      fireEvent.click(screen.getByRole("button", {name: "Validate"}));
      await waitFor(() => expect(screen.getByRole("button", {name: "Save"})).not.toBeDisabled());

      fireEvent.click(screen.getByRole("button", {name: "Save"}));

      await waitFor(() => expect(screen.getByText("network exploded")).toBeInTheDocument());
      expect(screen.getByRole("button", {name: "Save"})).not.toBeDisabled();
    });

    it("redirects to the reported URL instead of showing an error when GitHub auth is required", async () => {
      validateCharacterClass.mockResolvedValue({valid: true});
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

    it("validates the resolved (powers-inlined) form, not the raw $ref draft", async () => {
      validateCharacterClass.mockResolvedValue({valid: true});
      const withPower = {...initialClass, powers: [{$ref: "../abilities/classes/puncher/punch.json", referenceTo: "ability"}]};
      await renderReady(withPower, availableAbilities);

      fireEvent.click(screen.getByRole("button", {name: "Validate"}));

      await waitFor(() => expect(validateCharacterClass).toHaveBeenCalledWith({...withPower, powers: [{name: "Punch"}]}));
    });

    it("shows the validation error and keeps Save disabled when the resolved class is invalid", async () => {
      validateCharacterClass.mockResolvedValue({valid: false, error: {message: "major must be a 6-digit hex string (at $.colors.major)", path: "$.colors.major"}});
      await renderReady();

      fireEvent.click(screen.getByRole("button", {name: "Validate"}));

      await waitFor(() => expect(screen.getByText("major must be a 6-digit hex string (at $.colors.major)")).toBeInTheDocument());
      expect(screen.getByRole("button", {name: "Save"})).toBeDisabled();
    });

    it("shows a resolution error and keeps Save disabled when a power references an unloaded ability", async () => {
      const withBadPower = {...initialClass, powers: [{$ref: "../abilities/classes/puncher/missing.json", referenceTo: "ability"}]};
      await renderReady(withBadPower);

      fireEvent.click(screen.getByRole("button", {name: "Validate"}));

      await waitFor(() => expect(screen.getByText(/No ability loaded/)).toBeInTheDocument());
      expect(validateCharacterClass).not.toHaveBeenCalled();
      expect(screen.getByRole("button", {name: "Save"})).toBeDisabled();
    });
  });
});
