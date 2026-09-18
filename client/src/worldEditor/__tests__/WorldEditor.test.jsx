import {describe, it, expect, vi, afterEach} from "vitest";
import {render, screen, fireEvent, waitFor} from "@testing-library/react";
import WorldEditor from "../WorldEditor";
import {commitFiles} from "../../github/commitFiles";
import {GithubClient, GithubAuthError} from "../../github/delve-github";
import {validateWorld} from "../../validators/validateContent";

vi.mock("../../github/commitFiles", async (importOriginal) => {
  const actual = await importOriginal();
  return {...actual, commitFiles: vi.fn()};
});

vi.mock("../../github/delve-github", async (importOriginal) => {
  const actual = await importOriginal();
  return {...actual, GithubClient: vi.fn()};
});

vi.mock("../../validators/validateContent", () => ({
  validateWorld: vi.fn(),
}));

const initialWorld = {
  name: "Northern Barrens",
  description: "A dusty region.",
  thumbnailUrl: null,
  elevationRange: [0, 800],
  zones: {goblin_cave: {path: "../zones/goblin_cave/goblin_cave.json"}},
  worldLinks: [],
  entryPoints: {"goblin_cave/cave_entrance/cave_mouth": null},
};

const goblinCaveZone = {
  name: "Goblin Cave",
  description: "A damp cave.",
  openConnections: {},
  entryPoints: {"cave_entrance/cave_mouth": null},
};

// Every fetchFile call is path-aware (unlike a single blanket
// implementation) since ZonesPanel/WorldGraphCanvas now fetch each
// referenced zone's own file separately from the world's own file (see
// worldContentLoaders.js#zoneDetailsFor) - a path not listed in `files`
// (e.g. the world's own <key>.layout.json, before one's ever been saved)
// just 404s to null, same as a real brand-new file would.
function mockGithubFiles(files, {availableZonePaths = []} = {}) {
  GithubClient.mockImplementation(() => ({
    fetchFile: vi.fn(async (path) => (path in files ? files[path] : null)),
    listDirectory: vi.fn(async () => availableZonePaths),
  }));
}

function mockFetchFile(implementation, availableZonePaths = []) {
  GithubClient.mockImplementation(() => ({
    fetchFile: vi.fn(implementation),
    listDirectory: vi.fn(async () => availableZonePaths),
  }));
}

async function renderLoaded(worldData = initialWorld) {
  mockGithubFiles({
    "worlds/northern-barrens.json": JSON.stringify(worldData),
    "zones/goblin_cave/goblin_cave.json": JSON.stringify(goblinCaveZone),
  });
  render(<WorldEditor worldKey="northern-barrens" />);
  await screen.findByDisplayValue(worldData.name);
}

describe("WorldEditor", () => {
  afterEach(() => vi.clearAllMocks());

  it("shows a loading state, then the fields panel once the fetch resolves", async () => {
    // Two fetchFile calls happen in parallel on mount now (the world's own
    // file, and its .layout.json) - resolve every pending call, not just
    // the first, so this doesn't hang.
    const resolvers = [];
    mockFetchFile(() => new Promise((resolve) => resolvers.push(resolve)));

    render(<WorldEditor worldKey="northern-barrens" />);
    expect(screen.getByText("Loading…")).toBeInTheDocument();

    resolvers.forEach((resolve) => resolve(JSON.stringify(initialWorld)));
    await waitFor(() => expect(screen.getByDisplayValue("Northern Barrens")).toBeInTheDocument());
  });

  it("falls back to a blank world when the file doesn't exist yet (404 -> null)", async () => {
    mockFetchFile(async () => null);

    render(<WorldEditor worldKey="new_world" />);

    await screen.findByDisplayValue("New World");
  });

  it("shows a load error rather than a blank/loading state when the fetch fails", async () => {
    mockFetchFile(async () => {
      throw new Error("network down");
    });

    render(<WorldEditor worldKey="northern-barrens" />);

    await screen.findByText(/Failed to load: network down/);
  });

  it("redirects to the GitHub reauth URL when the load itself hits a GithubAuthError", async () => {
    mockFetchFile(async () => {
      throw new GithubAuthError("reauth_required", "/github/reauth");
    });
    delete window.location;
    window.location = {href: ""};

    render(<WorldEditor worldKey="northern-barrens" />);

    await waitFor(() => expect(window.location.href).toBe("/github/reauth"));
  });

  it("renders the world's zones with name/description synced in from the zone's own file, not typed by hand", async () => {
    await renderLoaded();

    expect(await screen.findByRole("heading", {level: 4, name: "Goblin Cave"})).toBeInTheDocument();
    expect(screen.getByText("A damp cave.")).toBeInTheDocument();
  });

  it("saves the synced name/description into the world's own cached WorldZoneEntry", async () => {
    validateWorld.mockResolvedValue({valid: true});
    commitFiles.mockResolvedValue({});
    await renderLoaded();
    await screen.findByRole("heading", {level: 4, name: "Goblin Cave"});

    fireEvent.click(screen.getByText("Validate"));
    await waitFor(() => expect(screen.getByText("Save")).not.toBeDisabled());
    fireEvent.click(screen.getByText("Save"));
    await screen.findByText("Saved.");

    const [savedFiles] = commitFiles.mock.calls[0];
    expect(savedFiles["worlds/northern-barrens.json"].zones.goblin_cave).toEqual({
      path: "../zones/goblin_cave/goblin_cave.json",
      name: "Goblin Cave",
      description: "A damp cave.",
    });
  });

  it("adds a zone picked from the real tree-listing, not a typed/guessed key", async () => {
    mockGithubFiles(
      {
        "worlds/northern-barrens.json": JSON.stringify({...initialWorld, zones: {}, entryPoints: {}}),
        "zones/stagnant_oasis/stagnant_oasis.json": JSON.stringify({name: "Stagnant Oasis"}),
      },
      {availableZonePaths: ["zones/stagnant_oasis/stagnant_oasis.json"]}
    );
    render(<WorldEditor worldKey="northern-barrens" />);
    await screen.findByDisplayValue("Northern Barrens");

    await screen.findByText("stagnant_oasis", {selector: "option"});
    fireEvent.change(screen.getByText("Pick an existing zone…").closest("select"), {target: {value: "stagnant_oasis"}});
    fireEvent.click(screen.getByText("Add"));

    expect(await screen.findByRole("heading", {level: 4, name: "Stagnant Oasis"})).toBeInTheDocument();
  });

  it("validates then enables save once valid", async () => {
    validateWorld.mockResolvedValue({valid: true});
    await renderLoaded();

    const saveButton = screen.getByText("Save");
    expect(saveButton).toBeDisabled();

    fireEvent.click(screen.getByText("Validate"));
    await waitFor(() => expect(saveButton).not.toBeDisabled());

    commitFiles.mockResolvedValue({});
    fireEvent.click(saveButton);
    await screen.findByText("Saved.");
    expect(commitFiles).toHaveBeenCalledWith(
      {
        "worlds/northern-barrens.json": expect.objectContaining({name: "Northern Barrens"}),
        "worlds/northern-barrens.layout.json": expect.objectContaining({positions: expect.anything()}),
      },
      expect.objectContaining({message: expect.stringContaining("Northern Barrens")})
    );
  });

  it("shows the validation error and keeps save disabled when invalid", async () => {
    validateWorld.mockResolvedValue({valid: false, error: {message: "entryPoints is required", path: "$.entryPoints"}});
    await renderLoaded();

    fireEvent.click(screen.getByText("Validate"));

    await screen.findByText("entryPoints is required");
    expect(screen.getByText("Save")).toBeDisabled();
  });
});
