import {describe, it, expect, vi, beforeEach, afterEach} from "vitest";
import {render, screen, fireEvent, waitFor, within} from "@testing-library/react";
import UnitTypeEditor from "../UnitTypeEditor";
import {commitFiles, GithubAuthError as CommitGithubAuthError} from "../../github/commitFiles";
import {GithubClient} from "../../github/delve-github";
import {loadAvailableAbilities} from "../loadAvailableAbilities";
import {validateUnitType} from "../../validators/validateContent";

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
  validateUnitType: vi.fn(),
}));

// UnitTypePreviewPane mounts a real Three.js WebGLRenderer via
// AbilityPreviewCanvas, which jsdom can't back - stub it so this test can
// exercise the reducer wiring (fields <-> unit type state) in isolation,
// same approach as ClassEditor.test.jsx.
vi.mock("../UnitTypePreviewPane", () => ({
  default: ({unitTypeData}) => <div data-testid="preview-powers">{JSON.stringify(unitTypeData.powers)}</div>,
}));

const initialUnitType = {
  name: "Goblin Raider", description: "", tokenImageUrl: [], tokenRadius: 1.5,
  maxHP: 20, dps: 4.0, attackSpeed: 1.0,
  resource: {name: "energy", color: "888888", max: 100.0, defaultValue: 100.0, returnRate: 0.0, isFluid: true},
  targeting: {type: "aggroTable"}, tactics: {type: "randomAvailable"}, powers: [],
};

const availableAbilities = {
  "units/goblin-raider/slash": {ability: {name: "Slash"}, assetMap: {}},
};

function mockUnitTypeLoad(unitType, abilities = {}) {
  GithubClient.mockImplementation(function () { return {fetchFile: vi.fn().mockResolvedValue(JSON.stringify(unitType))}; });
  loadAvailableAbilities.mockResolvedValue(abilities);
}

async function renderReady(unitType = initialUnitType, abilities = {}) {
  mockUnitTypeLoad(unitType, abilities);
  render(<UnitTypeEditor unitTypeKey="goblin-raider" stockAssets={{}} />);
  await screen.findByDisplayValue(unitType.name);
}

describe("UnitTypeEditor", () => {
  afterEach(() => vi.clearAllMocks());

  it("shows a loading state, then the fields panel once the fetch resolves", async () => {
    let resolveFetch;
    GithubClient.mockImplementation(function () { return {fetchFile: vi.fn(() => new Promise((resolve) => (resolveFetch = resolve)))}; });
    loadAvailableAbilities.mockResolvedValue({});

    render(<UnitTypeEditor unitTypeKey="goblin-raider" stockAssets={{}} />);
    expect(screen.getByText("Loading…")).toBeInTheDocument();

    resolveFetch(JSON.stringify(initialUnitType));
    await waitFor(() => expect(screen.getByDisplayValue("Goblin Raider")).toBeInTheDocument());
  });

  it("falls back to a blank unit type when the file doesn't exist yet (404 -> null)", async () => {
    GithubClient.mockImplementation(function () { return {fetchFile: vi.fn().mockResolvedValue(null)}; });
    loadAvailableAbilities.mockResolvedValue({});

    render(<UnitTypeEditor unitTypeKey="goblin-archer" stockAssets={{}} />);

    await screen.findByDisplayValue("Goblin Archer");
  });

  it("shows a load error rather than a blank/loading state when the fetch fails", async () => {
    GithubClient.mockImplementation(function () { return {fetchFile: vi.fn().mockRejectedValue(new Error("network down"))}; });
    loadAvailableAbilities.mockResolvedValue({});

    render(<UnitTypeEditor unitTypeKey="goblin-raider" stockAssets={{}} />);

    await screen.findByText(/Failed to load: network down/);
  });

  it("redirects to the GitHub reauth URL when the load itself hits a GithubAuthError", async () => {
    GithubClient.mockImplementation(function () { return {fetchFile: vi.fn().mockRejectedValue(new CommitGithubAuthError("reauth_required", "/github/reauth"))}; });
    loadAvailableAbilities.mockResolvedValue({});
    delete window.location;
    window.location = {href: ""};

    render(<UnitTypeEditor unitTypeKey="goblin-raider" stockAssets={{}} />);

    await waitFor(() => expect(window.location.href).toBe("/github/reauth"));
  });

  it("flows a name edit from the fields panel into the unit type state", async () => {
    await renderReady();

    fireEvent.change(screen.getByDisplayValue("Goblin Raider"), {target: {value: "Goblin Brute"}});

    expect(screen.getByDisplayValue("Goblin Brute")).toBeInTheDocument();
  });

  it("normalizes a bare-string tokenImageUrl (schema-legal, used by real content) into a one-entry array instead of crashing", async () => {
    const withStringToken = {...initialUnitType, tokenImageUrl: "../tokens/unit/goblin-archer.webp"};
    await renderReady(withStringToken);

    expect(screen.getByDisplayValue("../tokens/unit/goblin-archer.webp")).toBeInTheDocument();
  });

  it("adds a power's $ref when '+ Add power' is clicked", async () => {
    await renderReady(initialUnitType, availableAbilities);
    expect(screen.getByTestId("preview-powers")).toHaveTextContent("[]");

    fireEvent.click(screen.getByRole("button", {name: "+ Add power"}));

    const powers = JSON.parse(screen.getByTestId("preview-powers").textContent);
    expect(powers).toEqual([{$ref: "../abilities/units/goblin-raider/slash.json", referenceTo: "ability"}]);
  });

  it("removes a power", async () => {
    const withPower = {...initialUnitType, powers: [{$ref: "../abilities/units/goblin-raider/slash.json", referenceTo: "ability"}]};
    await renderReady(withPower, availableAbilities);

    fireEvent.click(screen.getByRole("button", {name: "Remove"}));

    expect(screen.getByTestId("preview-powers")).toHaveTextContent("[]");
  });

  describe("refreshing available abilities", () => {
    it("adds newly-refreshed abilities to the power picker without a page reload", async () => {
      await renderReady(initialUnitType, availableAbilities);
      loadAvailableAbilities.mockResolvedValue({
        "units/goblin-raider/slash": {ability: {name: "Slash"}, assetMap: {}},
        "units/goblin-raider/bite": {ability: {name: "Bite"}, assetMap: {}},
      });

      fireEvent.click(screen.getByRole("button", {name: "Refresh abilities"}));
      await waitFor(() => expect(screen.getByText("Refreshed.")).toBeInTheDocument());

      fireEvent.click(screen.getByRole("button", {name: "+ Add power"}));
      const select = screen.getAllByRole("combobox").find((el) => el.closest(".entry-block")?.textContent.includes("Power 1"));
      expect(within(select).getByText("units/goblin-raider/bite")).toBeInTheDocument();
    });

    it("shows an error message when the refresh fails", async () => {
      await renderReady();
      loadAvailableAbilities.mockRejectedValue(new Error("request failed: 500"));

      fireEvent.click(screen.getByRole("button", {name: "Refresh abilities"}));

      await waitFor(() => expect(screen.getByText(/Refresh failed/)).toBeInTheDocument());
    });
  });

  describe("validate then save", () => {
    beforeEach(() => {
      commitFiles.mockReset();
      validateUnitType.mockReset();
    });

    it("disables Save until Validate passes", async () => {
      validateUnitType.mockResolvedValue({valid: true});
      await renderReady();
      expect(screen.getByRole("button", {name: "Save"})).toBeDisabled();

      fireEvent.click(screen.getByRole("button", {name: "Validate"}));

      await waitFor(() => expect(screen.getByRole("button", {name: "Save"})).not.toBeDisabled());
    });

    it("disables Save again after an edit, even though the draft was previously validated", async () => {
      validateUnitType.mockResolvedValue({valid: true});
      await renderReady();
      fireEvent.click(screen.getByRole("button", {name: "Validate"}));
      await waitFor(() => expect(screen.getByRole("button", {name: "Save"})).not.toBeDisabled());

      fireEvent.change(screen.getByDisplayValue("Goblin Raider"), {target: {value: "Goblin Brute"}});

      expect(screen.getByRole("button", {name: "Save"})).toBeDisabled();
    });

    it("commits the unit type under unit_types/<key>.json and shows a success message", async () => {
      validateUnitType.mockResolvedValue({valid: true});
      commitFiles.mockResolvedValue({commitSha: "abc123", branch: "main"});
      await renderReady();
      fireEvent.click(screen.getByRole("button", {name: "Validate"}));
      await waitFor(() => expect(screen.getByRole("button", {name: "Save"})).not.toBeDisabled());

      fireEvent.click(screen.getByRole("button", {name: "Save"}));

      await waitFor(() => expect(screen.getByText("Saved.")).toBeInTheDocument());
      expect(commitFiles).toHaveBeenCalledWith(
        {"unit_types/goblin-raider.json": initialUnitType, "unit_types/goblin-raider.full.json": initialUnitType},
        {message: "Update Goblin Raider"}
      );
    });

    it("redirects to the reported URL instead of showing an error when GitHub auth is required", async () => {
      validateUnitType.mockResolvedValue({valid: true});
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
      validateUnitType.mockResolvedValue({valid: true});
      const withPower = {...initialUnitType, powers: [{$ref: "../abilities/units/goblin-raider/slash.json", referenceTo: "ability"}]};
      await renderReady(withPower, availableAbilities);

      fireEvent.click(screen.getByRole("button", {name: "Validate"}));

      await waitFor(() => expect(validateUnitType).toHaveBeenCalledWith({...withPower, powers: [{name: "Slash"}]}));
    });

    it("shows the validation error and keeps Save disabled when the resolved unit type is invalid", async () => {
      validateUnitType.mockResolvedValue({valid: false, error: {message: "tokenRadius must be between 1.0 and 20.0", path: "$.tokenRadius"}});
      await renderReady();

      fireEvent.click(screen.getByRole("button", {name: "Validate"}));

      await waitFor(() => expect(screen.getByText("tokenRadius must be between 1.0 and 20.0")).toBeInTheDocument());
      expect(screen.getByRole("button", {name: "Save"})).toBeDisabled();
    });

    it("shows a resolution error and keeps Save disabled when a power references an unloaded ability", async () => {
      const withBadPower = {...initialUnitType, powers: [{$ref: "../abilities/units/goblin-raider/missing.json", referenceTo: "ability"}]};
      await renderReady(withBadPower);

      fireEvent.click(screen.getByRole("button", {name: "Validate"}));

      await waitFor(() => expect(screen.getByText(/No ability loaded/)).toBeInTheDocument());
      expect(validateUnitType).not.toHaveBeenCalled();
      expect(screen.getByRole("button", {name: "Save"})).toBeDisabled();
    });
  });
});
