import {describe, it, expect, vi, beforeEach, afterEach} from "vitest";
import {redirectTo} from "../../redirectTo";
import {render, screen, fireEvent, waitFor, within} from "@testing-library/react";
import ClassEditor from "../ClassEditor";
import {commitFiles, GithubAuthError as CommitGithubAuthError} from "../../github/commitFiles";
import {GithubClient} from "../../github/delve-github";
import {publishClass} from "../publishClass";
import {validateCharacterClass} from "../../validators/validateContent";
import {estimateClassDps} from "../estimateClassDps";
import {estimateClassTtd} from "../estimateClassTtd";

vi.mock("../../github/commitFiles", async (importOriginal) => {
  const actual = await importOriginal();
  return {...actual, commitFiles: vi.fn()};
});

vi.mock("../../github/delve-github", async (importOriginal) => {
  const actual = await importOriginal();
  return {...actual, GithubClient: vi.fn()};
});

// One branch, "main" (see useEditorBranch).
vi.mock("../../github/useEditorBranch", () => ({
  useEditorBranch: () => ({branches: ["main"], branch: "main", select: vi.fn(), create: vi.fn(), error: null}),
}));

vi.mock("../../redirectTo", () => ({redirectTo: vi.fn()}));
vi.mock("../../validators/validateContent", () => ({
  validateCharacterClass: vi.fn(),
}));
vi.mock("../estimateClassDps", () => ({estimateClassDps: vi.fn()}));
vi.mock("../estimateClassTtd", () => ({estimateClassTtd: vi.fn()}));
vi.mock("../publishClass", () => ({publishClass: vi.fn()}));

// ClassPreviewPane mounts a real Three.js WebGLRenderer via
// AbilityPreviewCanvas, which jsdom can't back - stub it, exposing the
// powers it was given.
vi.mock("../ClassPreviewPane", () => ({
  default: ({powers}) => <div data-testid="preview-powers">{JSON.stringify(powers)}</div>,
}));

const initialClass = {
  name: "Puncher", description: "", colors: {major: "888888", minor: "CCCCCC"},
  resources: [], powers: [], primaryStats: [], statPriorities: [], wields: [],
};

const punch = {name: "Punch", maxRange: 5, effects: []};
const kick = {name: "Kick", maxRange: 5, effects: []};
const stockAssets = {icons: {}, graphics: {}, sounds: {}};

function mockRepo({files = {}, listings = {}} = {}) {
  const client = {
    headSha: vi.fn().mockResolvedValue("head-sha"),
    fetchFile: vi.fn((path) => Promise.resolve(path in files ? JSON.stringify(files[path]) : null)),
    listDirectory: vi.fn((path) => Promise.resolve(listings[path] ?? [])),
    assetUrl: vi.fn((path) => Promise.resolve(`https://raw.githubusercontent.com/mock/${path}`)),
  };
  GithubClient.mockImplementation(function () { return client; });
  return client;
}

async function renderReady(classData = initialClass, repo = {}) {
  mockRepo({...repo, files: {"classes/puncher.json": classData, ...repo.files}});
  const result = render(<ClassEditor classKey="puncher" stockAssets={stockAssets} backUrl="/build/classes" />);
  await screen.findByDisplayValue(classData.name);
  return result;
}

function areaList() {
  return within(screen.getByRole("navigation", {name: "Class areas"}));
}

function breadcrumbs() {
  return within(screen.getByRole("navigation", {name: "Breadcrumb"}));
}

function previewPowers() {
  return JSON.parse(screen.getByTestId("preview-powers").textContent);
}

async function validateAndSave() {
  validateCharacterClass.mockResolvedValue({valid: true});
  commitFiles.mockResolvedValue({commitSha: "abc123", branch: "main"});
  fireEvent.click(screen.getByRole("button", {name: "Validate"}));
  await waitFor(() => expect(screen.getByRole("button", {name: "Save"})).not.toBeDisabled());
  fireEvent.click(screen.getByRole("button", {name: "Save"}));
  fireEvent.click(screen.getByRole("button", {name: "Commit"}));
  await waitFor(() => expect(screen.getByText("Saved.")).toBeInTheDocument());
}

describe("ClassEditor", () => {
  afterEach(() => vi.clearAllMocks());

  describe("loading", () => {
    it("shows a loading state, then the class's fields once the fetch resolves", async () => {
      let resolveFetch;
      GithubClient.mockImplementation(function () {
        return {headSha: vi.fn().mockResolvedValue("head-sha"), fetchFile: vi.fn(() => new Promise((resolve) => (resolveFetch = resolve))), listDirectory: vi.fn().mockResolvedValue([])};
      });

      render(<ClassEditor classKey="puncher" stockAssets={stockAssets} />);
      expect(screen.getByText("Loading…")).toBeInTheDocument();

      await vi.waitFor(() => expect(resolveFetch).toBeTypeOf("function")); // after the head sha
      resolveFetch(JSON.stringify(initialClass));
      await screen.findByDisplayValue("Puncher");
    });

    it("falls back to a blank class when the file doesn't exist yet", async () => {
      mockRepo();
      render(<ClassEditor classKey="druid" stockAssets={stockAssets} />);

      await screen.findByDisplayValue("Druid");
    });

    it("shows a load error when the fetch fails", async () => {
      GithubClient.mockImplementation(function () { return {headSha: vi.fn().mockResolvedValue("head-sha"), fetchFile: vi.fn().mockRejectedValue(new Error("network down"))}; });

      render(<ClassEditor classKey="puncher" stockAssets={stockAssets} />);

      await screen.findByText(/Failed to load: network down/);
    });

    it("redirects to the GitHub reauth URL when the load hits a GithubAuthError", async () => {
      GithubClient.mockImplementation(function () { return {headSha: vi.fn().mockResolvedValue("head-sha"), fetchFile: vi.fn().mockRejectedValue(new CommitGithubAuthError("reauth_required", "/github/reauth"))}; });

      render(<ClassEditor classKey="puncher" stockAssets={stockAssets} />);

      await waitFor(() => expect(redirectTo).toHaveBeenCalledWith("/github/reauth"));
    });

    it("expands $ref powers into inline copies on load", async () => {
      const withRef = {...initialClass, powers: [{$ref: "../abilities/classes/puncher/punch.json", referenceTo: "ability"}]};
      await renderReady(withRef, {files: {"abilities/classes/puncher/punch.json": punch}});

      expect(previewPowers()).toEqual([punch]);
    });
  });

  describe("the class pane", () => {
    it("flows a name edit into the draft and the area list", async () => {
      await renderReady();

      fireEvent.change(screen.getByDisplayValue("Puncher"), {target: {value: "Brawler"}});

      expect(areaList().getByRole("button", {name: /Brawler/})).toBeInTheDocument();
    });

    it("caps resources at 3", async () => {
      await renderReady({...initialClass, resources: [{name: "a"}, {name: "b"}]});

      fireEvent.click(screen.getByRole("button", {name: "+ Add resource"}));

      expect(screen.getByRole("button", {name: "+ Add resource"})).toBeDisabled();
    });
  });

  describe("action bar", () => {
    it("lists powers in slot order with a slot count", async () => {
      await renderReady({...initialClass, powers: [punch, kick]});

      expect(areaList().getByText("2/10")).toBeInTheDocument();
      expect(areaList().getByRole("button", {name: /1\. Punch/})).toBeInTheDocument();
      expect(areaList().getByRole("button", {name: /2\. Kick/})).toBeInTheDocument();
    });

    it("reorders powers with the arrow buttons, keeping the moved power selected", async () => {
      await renderReady({...initialClass, powers: [punch, kick]});
      fireEvent.click(areaList().getByRole("button", {name: /2\. Kick/}));

      fireEvent.click(areaList().getByRole("button", {name: "Move Kick up"}));

      expect(previewPowers().map((p) => p.name)).toEqual(["Kick", "Punch"]);
      expect(breadcrumbs().getByText("Kick")).toHaveAttribute("aria-current", "page");
    });

    it("adds a blank power and opens it", async () => {
      await renderReady();

      fireEvent.click(screen.getByRole("button", {name: "+ New power"}));

      expect(previewPowers()).toHaveLength(1);
      expect(breadcrumbs().getByText("New Power")).toHaveAttribute("aria-current", "page");
    });

    it("disables adding powers once all 10 slots are full", async () => {
      await renderReady({...initialClass, powers: Array.from({length: 10}, (_, i) => ({name: `P${i}`, effects: []}))});

      expect(screen.getByRole("button", {name: "+ New power"})).toBeDisabled();
      expect(screen.getByRole("button", {name: "+ Import power"})).toBeDisabled();
    });

    it("edits and removes a power", async () => {
      await renderReady({...initialClass, powers: [punch]});
      fireEvent.click(areaList().getByRole("button", {name: /1\. Punch/}));

      fireEvent.change(screen.getByDisplayValue("Punch"), {target: {value: "Jab"}});
      expect(previewPowers()[0].name).toBe("Jab");

      fireEvent.click(screen.getByRole("button", {name: "Remove power"}));
      expect(previewPowers()).toEqual([]);
      expect(screen.getByDisplayValue("Puncher")).toBeInTheDocument();
    });

    it("imports a power from another class", async () => {
      await renderReady(initialClass, {
        files: {"classes/demo.json": {name: "Demo", powers: [kick]}},
        listings: {classes: ["classes/demo.json", "classes/demo.full.json", "classes/puncher.json"]},
      });
      fireEvent.click(screen.getByRole("button", {name: "+ Import power"}));

      fireEvent.change(screen.getByRole("combobox", {name: "Source type"}), {target: {value: "class"}});
      const source = await screen.findByRole("combobox", {name: "Source"});
      await within(source).findByRole("option", {name: "demo"});
      fireEvent.change(source, {target: {value: "classes/demo.json"}});
      await screen.findByText("Kick");
      fireEvent.click(screen.getByRole("button", {name: "Import"}));

      expect(previewPowers()).toEqual([kick]);
    });
  });

  describe("passives", () => {
    it("adds a passive and edits it as a status", async () => {
      await renderReady();

      fireEvent.click(screen.getByRole("button", {name: "+ New passive"}));
      expect(breadcrumbs().getByText("New Passive")).toHaveAttribute("aria-current", "page");

      fireEvent.change(screen.getByDisplayValue("New Passive"), {target: {value: "Thick Hide"}});
      expect(areaList().getByRole("button", {name: /Thick Hide/})).toBeInTheDocument();
    });

    it("removes a passive", async () => {
      await renderReady({...initialClass, passives: [{name: "Thick Hide", shortName: "Hide", treatAs: "inherent", stacking: "replace", effects: []}]});
      fireEvent.click(areaList().getByRole("button", {name: /Thick Hide/}));

      fireEvent.click(screen.getByRole("button", {name: "Remove passive"}));

      expect(areaList().queryByRole("button", {name: /Thick Hide/})).not.toBeInTheDocument();
    });
  });

  describe("DPS estimate", () => {
    it("posts the draft and the strategy", async () => {
      estimateClassDps.mockResolvedValue({results: [{durationSeconds: 60, elevation: 0, elevationLabel: "heroic", dps: 12.5}]});
      await renderReady({...initialClass, powers: [punch]});
      fireEvent.click(areaList().getByRole("button", {name: /DPS and survivability/}));

      fireEvent.click(screen.getByRole("button", {name: "Estimate DPS"}));

      await screen.findByText("12.5 dps");
      expect(estimateClassDps).toHaveBeenCalledWith({...initialClass, powers: [punch]}, []);
    });

    it("posts the draft and the strategy for the survivability estimate", async () => {
      estimateClassTtd.mockResolvedValue({results: [{priority: "dps", intendedFor: "open", pull: "solo", school: "physical", elevation: 0, hpLostPct: 21, ttd: 58, survives: false, died: false, capSeconds: 300}]});
      await renderReady({...initialClass, powers: [punch]});
      fireEvent.click(areaList().getByRole("button", {name: /DPS and survivability/}));

      fireEvent.click(screen.getByRole("button", {name: "Estimate survivability"}));

      await screen.findByText("58.0s");
      expect(estimateClassTtd).toHaveBeenCalledWith({...initialClass, powers: [punch]}, []);
    });
  });

  describe("validate then save", () => {
    beforeEach(() => {
      commitFiles.mockReset();
      validateCharacterClass.mockReset();
    });

    it("disables Save until Validate passes, and again after an edit", async () => {
      validateCharacterClass.mockResolvedValue({valid: true});
      await renderReady();
      expect(screen.getByRole("button", {name: "Save"})).toBeDisabled();

      fireEvent.click(screen.getByRole("button", {name: "Validate"}));
      await waitFor(() => expect(screen.getByRole("button", {name: "Save"})).not.toBeDisabled());

      fireEvent.change(screen.getByDisplayValue("Puncher"), {target: {value: "Brawler"}});
      expect(screen.getByRole("button", {name: "Save"})).toBeDisabled();
    });

    it("shows the validation error and keeps Save disabled when invalid", async () => {
      validateCharacterClass.mockResolvedValue({valid: false, error: {message: "resources must have at least 1 entry", path: "$.resources"}});
      await renderReady();

      fireEvent.click(screen.getByRole("button", {name: "Validate"}));

      await screen.findByText("resources must have at least 1 entry");
      expect(screen.getByRole("button", {name: "Save"})).toBeDisabled();
    });

    it("commits classes/<key>.json with expanded powers, deleting a leftover .full.json", async () => {
      const withRef = {...initialClass, powers: [{$ref: "../abilities/classes/puncher/punch.json", referenceTo: "ability"}]};
      await renderReady(withRef, {
        files: {"abilities/classes/puncher/punch.json": punch},
        listings: {classes: ["classes/puncher.json", "classes/puncher.full.json"]},
      });

      await validateAndSave();

      expect(commitFiles).toHaveBeenCalledWith(
        {"classes/puncher.json": {...initialClass, powers: [punch]}, "classes/puncher.full.json": null},
        {message: "Update Puncher", branch: "main"}
      );
    });

    it("redirects instead of showing an error when GitHub auth is required", async () => {
      await renderReady();
      validateCharacterClass.mockResolvedValue({valid: true});
      commitFiles.mockRejectedValue(new CommitGithubAuthError("reauth_required", "/github/reauth"));
      fireEvent.click(screen.getByRole("button", {name: "Validate"}));
      await waitFor(() => expect(screen.getByRole("button", {name: "Save"})).not.toBeDisabled());
      fireEvent.click(screen.getByRole("button", {name: "Save"}));
      fireEvent.click(screen.getByRole("button", {name: "Commit"}));

      await waitFor(() => expect(redirectTo).toHaveBeenCalledWith("/github/reauth"));
    });
  });

  describe("publishing", () => {
    beforeEach(() => {
      publishClass.mockReset();
      publishClass.mockImplementation(async (_url, version) => ({identifier: "puncher", version}));
    });

    async function renderPublishable() {
      mockRepo({files: {"classes/puncher.json": initialClass}});
      render(<ClassEditor classKey="puncher" stockAssets={stockAssets} publishUrl="/build/classes/puncher/publish" nextVersion="0.6" />);
      await screen.findByDisplayValue("Puncher");
    }

    function publish(version) {
      fireEvent.click(screen.getByRole("button", {name: "Publish"}));
      if (version) fireEvent.change(screen.getByRole("textbox", {name: "Version"}), {target: {value: version}});
      fireEvent.submit(screen.getByRole("textbox", {name: "Version"}).closest("form"));
    }

    it("has no Publish button without a publish URL", async () => {
      await renderReady();
      expect(screen.queryByRole("button", {name: "Publish"})).not.toBeInTheDocument();
    });

    it("publishes the loaded commit at the suggested version, then suggests the next one", async () => {
      await renderPublishable();

      fireEvent.click(screen.getByRole("button", {name: "Publish"}));
      expect(screen.getByRole("textbox", {name: "Version"})).toHaveValue("0.6");
      fireEvent.submit(screen.getByRole("textbox", {name: "Version"}).closest("form"));

      await screen.findByText("Published puncher 0.6.");
      expect(publishClass).toHaveBeenCalledWith("/build/classes/puncher/publish", "0.6", {branch: "main", expectedSha: "head-sha"});
      fireEvent.click(screen.getByRole("button", {name: "Publish"}));
      expect(screen.getByRole("textbox", {name: "Version"})).toHaveValue("0.7");
    });

    it("is blocked while there are unsaved changes", async () => {
      await renderPublishable();
      fireEvent.change(screen.getByDisplayValue("Puncher"), {target: {value: "Brawler"}});
      expect(screen.getByRole("button", {name: "Publish"})).toBeDisabled();
      expect(screen.getByRole("button", {name: "Publish"})).toHaveAttribute("title", "Save first");
    });

    it("is allowed again once the draft matches the commit, without saving", async () => {
      await renderPublishable();
      fireEvent.change(screen.getByDisplayValue("Puncher"), {target: {value: "Brawler"}});
      fireEvent.change(screen.getByDisplayValue("Brawler"), {target: {value: "Puncher"}});
      expect(screen.getByRole("button", {name: "Publish"})).not.toBeDisabled();
    });

    it("publishes the commit it just saved", async () => {
      commitFiles.mockReset();
      commitFiles.mockResolvedValue({commitSha: "saved-sha", branch: "main"});
      validateCharacterClass.mockResolvedValue({valid: true});
      await renderPublishable();
      fireEvent.change(screen.getByDisplayValue("Puncher"), {target: {value: "Brawler"}});
      fireEvent.click(screen.getByRole("button", {name: "Validate"}));
      await waitFor(() => expect(screen.getByRole("button", {name: "Save"})).not.toBeDisabled());
      fireEvent.click(screen.getByRole("button", {name: "Save"}));
      fireEvent.click(screen.getByRole("button", {name: "Commit"}));
      await waitFor(() => expect(screen.getByRole("button", {name: "Publish"})).not.toBeDisabled());

      publish("1.0");

      await screen.findByText("Published puncher 1.0.");
      expect(publishClass).toHaveBeenCalledWith("/build/classes/puncher/publish", "1.0", {branch: "main", expectedSha: "saved-sha"});
    });

    it("shows Rails' error", async () => {
      publishClass.mockRejectedValue(new Error("puncher 0.6 is already published."));
      await renderPublishable();
      publish();
      await screen.findByText("puncher 0.6 is already published.");
    });
  });
});
