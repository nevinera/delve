import {describe, it, expect, vi, beforeEach, afterEach} from "vitest";
import {render, screen, fireEvent, waitFor, within} from "@testing-library/react";
import UnitTypeEditor from "../UnitTypeEditor";
import {commitFiles, GithubAuthError as CommitGithubAuthError} from "../../github/commitFiles";
import {GithubClient} from "../../github/delve-github";
import {loadAvailableAbilities} from "../loadAvailableAbilities";
import {validateUnitType} from "../../validators/validateContent";
import {estimateDamage} from "../estimateDamage";

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

vi.mock("../estimateDamage", () => ({
  estimateDamage: vi.fn(),
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
  GithubClient.mockImplementation(function () {
    return {
      fetchFile: vi.fn().mockResolvedValue(JSON.stringify(unitType)),
      listDirectory: vi.fn().mockResolvedValue([]),
      assetUrl: vi.fn().mockImplementation((path) => Promise.resolve(`https://raw.githubusercontent.com/mock/${path}`)),
    };
  });
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
    GithubClient.mockImplementation(function () {
      return {fetchFile: vi.fn(() => new Promise((resolve) => (resolveFetch = resolve))), listDirectory: vi.fn().mockResolvedValue([])};
    });
    loadAvailableAbilities.mockResolvedValue({});

    render(<UnitTypeEditor unitTypeKey="goblin-raider" stockAssets={{}} />);
    expect(screen.getByText("Loading…")).toBeInTheDocument();

    resolveFetch(JSON.stringify(initialUnitType));
    await waitFor(() => expect(screen.getByDisplayValue("Goblin Raider")).toBeInTheDocument());
  });

  it("falls back to a blank unit type when the file doesn't exist yet (404 -> null)", async () => {
    GithubClient.mockImplementation(function () {
      return {fetchFile: vi.fn().mockResolvedValue(null), listDirectory: vi.fn().mockResolvedValue([])};
    });
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

  describe("token images", () => {
    beforeEach(() => {
      commitFiles.mockReset();
      validateUnitType.mockReset();
    });

    async function saveIt() {
      validateUnitType.mockResolvedValue({valid: true});
      commitFiles.mockResolvedValue({commitSha: "abc123", branch: "main"});
      fireEvent.click(screen.getByRole("button", {name: "Validate"}));
      await waitFor(() => expect(screen.getByRole("button", {name: "Save"})).not.toBeDisabled());
      fireEvent.click(screen.getByRole("button", {name: "Save"}));
      await waitFor(() => expect(screen.getByText("Saved.")).toBeInTheDocument());
    }

    it("uploading a file fills in the slot's path and commits the file alongside the JSON on save", async () => {
      mockUnitTypeLoad(initialUnitType);
      const {container} = render(<UnitTypeEditor unitTypeKey="goblin-raider" stockAssets={{}} />);
      await screen.findByDisplayValue("Goblin Raider");

      fireEvent.click(screen.getByRole("button", {name: "+ Add token image"}));
      const file = new File(["fake"], "raider.webp", {type: "image/webp"});
      fireEvent.change(container.querySelector('input[type="file"]'), {target: {files: [file]}});

      expect(screen.getByDisplayValue("../tokens/unit/raider.webp")).toBeInTheDocument();

      await saveIt();
      expect(commitFiles).toHaveBeenCalledWith(
        expect.objectContaining({"tokens/unit/raider.webp": file}),
        {message: "Update Goblin Raider"}
      );
    });

    it("picking an existing token image sets the slot's path without staging an upload", async () => {
      GithubClient.mockImplementation(function () {
        return {
          fetchFile: vi.fn().mockResolvedValue(JSON.stringify(initialUnitType)),
          listDirectory: vi.fn().mockResolvedValue(["tokens/unit/goblin-1.webp", "tokens/unit/goblin-2.webp"]),
          assetUrl: vi.fn().mockImplementation((path) => Promise.resolve(`https://raw.githubusercontent.com/mock/${path}`)),
        };
      });
      loadAvailableAbilities.mockResolvedValue({});
      render(<UnitTypeEditor unitTypeKey="goblin-raider" stockAssets={{}} />);
      await screen.findByDisplayValue("Goblin Raider");

      fireEvent.click(screen.getByRole("button", {name: "+ Add token image"}));
      fireEvent.change(screen.getByDisplayValue("— existing token —"), {target: {value: "goblin-1.webp"}});

      expect(screen.getByDisplayValue("../tokens/unit/goblin-1.webp")).toBeInTheDocument();

      await saveIt();
      expect(commitFiles).toHaveBeenCalledWith(
        {
          "unit_types/goblin-raider.json": {...initialUnitType, tokenImageUrl: ["../tokens/unit/goblin-1.webp"]},
          "unit_types/goblin-raider.full.json": {...initialUnitType, tokenImageUrl: ["../tokens/unit/goblin-1.webp"]},
        },
        {message: "Update Goblin Raider"}
      );
    });

    it("keeps a pending upload matched to its own slot after an earlier slot is removed", async () => {
      mockUnitTypeLoad({...initialUnitType, tokenImageUrl: ["../tokens/unit/first.webp"]});
      const {container} = render(<UnitTypeEditor unitTypeKey="goblin-raider" stockAssets={{}} />);
      await screen.findByDisplayValue("Goblin Raider");

      fireEvent.click(screen.getByRole("button", {name: "+ Add token image"}));
      const file = new File(["fake"], "second.webp", {type: "image/webp"});
      const fileInputs = container.querySelectorAll('input[type="file"]');
      fireEvent.change(fileInputs[1], {target: {files: [file]}});
      expect(screen.getByDisplayValue("../tokens/unit/second.webp")).toBeInTheDocument();

      // Remove slot 0 ("first.webp") - the pending upload for what was slot 1 needs to follow it down to slot 0.
      fireEvent.click(screen.getAllByRole("button", {name: "Remove"})[0]);
      expect(screen.getByDisplayValue("../tokens/unit/second.webp")).toBeInTheDocument();

      await saveIt();
      expect(commitFiles).toHaveBeenCalledWith(
        expect.objectContaining({"tokens/unit/second.webp": file}),
        {message: "Update Goblin Raider"}
      );
    });
  });

  describe("estimating damage", () => {
    const matrix = {results: [{gearingPlan: "offense", elevation: 0, dps: 3.9, ttdSeconds: 40.0}]};

    it("posts the resolved unit type and shows the matrix when 'Estimate damage' is clicked", async () => {
      estimateDamage.mockResolvedValue(matrix);
      await renderReady();

      fireEvent.click(screen.getByRole("button", {name: "Estimate damage"}));

      await screen.findByText("3.9 dps");
      expect(estimateDamage).toHaveBeenCalledWith(expect.objectContaining({name: "Goblin Raider"}));
    });

    it("shows the error when the estimate fails", async () => {
      estimateDamage.mockRejectedValue(new Error("game server unavailable"));
      await renderReady();

      fireEvent.click(screen.getByRole("button", {name: "Estimate damage"}));

      await screen.findByText("game server unavailable");
    });

    it("drops a shown estimate once the draft is edited", async () => {
      estimateDamage.mockResolvedValue(matrix);
      await renderReady();
      fireEvent.click(screen.getByRole("button", {name: "Estimate damage"}));
      await screen.findByText("3.9 dps");

      fireEvent.change(screen.getByDisplayValue("Goblin Raider"), {target: {value: "Goblin Brute"}});

      expect(screen.queryByText("3.9 dps")).not.toBeInTheDocument();
    });
  });
});
