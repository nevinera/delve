import {describe, it, expect, vi, beforeEach, afterEach} from "vitest";
import {render, screen, fireEvent, waitFor, act, within} from "@testing-library/react";
import WorldBuilderApp from "../WorldBuilderApp";
import {createDraftStore, memoryBackend, draftKey} from "../state/draftStore";
import {RepoSnapshot} from "../state/RepoSnapshot";
import {WorldDraft} from "../state/WorldDraft";
import {fixtureJson} from "../state/__tests__/fixtureWorld";
import * as commitModule from "../../github/commitFiles";
import * as validators from "../../validators/validateContent";
import * as publishModule from "../../worldEditor/publishWorld";
import * as redirectModule from "../../redirectTo";

// A fake BranchClient over in-memory branches: {branch: {path: json}}.
function fakeClient(branchFiles) {
  let commit = 0;
  const heads = Object.fromEntries(Object.keys(branchFiles).map((b) => [b, `${b}-c${commit}`]));
  const json = (branch) => branchFiles[branch];
  return {
    repo: vi.fn().mockResolvedValue("o/content"),
    listBranches: vi.fn(async () => Object.keys(branchFiles)),
    defaultBranch: vi.fn().mockResolvedValue("main"),
    createBranch: vi.fn(async (name) => {
      branchFiles[name] = {...branchFiles.main};
      heads[name] = `${name}-c0`;
    }),
    headSha: vi.fn(async (branch) => heads[branch]),
    snapshot: vi.fn(async (sha, dir) => {
      const branch = Object.keys(heads).find((b) => heads[b] === sha);
      const files = Object.fromEntries(Object.keys(json(branch)).filter((p) => p.startsWith(`${dir}/`)).map((p) => [p, {sha: `${branch}:${p}`, size: 1}]));
      return {commitSha: sha, files};
    }),
    readBlobText: vi.fn(async (blobSha) => {
      const [branch, path] = blobSha.split(/:(.*)/s);
      return JSON.stringify(json(branch)[path]);
    }),
    _advance(branch, files) {
      branchFiles[branch] = files;
      heads[branch] = `${branch}-c${++commit}`;
    },
  };
}

const zoneButton = async (name) => within(await screen.findByRole("region", {name: "Zones"})).getByRole("button", {name: new RegExp(`^${name}`)});

function renderApp({branches = {main: fixtureJson()}, store = createDraftStore(memoryBackend()), worldKey = "w", publishUrl = "/publish/w"} = {}) {
  const client = fakeClient(branches);
  render(<WorldBuilderApp worldKey={worldKey} backUrl="/build/worlds" publishUrl={publishUrl} nextTag="w/v1" client={client} store={store} />);
  return {client, store};
}

beforeEach(() => {
  window.location.hash = "";
  window.localStorage.clear();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("WorldBuilderApp", () => {
  it("loads the world from the default branch and lists its zones", async () => {
    renderApp();

    expect(await zoneButton("Forest")).toBeInTheDocument();
    expect(screen.getByRole("navigation", {name: "Breadcrumb"})).toHaveTextContent("W");
    expect(screen.getByRole("combobox", {name: "Branch"})).toHaveValue("main");
    expect(screen.getByText("No unsaved changes")).toBeInTheDocument();
  });

  it("drills into a zone, mirrored into the URL, and back up through the breadcrumb", async () => {
    renderApp();

    fireEvent.click(await zoneButton("Forest"));

    expect(window.location.hash).toEqual("#/zone/forest");
    const crumbs = screen.getByRole("navigation", {name: "Breadcrumb"});
    expect(crumbs).toHaveTextContent("W›Forest");

    fireEvent.click(screen.getByRole("button", {name: "W"}));
    expect(await zoneButton("Forest")).toBeInTheDocument();
  });

  it("opens on the zone the URL names", async () => {
    window.location.hash = "#/zone/cave";
    renderApp();

    expect(await screen.findByRole("navigation", {name: "Breadcrumb"})).toHaveTextContent("W›Cave");
  });

  it("uses the remembered branch when it still exists", async () => {
    window.localStorage.setItem("delve.worldEditor.branch", "world-editor");
    renderApp({branches: {main: {}, "world-editor": fixtureJson()}});

    expect(await zoneButton("Forest")).toBeInTheDocument();
    expect(screen.getByRole("combobox", {name: "Branch"})).toHaveValue("world-editor");
  });

  it("offers to create a world the branch doesn't have", async () => {
    renderApp({worldKey: "fresh"});

    fireEvent.change(await screen.findByRole("textbox", {name: "World name"}), {target: {value: "Fresh World"}});
    fireEvent.click(screen.getByRole("button", {name: "Create world"}));

    expect(within(await screen.findByRole("region", {name: "Zones"})).getByText("No zones yet.")).toBeInTheDocument();
    expect(screen.getByText("2 unsaved files")).toBeInTheDocument();
    expect(screen.getByRole("combobox", {name: "Branch"})).toBeDisabled();
  });

  it("offers back a draft this browser kept, and applies it on resume", async () => {
    const store = createDraftStore(memoryBackend());
    const snapshot = new RepoSnapshot({worldKey: "w", branch: "main", commitSha: "main-c0", files: {}, json: {}});
    const kept = WorldDraft.fromSnapshot(snapshot).write("worlds/w/zones/forest/forest.json", {...fixtureJson()["worlds/w/zones/forest/forest.json"], name: "Deep Forest"});
    await store.save(draftKey("o/content", "main", "w"), kept);

    renderApp({store});

    fireEvent.click(await screen.findByRole("button", {name: "Resume"}));

    expect(await screen.findByText("1 unsaved file")).toBeInTheDocument();
  });

  it("discards a kept draft on request", async () => {
    const store = createDraftStore(memoryBackend());
    const key = draftKey("o/content", "main", "w");
    const snapshot = new RepoSnapshot({worldKey: "w", branch: "main", commitSha: "main-c0", files: {}, json: {}});
    await store.save(key, WorldDraft.fromSnapshot(snapshot).write("worlds/w/x.json", {}));

    renderApp({store});
    fireEvent.click(await screen.findByRole("button", {name: "Discard them"}));

    expect(await screen.findByText("No unsaved changes")).toBeInTheDocument();
    expect(await store.load(key)).toBeNull();
  });

  it("keeps edits in local storage as they happen", async () => {
    const {store} = renderApp({worldKey: "fresh"});

    fireEvent.click(await screen.findByRole("button", {name: "Create world"}));

    await waitFor(async () => expect(await store.load(draftKey("o/content", "main", "fresh"))).not.toBeNull());
  });

  it("saves the changes as one commit on the branch, then clears the kept draft", async () => {
    const store = createDraftStore(memoryBackend());
    const {client} = renderApp({worldKey: "fresh", store});
    vi.spyOn(commitModule, "commitFiles").mockImplementation(async (files, {branch}) => {
      client._advance(branch, files);
      return {commitSha: "main-c1", branch};
    });

    fireEvent.click(await screen.findByRole("button", {name: "Create world"}));
    fireEvent.click(screen.getByRole("button", {name: "Save"}));
    fireEvent.change(screen.getByRole("textbox", {name: "Commit message"}), {target: {value: "Start Fresh"}});
    await act(async () => fireEvent.click(screen.getByRole("button", {name: "Commit"})));

    expect(commitModule.commitFiles).toHaveBeenCalledWith(
      expect.objectContaining({"worlds/fresh/fresh.json": expect.objectContaining({name: "fresh"})}),
      expect.objectContaining({message: "Start Fresh", branch: "main", parentSha: "main-c0"})
    );
    expect(await screen.findByText("No unsaved changes")).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("Saved");
    expect(await store.load(draftKey("o/content", "main", "fresh"))).toBeNull();
  });

  it("reports a failed save and keeps the changes", async () => {
    renderApp({worldKey: "fresh"});
    vi.spyOn(commitModule, "commitFiles").mockRejectedValue(new Error("not a fast forward"));

    fireEvent.click(await screen.findByRole("button", {name: "Create world"}));
    fireEvent.click(screen.getByRole("button", {name: "Save"}));
    await act(async () => fireEvent.click(screen.getByRole("button", {name: "Commit"})));

    expect(screen.getByRole("status")).toHaveTextContent("Save failed: not a fast forward");
    expect(screen.getByText("2 unsaved files")).toBeInTheDocument();
  });

  it("creates a branch and switches to it, remembering the choice", async () => {
    const {client} = renderApp();

    fireEvent.change(await screen.findByRole("combobox", {name: "Branch"}), {target: {value: "\0create"}});
    fireEvent.change(screen.getByRole("textbox", {name: "New branch name"}), {target: {value: "rework"}});
    fireEvent.click(screen.getByRole("button", {name: "Create"}));

    await waitFor(() => expect(screen.getByRole("combobox", {name: "Branch"})).toHaveValue("rework"));
    expect(client.createBranch).toHaveBeenCalledWith("rework");
    expect(window.localStorage.getItem("delve.worldEditor.branch")).toEqual("rework");
  });

describe("WorldBuilderApp pipeline", () => {
  // The fixture without asset references, so it validates cleanly with
  // JSON-only fake branches.
  function assetFreeJson() {
    const json = fixtureJson();
    const hub = json["worlds/w/zones/forest/hub/hub.json"];
    delete hub.imageUrl;
    delete hub.thumbnailUrl;
    json["worlds/w/unit_types/goblin.json"] = {name: "Goblin"};
    json["worlds/w/unit_types/archer.json"] = {name: "Archer"};
    json["worlds/w/items/iron-ring.json"] = {identifier: "iron-ring"};
    return json;
  }

  const button = (name) => screen.getByRole("button", {name});

  beforeEach(() => {
    vi.spyOn(validators, "validateZone").mockResolvedValue({valid: true});
    vi.spyOn(validators, "validateWorld").mockResolvedValue({valid: true});
    vi.spyOn(validators, "validateWorldReferences").mockResolvedValue({valid: true});
  });

  it("lists validation problems, each leading to where they are", async () => {
    validators.validateZone.mockImplementation(async (zone) => (zone.name === "Cave" ? {valid: false, error: {message: "bad elvl"}} : {valid: true}));
    renderApp({branches: {main: assetFreeJson()}});

    await screen.findByRole("button", {name: "Validate"});
    await act(async () => fireEvent.click(button("Validate")));

    expect(screen.getByText("1 validation problem")).toBeInTheDocument();
    fireEvent.click(button("worlds/w/zones/cave/cave.json"));
    expect(window.location.hash).toEqual("#/zone/cave");
  });

  it("gates Expand on a passing Validate of the saved content, and Publish on Expand", async () => {
    const {client} = renderApp({branches: {main: assetFreeJson()}});
    const commit = vi.spyOn(commitModule, "commitFiles").mockImplementation(async (files, {branch}) => {
      client._advance(branch, {...assetFreeJson(), ...files});
      return {commitSha: "next"};
    });
    await screen.findByRole("button", {name: "Validate"});

    expect(button("Expand")).toBeDisabled();
    expect(button("Expand")).toHaveAttribute("title", "Validate first");
    expect(button("Publish")).toHaveAttribute("title", "Validate first");

    await act(async () => fireEvent.click(button("Validate")));
    expect(screen.getByRole("status")).toHaveTextContent("Valid.");
    expect(button("Expand")).toBeEnabled();
    expect(button("Publish")).toHaveAttribute("title", "Expand first");

    await act(async () => fireEvent.click(button("Expand")));
    expect(Object.keys(commit.mock.calls[0][0]).sort()).toEqual(["worlds/w/zones/cave/cave.full.json", "worlds/w/zones/forest/forest.full.json"]);
    await waitFor(() => expect(button("Publish")).toBeEnabled());
    expect(button("Expand")).toHaveAttribute("title", "Already expanded");
  });

  it("drops a passing Validate as soon as the draft changes", async () => {
    renderApp({branches: {main: assetFreeJson()}});
    await screen.findByRole("button", {name: "Validate"});
    await act(async () => fireEvent.click(button("Validate")));

    fireEvent.click(await zoneButton("Forest"));
    fireEvent.change(screen.getByLabelText("Name"), {target: {value: "Changed"}});

    expect(button("Expand")).toHaveAttribute("title", "Save first");
  });

  it("publishes the branch at the expanded commit, then goes to the versions page", async () => {
    const json = assetFreeJson();
    const {client} = renderApp({branches: {main: json}});
    vi.spyOn(commitModule, "commitFiles").mockImplementation(async (files, {branch}) => {
      client._advance(branch, {...json, ...files});
      return {commitSha: "next"};
    });
    const publish = vi.spyOn(publishModule, "publishWorld").mockResolvedValue({url: "/build/publishing/worlds/1"});
    const redirect = vi.spyOn(redirectModule, "redirectTo").mockImplementation(() => {});
    await screen.findByRole("button", {name: "Validate"});
    await act(async () => fireEvent.click(button("Validate")));
    await act(async () => fireEvent.click(button("Expand")));
    await waitFor(() => expect(button("Publish")).toBeEnabled());

    fireEvent.click(button("Publish"));
    expect(screen.getByRole("textbox", {name: "Release tag"})).toHaveValue("w/v1");
    await act(async () => fireEvent.click(button("Publish")));

    expect(publish).toHaveBeenCalledWith("/publish/w", "w/v1", {branch: "main", expectedSha: "main-c1"});
    expect(redirect).toHaveBeenCalledWith("/build/publishing/worlds/1");
  });
});
});
