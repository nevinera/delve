import {describe, it, expect, vi, beforeEach, afterEach} from "vitest";
import {redirectTo} from "../../redirectTo";
import {render, screen, fireEvent, waitFor, within} from "@testing-library/react";
import UnitTypeEditor from "../UnitTypeEditor";
import {commitFiles, GithubAuthError as CommitGithubAuthError} from "../../github/commitFiles";
import {GithubClient} from "../../github/delve-github";
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

vi.mock("../../redirectTo", () => ({redirectTo: vi.fn()}));
vi.mock("../../validators/validateContent", () => ({
  validateUnitType: vi.fn(),
}));

vi.mock("../estimateDamage", () => ({
  estimateDamage: vi.fn(),
}));

// UnitTypePreviewPane mounts a real Three.js WebGLRenderer via
// AbilityPreviewCanvas, which jsdom can't back - stub it, exposing the
// powers it was given.
vi.mock("../UnitTypePreviewPane", () => ({
  default: ({unitTypeData, resolvedTokenUrls}) => (
    <div data-testid="preview-powers" data-tokens={JSON.stringify(resolvedTokenUrls)}>{JSON.stringify(unitTypeData.powers)}</div>
  ),
}));

const initialUnitType = {
  name: "Goblin Raider", description: "", tokenImageUrl: [], tokenRadius: 1.5,
  maxHP: 20, dps: 4.0, attackSpeed: 1.0,
  resource: {name: "energy", color: "888888", max: 100.0, defaultValue: 100.0, returnRate: 0.0, isFluid: true},
  targeting: {type: "aggroTable"}, tactics: {type: "randomAvailable"}, powers: [],
};

const slash = {name: "Slash", maxRange: 5, effects: [{type: "harm", affects: "bTarget", amount: 5}]};
const bleed = {name: "Bleed", shortName: "BLD", treatAs: "debuff", stacking: "replace", effects: []};
const rend = {name: "Rend", effects: [{type: "status", affects: "bTarget", duration: 6, status: bleed}]};

const stockAssets = {icons: {}, graphics: {}, sounds: {}};

function mockRepo({files = {}, listings = {}} = {}) {
  const client = {
    fetchFile: vi.fn((path) => Promise.resolve(path in files ? JSON.stringify(files[path]) : null)),
    listDirectory: vi.fn((path) => Promise.resolve(listings[path] ?? [])),
    assetUrl: vi.fn((path) => Promise.resolve(`https://raw.githubusercontent.com/mock/${path}`)),
  };
  GithubClient.mockImplementation(function () { return client; });
  return client;
}

async function renderReady(unitType = initialUnitType, repo = {}) {
  mockRepo({...repo, files: {"unit_types/goblin-raider.json": unitType, ...repo.files}});
  const result = render(<UnitTypeEditor unitTypeKey="goblin-raider" stockAssets={stockAssets} backUrl="/build/unit_types" />);
  await screen.findByDisplayValue(unitType.name);
  return result;
}

function areaList() {
  return within(screen.getByRole("navigation", {name: "Unit type areas"}));
}

function breadcrumbs() {
  return within(screen.getByRole("navigation", {name: "Breadcrumb"}));
}

function previewPowers() {
  return JSON.parse(screen.getByTestId("preview-powers").textContent);
}

async function validateAndSave() {
  validateUnitType.mockResolvedValue({valid: true});
  commitFiles.mockResolvedValue({commitSha: "abc123", branch: "main"});
  fireEvent.click(screen.getByRole("button", {name: "Validate"}));
  await waitFor(() => expect(screen.getByRole("button", {name: "Save"})).not.toBeDisabled());
  fireEvent.click(screen.getByRole("button", {name: "Save"}));
  fireEvent.click(screen.getByRole("button", {name: "Commit"}));
  await waitFor(() => expect(screen.getByText("Saved.")).toBeInTheDocument());
}

describe("UnitTypeEditor", () => {
  afterEach(() => vi.clearAllMocks());

  describe("loading", () => {
    it("shows a loading state, then the unit's fields once the fetch resolves", async () => {
      let resolveFetch;
      GithubClient.mockImplementation(function () {
        return {fetchFile: vi.fn(() => new Promise((resolve) => (resolveFetch = resolve))), listDirectory: vi.fn().mockResolvedValue([]), assetUrl: vi.fn().mockResolvedValue("")};
      });

      render(<UnitTypeEditor unitTypeKey="goblin-raider" stockAssets={{}} />);
      expect(screen.getByText("Loading…")).toBeInTheDocument();

      resolveFetch(JSON.stringify(initialUnitType));
      await screen.findByDisplayValue("Goblin Raider");
    });

    it("falls back to a blank unit type when the file doesn't exist yet", async () => {
      mockRepo();
      render(<UnitTypeEditor unitTypeKey="goblin-archer" stockAssets={{}} />);

      await screen.findByDisplayValue("Goblin Archer");
    });

    it("shows a load error when the fetch fails", async () => {
      GithubClient.mockImplementation(function () { return {fetchFile: vi.fn().mockRejectedValue(new Error("network down"))}; });

      render(<UnitTypeEditor unitTypeKey="goblin-raider" stockAssets={{}} />);

      await screen.findByText(/Failed to load: network down/);
    });

    it("redirects to the GitHub reauth URL when the load hits a GithubAuthError", async () => {
      GithubClient.mockImplementation(function () { return {fetchFile: vi.fn().mockRejectedValue(new CommitGithubAuthError("reauth_required", "/github/reauth"))}; });

      render(<UnitTypeEditor unitTypeKey="goblin-raider" stockAssets={{}} />);

      await waitFor(() => expect(redirectTo).toHaveBeenCalledWith("/github/reauth"));
    });

    it("normalizes a bare-string tokenImageUrl into a one-entry array", async () => {
      await renderReady({...initialUnitType, tokenImageUrl: "../tokens/unit/goblin-archer.webp"});

      expect(screen.getByRole("button", {name: "Token image 1"})).toHaveTextContent("goblin-archer.webp");
    });

    it("expands $ref powers into inline copies on load", async () => {
      const withRef = {...initialUnitType, powers: [{$ref: "../abilities/units/goblins/slash.json", referenceTo: "ability"}]};
      await renderReady(withRef, {files: {"abilities/units/goblins/slash.json": slash}});

      expect(previewPowers()).toEqual([slash]);
      expect(areaList().getByRole("button", {name: /Slash/})).toBeInTheDocument();
    });
  });

  describe("layout", () => {
    it("starts on the unit's own config, with a one-crumb breadcrumb", async () => {
      await renderReady();

      expect(breadcrumbs().getByText("Goblin Raider")).toHaveAttribute("aria-current", "page");
      expect(screen.getByDisplayValue("Goblin Raider")).toBeInTheDocument();
    });

    it("flows a unit field edit into the draft and the area list", async () => {
      await renderReady();

      fireEvent.change(screen.getByDisplayValue("Goblin Raider"), {target: {value: "Goblin Brute"}});

      expect(areaList().getByRole("button", {name: /Goblin Brute/})).toBeInTheDocument();
    });

    it("lists each power, and opens one in the config pane when clicked", async () => {
      await renderReady({...initialUnitType, powers: [slash]});

      fireEvent.click(areaList().getByRole("button", {name: /Slash/}));

      expect(breadcrumbs().getByRole("button", {name: "Goblin Raider"})).toBeInTheDocument();
      expect(breadcrumbs().getByText("Slash")).toHaveAttribute("aria-current", "page");
      expect(screen.getByDisplayValue("Slash")).toBeInTheDocument();
    });

    it("goes back to the unit from the breadcrumb", async () => {
      await renderReady({...initialUnitType, powers: [slash]});
      fireEvent.click(areaList().getByRole("button", {name: /Slash/}));

      fireEvent.click(breadcrumbs().getByRole("button", {name: "Goblin Raider"}));

      expect(screen.getByDisplayValue("Goblin Raider")).toBeInTheDocument();
      expect(screen.queryByDisplayValue("Slash")).not.toBeInTheDocument();
    });
  });

  describe("powers", () => {
    it("adds a blank power and opens it", async () => {
      await renderReady();

      fireEvent.click(screen.getByRole("button", {name: "+ New power"}));

      expect(previewPowers()).toHaveLength(1);
      expect(breadcrumbs().getByText("New Power")).toHaveAttribute("aria-current", "page");
    });

    it("edits a power inline", async () => {
      await renderReady({...initialUnitType, powers: [slash]});
      fireEvent.click(areaList().getByRole("button", {name: /Slash/}));

      fireEvent.change(screen.getByDisplayValue("Slash"), {target: {value: "Rake"}});

      expect(previewPowers()[0].name).toBe("Rake");
      expect(breadcrumbs().getByText("Rake")).toBeInTheDocument();
    });

    it("removes a power and returns to the unit", async () => {
      await renderReady({...initialUnitType, powers: [slash]});
      fireEvent.click(areaList().getByRole("button", {name: /Slash/}));

      fireEvent.click(screen.getByRole("button", {name: "Remove power"}));

      expect(previewPowers()).toEqual([]);
      expect(screen.getByDisplayValue("Goblin Raider")).toBeInTheDocument();
    });

    it("opens a power's status in its own pane, three crumbs deep", async () => {
      await renderReady({...initialUnitType, powers: [rend]});
      fireEvent.click(areaList().getByRole("button", {name: /Rend/}));

      fireEvent.click(screen.getByRole("button", {name: "Edit status ›"}));

      expect(breadcrumbs().getByRole("button", {name: "Rend"})).toBeInTheDocument();
      expect(breadcrumbs().getByText("Bleed")).toHaveAttribute("aria-current", "page");
      fireEvent.change(screen.getByDisplayValue("BLD"), {target: {value: "BLEED"}});
      expect(previewPowers()[0].effects[0].status.shortName).toBe("BLEED");
    });

    it("removes a status and goes back to its power", async () => {
      await renderReady({...initialUnitType, powers: [rend]});
      fireEvent.click(areaList().getByRole("button", {name: /Rend/}));
      fireEvent.click(screen.getByRole("button", {name: "Edit status ›"}));

      fireEvent.click(screen.getByRole("button", {name: "Remove status"}));

      expect(previewPowers()[0].effects[0].status).toBeNull();
      expect(breadcrumbs().getByText("Rend")).toHaveAttribute("aria-current", "page");
    });
  });

  describe("importing a power", () => {
    it("copies a library ability in, picked by folder then power, with its asset URLs rebased", async () => {
      const pound = {name: "Pound", iconURL: "../../../graphics/icons/pound.png", effects: []};
      await renderReady(initialUnitType, {
        files: {"abilities/units/goblins/pound.json": pound},
        listings: {
          abilities: ["abilities/units/goblins/pound.json"],
          "abilities/units/goblins": ["abilities/units/goblins/pound.json"],
        },
      });
      fireEvent.click(screen.getByRole("button", {name: "+ Import power"}));

      fireEvent.change(screen.getByRole("combobox", {name: "Source type"}), {target: {value: "library"}});
      const source = await screen.findByRole("combobox", {name: "Source"});
      await within(source).findByRole("option", {name: "units/goblins"});
      fireEvent.change(source, {target: {value: "abilities/units/goblins"}});
      await screen.findByText("Pound");
      fireEvent.click(screen.getByRole("button", {name: "Import"}));

      expect(previewPowers()).toEqual([{...pound, iconURL: "../graphics/icons/pound.png"}]);
      expect(breadcrumbs().getByText("Pound")).toHaveAttribute("aria-current", "page");
    });

    it("copies a power in from another unit type", async () => {
      await renderReady(initialUnitType, {
        files: {"unit_types/goblin-boss.json": {name: "Goblin Boss", powers: [slash]}},
        listings: {unit_types: ["unit_types/goblin-boss.json", "unit_types/goblin-boss.full.json", "unit_types/goblin-raider.json"]},
      });
      fireEvent.click(screen.getByRole("button", {name: "+ Import power"}));

      fireEvent.change(screen.getByRole("combobox", {name: "Source type"}), {target: {value: "unitType"}});
      const source = await screen.findByRole("combobox", {name: "Source"});
      await waitFor(() => expect(within(source).getAllByRole("option").map((o) => o.textContent)).toEqual(["— pick one —", "goblin-boss"]));
      fireEvent.change(source, {target: {value: "unit_types/goblin-boss.json"}});
      await screen.findByText("Slash");
      fireEvent.click(screen.getByRole("button", {name: "Import"}));

      expect(previewPowers()).toEqual([slash]);
    });
  });

  describe("validate then save", () => {
    beforeEach(() => {
      commitFiles.mockReset();
      validateUnitType.mockReset();
    });

    it("disables Save until Validate passes, and again after an edit", async () => {
      validateUnitType.mockResolvedValue({valid: true});
      await renderReady();
      expect(screen.getByRole("button", {name: "Save"})).toBeDisabled();

      fireEvent.click(screen.getByRole("button", {name: "Validate"}));
      await waitFor(() => expect(screen.getByRole("button", {name: "Save"})).not.toBeDisabled());

      fireEvent.change(screen.getByDisplayValue("Goblin Raider"), {target: {value: "Goblin Brute"}});
      expect(screen.getByRole("button", {name: "Save"})).toBeDisabled();
    });

    it("validates the draft itself, since its powers are already inline", async () => {
      validateUnitType.mockResolvedValue({valid: true});
      await renderReady({...initialUnitType, powers: [slash]});

      fireEvent.click(screen.getByRole("button", {name: "Validate"}));

      await waitFor(() => expect(validateUnitType).toHaveBeenCalledWith({...initialUnitType, powers: [slash]}));
    });

    it("shows the validation error and keeps Save disabled when invalid", async () => {
      validateUnitType.mockResolvedValue({valid: false, error: {message: "tokenRadius must be between 1.0 and 20.0", path: "$.tokenRadius"}});
      await renderReady();

      fireEvent.click(screen.getByRole("button", {name: "Validate"}));

      await screen.findByText("tokenRadius must be between 1.0 and 20.0");
      expect(screen.getByRole("button", {name: "Save"})).toBeDisabled();
    });

    it("commits just unit_types/<key>.json, with expanded powers", async () => {
      const withRef = {...initialUnitType, powers: [{$ref: "../abilities/units/goblins/slash.json", referenceTo: "ability"}]};
      await renderReady(withRef, {files: {"abilities/units/goblins/slash.json": slash}});

      await validateAndSave();

      expect(commitFiles).toHaveBeenCalledWith(
        {"unit_types/goblin-raider.json": {...initialUnitType, powers: [slash]}},
        {message: "Update Goblin Raider"}
      );
    });

    it("deletes a leftover .full.json in the same commit, only once", async () => {
      await renderReady(initialUnitType, {listings: {unit_types: ["unit_types/goblin-raider.json", "unit_types/goblin-raider.full.json"]}});

      await validateAndSave();
      expect(commitFiles).toHaveBeenLastCalledWith(
        {"unit_types/goblin-raider.json": initialUnitType, "unit_types/goblin-raider.full.json": null},
        {message: "Update Goblin Raider"}
      );

      fireEvent.change(screen.getByDisplayValue("Goblin Raider"), {target: {value: "Goblin Brute"}});
      await validateAndSave();
      expect(commitFiles).toHaveBeenLastCalledWith(
        {"unit_types/goblin-raider.json": {...initialUnitType, name: "Goblin Brute"}},
        {message: "Update Goblin Brute"}
      );
    });

    it("commits an uploaded power icon at the power's iconURL path", async () => {
      const {container} = await renderReady({...initialUnitType, powers: [{...slash, iconURL: "../graphics/icons/slash.png"}]});
      fireEvent.click(areaList().getByRole("button", {name: /Slash/}));
      const file = new File(["png"], "slash.png", {type: "image/png"});
      URL.createObjectURL = vi.fn(() => "blob:slash");
      URL.revokeObjectURL = vi.fn();

      fireEvent.change(container.querySelector(".content-editor-fields input[type=file]"), {target: {files: [file]}});
      await validateAndSave();

      expect(commitFiles).toHaveBeenCalledWith(expect.objectContaining({"graphics/icons/slash.png": file}), expect.anything());
    });

    it("redirects instead of showing an error when GitHub auth is required", async () => {
      await renderReady();
      validateUnitType.mockResolvedValue({valid: true});
      commitFiles.mockRejectedValue(new CommitGithubAuthError("reauth_required", "/github/reauth"));
      fireEvent.click(screen.getByRole("button", {name: "Validate"}));
      await waitFor(() => expect(screen.getByRole("button", {name: "Save"})).not.toBeDisabled());
      fireEvent.click(screen.getByRole("button", {name: "Save"}));
      fireEvent.click(screen.getByRole("button", {name: "Commit"}));

      await waitFor(() => expect(redirectTo).toHaveBeenCalledWith("/github/reauth"));
    });
  });

  describe("token images", () => {
    beforeEach(() => {
      commitFiles.mockReset();
      validateUnitType.mockReset();
    });

    function upload(slot, file) {
      fireEvent.click(screen.getByRole("button", {name: `Token image ${slot}`}));
      fireEvent.change(screen.getByLabelText(`Upload Token image ${slot}`), {target: {files: [file]}});
    }

    it("uploading a file fills in the slot's path and commits the file on save", async () => {
      await renderReady();

      fireEvent.click(screen.getByRole("button", {name: "+ Add token image"}));
      const file = new File(["fake"], "raider.webp", {type: "image/webp"});
      upload(1, file);
      await waitFor(() => expect(screen.getByRole("button", {name: "Token image 1"})).toHaveTextContent("raider.webp"));

      await validateAndSave();
      expect(commitFiles).toHaveBeenCalledWith(expect.objectContaining({"tokens/unit/raider.webp": file}), {message: "Update Goblin Raider"});
    });

    it("previews an unsaved upload from its local URL, alongside resolved saved tokens", async () => {
      await renderReady({...initialUnitType, tokenImageUrl: ["../tokens/unit/first.webp"]});
      URL.createObjectURL = vi.fn(() => "blob:second");
      URL.revokeObjectURL = vi.fn();

      fireEvent.click(screen.getByRole("button", {name: "+ Add token image"}));
      upload(2, new File(["x"], "second.webp"));

      await waitFor(() => expect(JSON.parse(screen.getByTestId("preview-powers").dataset.tokens)).toEqual({
        "../tokens/unit/first.webp": "https://raw.githubusercontent.com/mock/tokens/unit/first.webp",
        "../tokens/unit/second.webp": "blob:second",
      }));
    });

    it("picking an existing token image sets the slot's path without staging an upload", async () => {
      await renderReady(initialUnitType, {listings: {"tokens/unit": ["tokens/unit/goblin-1.webp", "tokens/unit/goblin-2.webp"]}});

      fireEvent.click(screen.getByRole("button", {name: "+ Add token image"}));
      fireEvent.click(screen.getByRole("button", {name: "Token image 1"}));
      fireEvent.click(await screen.findByRole("button", {name: "goblin-1.webp"}));
      expect(screen.getByRole("button", {name: "Token image 1"})).toHaveTextContent("goblin-1.webp");

      await validateAndSave();
      expect(commitFiles).toHaveBeenCalledWith(
        {"unit_types/goblin-raider.json": {...initialUnitType, tokenImageUrl: ["../tokens/unit/goblin-1.webp"]}},
        {message: "Update Goblin Raider"}
      );
    });

    it("commits only uploads a slot still points at", async () => {
      await renderReady({...initialUnitType, tokenImageUrl: ["../tokens/unit/first.webp"]});

      fireEvent.click(screen.getByRole("button", {name: "+ Add token image"}));
      const kept = new File(["fake"], "second.webp", {type: "image/webp"});
      upload(2, kept);
      await waitFor(() => expect(screen.getByRole("button", {name: "Token image 2"})).toHaveTextContent("second.webp"));
      fireEvent.click(screen.getByRole("button", {name: "+ Add token image"}));
      upload(3, new File(["fake"], "dropped.webp", {type: "image/webp"}));
      await waitFor(() => expect(screen.getByRole("button", {name: "Token image 3"})).toHaveTextContent("dropped.webp"));
      fireEvent.click(screen.getByRole("button", {name: "Token image 3"}));
      fireEvent.click(screen.getByRole("button", {name: "Clear"}));

      await validateAndSave();
      const committed = commitFiles.mock.calls[0][0];
      expect(committed["tokens/unit/second.webp"]).toBe(kept);
      expect(committed).not.toHaveProperty("tokens/unit/dropped.webp");
    });
  });

  describe("estimating damage", () => {
    const matrix = {results: [{gearingPlan: "offense", elevation: 0, dps: 3.9, ttdSeconds: 40.0}]};

    async function openEstimate() {
      fireEvent.click(areaList().getByRole("button", {name: /Damage estimate/}));
    }

    it("posts the draft and shows the matrix", async () => {
      estimateDamage.mockResolvedValue(matrix);
      await renderReady();
      await openEstimate();

      fireEvent.click(screen.getByRole("button", {name: "Estimate damage"}));

      await screen.findByText("3.9 dps");
      expect(estimateDamage).toHaveBeenCalledWith(expect.objectContaining({name: "Goblin Raider"}));
    });

    it("shows the error when the estimate fails", async () => {
      estimateDamage.mockRejectedValue(new Error("game server unavailable"));
      await renderReady();
      await openEstimate();

      fireEvent.click(screen.getByRole("button", {name: "Estimate damage"}));

      await screen.findByText("game server unavailable");
    });

    it("drops a shown estimate once the draft is edited", async () => {
      estimateDamage.mockResolvedValue(matrix);
      await renderReady();
      await openEstimate();
      fireEvent.click(screen.getByRole("button", {name: "Estimate damage"}));
      await screen.findByText("3.9 dps");

      fireEvent.click(areaList().getByRole("button", {name: /Goblin Raider/}));
      fireEvent.change(screen.getByDisplayValue("Goblin Raider"), {target: {value: "Goblin Brute"}});
      await openEstimate();

      expect(screen.queryByText("3.9 dps")).not.toBeInTheDocument();
    });
  });
});
