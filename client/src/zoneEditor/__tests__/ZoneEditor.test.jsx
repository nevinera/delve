import {describe, it, expect, vi, afterEach, beforeEach} from "vitest";
import {render, screen, fireEvent, waitFor} from "@testing-library/react";
import ZoneEditor from "../ZoneEditor";
import {resolveZoneRefs} from "../resolveZoneRefs";
import {saveZone} from "../saveZone";
import {validateZone} from "../../validators/validateContent";
import {GithubAuthError} from "../../github/commitFiles";

vi.mock("../resolveZoneRefs", () => ({
  resolveZoneRefs: vi.fn(),
}));
vi.mock("../saveZone", () => ({
  saveZone: vi.fn(),
}));
vi.mock("../../validators/validateContent", () => ({
  validateZone: vi.fn(),
}));

const initialZone = {name: "Goblin Cave", maps: [], zoneLinks: [], entryPoints: {}, openConnections: {}};

describe("ZoneEditor", () => {
  beforeEach(() => {
    resolveZoneRefs.mockReset();
    saveZone.mockReset();
    validateZone.mockReset();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("flows a name edit from the field into the zone state", () => {
    render(<ZoneEditor initialZone={initialZone} />);

    fireEvent.change(screen.getByDisplayValue("Goblin Cave"), {target: {value: "Goblin Warren"}});

    expect(screen.getByDisplayValue("Goblin Warren")).toBeInTheDocument();
  });

  it("flows an elvl edit, as an integer, into the zone state", () => {
    render(<ZoneEditor initialZone={initialZone} />);

    fireEvent.change(screen.getByLabelText("Elevation"), {target: {value: "200"}});

    expect(screen.getByLabelText("Elevation")).toHaveValue(200);
  });

  it("clearing the elvl field sets it back to null, not an empty string", () => {
    render(<ZoneEditor initialZone={{...initialZone, elvl: 200}} />);

    fireEvent.change(screen.getByLabelText("Elevation"), {target: {value: ""}});

    expect(screen.getByLabelText("Elevation")).toHaveValue(null);
  });

  it("flows a private edit into the zone state", () => {
    render(<ZoneEditor initialZone={initialZone} />);

    expect(screen.getByLabelText("Private")).not.toBeChecked();
    fireEvent.click(screen.getByLabelText("Private"));

    expect(screen.getByLabelText("Private")).toBeChecked();
  });

  it("renders Validate and Save, with Save disabled until a Validate click passes", async () => {
    resolveZoneRefs.mockResolvedValue({name: "Goblin Cave"});
    validateZone.mockResolvedValue({valid: true});

    render(<ZoneEditor initialZone={initialZone} zoneKey="goblin-cave" />);

    expect(screen.getByRole("button", {name: "Save"})).toBeDisabled();
    fireEvent.click(screen.getByRole("button", {name: "Validate"}));

    await waitFor(() => expect(screen.getByRole("button", {name: "Save"})).not.toBeDisabled());
    expect(resolveZoneRefs).toHaveBeenCalledWith(initialZone, "zones/goblin-cave");
  });

  it("shows the validator's error and keeps Save disabled when the resolved zone is invalid", async () => {
    resolveZoneRefs.mockResolvedValue({});
    validateZone.mockResolvedValue({valid: false, error: {message: "elvl is required", path: "$.elvl"}});

    render(<ZoneEditor initialZone={initialZone} zoneKey="goblin-cave" />);
    fireEvent.click(screen.getByRole("button", {name: "Validate"}));

    await screen.findByText("elvl is required");
    expect(screen.getByRole("button", {name: "Save"})).toBeDisabled();
  });

  it("saves the current draft and the graph's layout positions once valid", async () => {
    resolveZoneRefs.mockResolvedValue({name: "Goblin Cave"});
    validateZone.mockResolvedValue({valid: true});
    saveZone.mockResolvedValue({commitSha: "abc", branch: "main"});

    render(<ZoneEditor initialZone={initialZone} zoneKey="goblin-cave" />);
    fireEvent.click(screen.getByRole("button", {name: "Validate"}));
    await waitFor(() => expect(screen.getByRole("button", {name: "Save"})).not.toBeDisabled());

    fireEvent.click(screen.getByRole("button", {name: "Save"}));

    await waitFor(() => expect(saveZone).toHaveBeenCalledWith("goblin-cave", initialZone, {}));
    await screen.findByText("Saved.");
  });

  it("redirects to the GitHub reauth URL on a GithubAuthError during save", async () => {
    resolveZoneRefs.mockResolvedValue({});
    validateZone.mockResolvedValue({valid: true});
    saveZone.mockRejectedValue(new GithubAuthError("reauth_required", "/github/reauth"));
    delete window.location;
    window.location = {href: ""};

    render(<ZoneEditor initialZone={initialZone} zoneKey="goblin-cave" />);
    fireEvent.click(screen.getByRole("button", {name: "Validate"}));
    await waitFor(() => expect(screen.getByRole("button", {name: "Save"})).not.toBeDisabled());
    fireEvent.click(screen.getByRole("button", {name: "Save"}));

    await waitFor(() => expect(window.location.href).toBe("/github/reauth"));
  });

  it("renders the maps panel, seeded from the initial available-map-details prop", () => {
    const maps = [{$ref: "./gc1-goblin-cave-entrance/gc1-goblin-cave-entrance.json", referenceTo: "map"}];
    const details = {"gc1-goblin-cave-entrance": {identifier: "cave_entrance", name: "Cave Entrance", connections: [], thumbnailUrl: null}};
    render(<ZoneEditor initialZone={{...initialZone, maps}} initialAvailableMapDetails={details} />);

    // "Cave Entrance" appears both in the maps list row and as the graph
    // node's label - just confirm the maps panel itself rendered it.
    expect(document.querySelector(".zone-maps-panel").textContent).toContain("Cave Entrance");
  });

  it("passes the same map details to the graph, which draws a node for it too", () => {
    const maps = [{$ref: "./gc1-goblin-cave-entrance/gc1-goblin-cave-entrance.json", referenceTo: "map"}];
    const details = {"gc1-goblin-cave-entrance": {identifier: "cave_entrance", name: "Cave Entrance", connections: [], thumbnailUrl: null}};
    render(<ZoneEditor initialZone={{...initialZone, maps}} initialAvailableMapDetails={details} />);

    expect(document.querySelector('.zone-graph-panel [data-node-key="gc1-goblin-cave-entrance"]')).not.toBeNull();
  });

  it("refreshes the cheap key list from availableMapsUrl (no keys[]) without touching the rest of the draft", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ok: true, json: async () => ["gc2-new-room"]});
    vi.stubGlobal("fetch", fetchMock);

    render(<ZoneEditor initialZone={initialZone} availableMapsUrl="/build/zones/goblin-cave/available_maps" zoneKey="goblin-cave" newMapUrl="/build/maps/new" />);

    fireEvent.click(screen.getByRole("button", {name: "Refresh"}));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith("/build/zones/goblin-cave/available_maps"));
    await screen.findByRole("option", {name: "gc2-new-room"});
  });

  it("lazily fetches a picked map's detail (keys[]=...) only once it's actually added", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({"gc2-new-room": {identifier: "new_room", name: "New Room", connections: [], units: [], thumbnailUrl: null}}),
    });
    vi.stubGlobal("fetch", fetchMock);

    render(
      <ZoneEditor
        initialZone={initialZone}
        initialAvailableMapKeys={["gc2-new-room"]}
        availableMapsUrl="/build/zones/goblin-cave/available_maps"
        zoneKey="goblin-cave"
        newMapUrl="/build/maps/new"
      />
    );

    expect(fetchMock).not.toHaveBeenCalled();

    fireEvent.change(screen.getByRole("combobox"), {target: {value: "gc2-new-room"}});
    fireEvent.click(screen.getByRole("button", {name: "Add"}));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith("/build/zones/goblin-cave/available_maps?keys%5B%5D=gc2-new-room"));
    await waitFor(() => expect(document.querySelector(".zone-maps-panel").textContent).toContain("New Room"));
  });
});
