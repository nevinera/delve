import {describe, it, expect, vi, afterEach} from "vitest";
import {render, screen, fireEvent, waitFor} from "@testing-library/react";
import ZoneEditor from "../ZoneEditor";
import {resolveZoneRefs} from "../resolveZoneRefs";
import {saveZone} from "../saveZone";
import {GithubClient, GithubAuthError} from "../../github/delve-github";
import {loadZone, loadLayoutPositions, listZoneMapKeys, mapDetailsFor} from "../zoneContentLoaders";
import {validateZone} from "../../validators/validateContent";
import {GithubAuthError as CommitGithubAuthError} from "../../github/commitFiles";

vi.mock("../resolveZoneRefs", () => ({
  resolveZoneRefs: vi.fn(),
}));
vi.mock("../saveZone", () => ({
  saveZone: vi.fn(),
}));
vi.mock("../../github/delve-github", async (importOriginal) => {
  const actual = await importOriginal();
  return {...actual, GithubClient: vi.fn(function () { return {}; })};
});
vi.mock("../zoneContentLoaders", async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    loadZone: vi.fn(),
    loadLayoutPositions: vi.fn(),
    listZoneMapKeys: vi.fn(),
    mapDetailsFor: vi.fn(),
  };
});
vi.mock("../../validators/validateContent", () => ({
  validateZone: vi.fn(),
}));

const initialZone = {name: "Goblin Cave", maps: [], zoneLinks: [], entryPoints: {}, openConnections: {}};

// Mocks every loader ZoneEditor fetches on mount, renders, and waits for
// the load to finish. referencedMapKeys itself is NOT mocked (imported for
// real via importOriginal above) - it's a pure derivation from zone.maps,
// no reason to fake it.
async function renderReady({zoneKey = "goblin-cave", newMapUrl, zone = initialZone, positions = {}, mapKeys = [], mapDetails = {}} = {}) {
  loadZone.mockResolvedValue(zone);
  loadLayoutPositions.mockResolvedValue(positions);
  listZoneMapKeys.mockResolvedValue(mapKeys);
  mapDetailsFor.mockResolvedValue(mapDetails);

  render(<ZoneEditor zoneKey={zoneKey} newMapUrl={newMapUrl} />);
  await waitFor(() => expect(screen.queryByText("Loading…")).not.toBeInTheDocument());
}

describe("ZoneEditor", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it("shows a loading state, then the editor once the fetch resolves", async () => {
    let resolveLoad;
    loadZone.mockImplementation(() => new Promise((resolve) => (resolveLoad = resolve)));
    loadLayoutPositions.mockResolvedValue({});
    listZoneMapKeys.mockResolvedValue([]);
    mapDetailsFor.mockResolvedValue({});

    render(<ZoneEditor zoneKey="goblin-cave" />);
    expect(screen.getByText("Loading…")).toBeInTheDocument();

    resolveLoad(initialZone);
    await waitFor(() => expect(screen.getByDisplayValue("Goblin Cave")).toBeInTheDocument());
  });

  it("shows a load error rather than a blank/loading state when the fetch fails", async () => {
    loadZone.mockRejectedValue(new Error("network down"));

    render(<ZoneEditor zoneKey="goblin-cave" />);

    await screen.findByText(/Failed to load: network down/);
  });

  it("redirects to the GitHub reauth URL when the load itself hits a GithubAuthError", async () => {
    loadZone.mockRejectedValue(new GithubAuthError("reauth_required", "/github/reauth"));
    delete window.location;
    window.location = {href: ""};

    render(<ZoneEditor zoneKey="goblin-cave" />);

    await waitFor(() => expect(window.location.href).toBe("/github/reauth"));
  });

  it("flows a name edit from the field into the zone state", async () => {
    await renderReady();

    fireEvent.change(screen.getByDisplayValue("Goblin Cave"), {target: {value: "Goblin Warren"}});

    expect(screen.getByDisplayValue("Goblin Warren")).toBeInTheDocument();
  });

  it("flows an elvl edit, as an integer, into the zone state", async () => {
    await renderReady();

    fireEvent.change(screen.getByLabelText("Elevation"), {target: {value: "200"}});

    expect(screen.getByLabelText("Elevation")).toHaveValue(200);
  });

  it("clearing the elvl field sets it back to null, not an empty string", async () => {
    await renderReady({zone: {...initialZone, elvl: 200}});

    fireEvent.change(screen.getByLabelText("Elevation"), {target: {value: ""}});

    expect(screen.getByLabelText("Elevation")).toHaveValue(null);
  });

  it("flows a private edit into the zone state", async () => {
    await renderReady();

    expect(screen.getByLabelText("Private")).not.toBeChecked();
    fireEvent.click(screen.getByLabelText("Private"));

    expect(screen.getByLabelText("Private")).toBeChecked();
  });

  it("renders Validate and Save, with Save disabled until a Validate click passes", async () => {
    resolveZoneRefs.mockResolvedValue({name: "Goblin Cave"});
    validateZone.mockResolvedValue({valid: true});
    await renderReady();

    expect(screen.getByRole("button", {name: "Save"})).toBeDisabled();
    fireEvent.click(screen.getByRole("button", {name: "Validate"}));

    await waitFor(() => expect(screen.getByRole("button", {name: "Save"})).not.toBeDisabled());
    // syncZoneRefs fills in items/unitTypes (empty here - no maps in play)
    // before validating, so it's this shape (not the bare initialZone) that
    // gets resolved.
    expect(resolveZoneRefs).toHaveBeenCalledWith({...initialZone, items: {}, unitTypes: {}}, "zones/goblin-cave");
  });

  it("shows the validator's error and keeps Save disabled when the resolved zone is invalid", async () => {
    resolveZoneRefs.mockResolvedValue({});
    validateZone.mockResolvedValue({valid: false, error: {message: "elvl is required", path: "$.elvl"}});
    await renderReady();

    fireEvent.click(screen.getByRole("button", {name: "Validate"}));

    await screen.findByText("elvl is required");
    expect(screen.getByRole("button", {name: "Save"})).toBeDisabled();
  });

  it("saves the current draft and the graph's layout positions once valid", async () => {
    resolveZoneRefs.mockResolvedValue({name: "Goblin Cave"});
    validateZone.mockResolvedValue({valid: true});
    saveZone.mockResolvedValue({commitSha: "abc", branch: "main"});
    await renderReady();

    fireEvent.click(screen.getByRole("button", {name: "Validate"}));
    await waitFor(() => expect(screen.getByRole("button", {name: "Save"})).not.toBeDisabled());

    fireEvent.click(screen.getByRole("button", {name: "Save"}));

    // Same syncZoneRefs fill-in as Validate - see above.
    await waitFor(() => expect(saveZone).toHaveBeenCalledWith("goblin-cave", {...initialZone, items: {}, unitTypes: {}}, {}));
    await screen.findByText("Saved.");
  });

  it("redirects to the GitHub reauth URL on a GithubAuthError during save", async () => {
    resolveZoneRefs.mockResolvedValue({});
    validateZone.mockResolvedValue({valid: true});
    saveZone.mockRejectedValue(new CommitGithubAuthError("reauth_required", "/github/reauth"));
    delete window.location;
    window.location = {href: ""};
    await renderReady();

    fireEvent.click(screen.getByRole("button", {name: "Validate"}));
    await waitFor(() => expect(screen.getByRole("button", {name: "Save"})).not.toBeDisabled());
    fireEvent.click(screen.getByRole("button", {name: "Save"}));

    await waitFor(() => expect(window.location.href).toBe("/github/reauth"));
  });

  it("renders the maps panel, seeded from the resolved map details", async () => {
    const maps = [{$ref: "./gc1-goblin-cave-entrance/gc1-goblin-cave-entrance.json", referenceTo: "map"}];
    const details = {"gc1-goblin-cave-entrance": {identifier: "cave_entrance", name: "Cave Entrance", connections: [], thumbnailUrl: null}};
    await renderReady({zone: {...initialZone, maps}, mapDetails: details});

    // "Cave Entrance" appears both in the maps list row and as the graph
    // node's label - just confirm the maps panel itself rendered it.
    expect(document.querySelector(".zone-maps-panel").textContent).toContain("Cave Entrance");
  });

  it("passes the same map details to the graph, which draws a node for it too", async () => {
    const maps = [{$ref: "./gc1-goblin-cave-entrance/gc1-goblin-cave-entrance.json", referenceTo: "map"}];
    const details = {"gc1-goblin-cave-entrance": {identifier: "cave_entrance", name: "Cave Entrance", connections: [], thumbnailUrl: null}};
    await renderReady({zone: {...initialZone, maps}, mapDetails: details});

    expect(document.querySelector('.zone-graph-panel [data-node-key="gc1-goblin-cave-entrance"]')).not.toBeNull();
  });

  it("refreshes the cheap key list without touching the rest of the draft", async () => {
    await renderReady({newMapUrl: "/build/maps/new"});
    listZoneMapKeys.mockResolvedValueOnce(["gc2-new-room"]);

    fireEvent.click(screen.getByRole("button", {name: "Refresh"}));

    await waitFor(() => expect(screen.getByText("Refreshed.")).toBeInTheDocument());
    await screen.findByRole("option", {name: "gc2-new-room"});
  });

  it("lazily fetches a picked map's detail only once it's actually added", async () => {
    await renderReady({mapKeys: ["gc2-new-room"], newMapUrl: "/build/maps/new"});
    expect(mapDetailsFor).not.toHaveBeenCalled();

    mapDetailsFor.mockResolvedValueOnce({"gc2-new-room": {identifier: "new_room", name: "New Room", connections: [], units: [], thumbnailUrl: null}});
    fireEvent.change(screen.getByRole("combobox"), {target: {value: "gc2-new-room"}});
    fireEvent.click(screen.getByRole("button", {name: "Add"}));

    await waitFor(() => expect(mapDetailsFor).toHaveBeenCalledWith(expect.anything(), "goblin-cave", ["gc2-new-room"]));
    await waitFor(() => expect(document.querySelector(".zone-maps-panel").textContent).toContain("New Room"));
  });

  // Regression for the "references unknown unit type" game-server failure:
  // a unit placed on a map (via the map editor, not here) whose type was
  // never separately added to the zone's own unitTypes dict used to save
  // successfully anyway, only failing later at instance-start time.
  function demoZoneWithUnregisteredUnitType() {
    const maps = [{$ref: "./woods/woods.json", referenceTo: "map"}];
    const details = {
      woods: {
        identifier: "woods", name: "Woods", connections: [],
        units: [{unitType: "demo/goblin-archer", itemKeys: []}], thumbnailUrl: null,
      },
    };
    return {zone: {...initialZone, maps, unitTypes: {}}, mapDetails: details};
  }

  it("fills in a used-but-unregistered unit type into the draft as soon as it loads, before any Validate/Save", async () => {
    await renderReady(demoZoneWithUnregisteredUnitType());

    fireEvent.click(document.querySelector(".zone-unit-types-panel .map-sidebar-section-heading"));

    // No ⚠ - the draft already has the entry, it was never left for the
    // person to notice and separately fix.
    expect(document.querySelector(".zone-unit-types-panel").textContent).not.toContain("⚠");
  });

  it("saves the auto-filled-in unit type", async () => {
    resolveZoneRefs.mockResolvedValue({name: "Demo"});
    validateZone.mockResolvedValue({valid: true});
    saveZone.mockResolvedValue({commitSha: "abc", branch: "main"});
    await renderReady(demoZoneWithUnregisteredUnitType());

    // The auto-fill itself counts as a draft change (it genuinely differs
    // from what's committed), so Validate/Save is still required before it
    // actually gets written.
    fireEvent.click(screen.getByRole("button", {name: "Validate"}));
    await waitFor(() => expect(screen.getByRole("button", {name: "Save"})).not.toBeDisabled());
    fireEvent.click(screen.getByRole("button", {name: "Save"}));
    await screen.findByText("Saved.");

    expect(saveZone).toHaveBeenCalledWith(
      "goblin-cave",
      expect.objectContaining({
        unitTypes: {"demo/goblin-archer": {$ref: "../../unit_types/demo/goblin-archer.json", referenceTo: "unit_type"}},
      }),
      {}
    );
  });
});
