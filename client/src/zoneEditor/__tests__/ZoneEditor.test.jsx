import {describe, it, expect, vi, afterEach} from "vitest";
import {render, screen, fireEvent, waitFor} from "@testing-library/react";
import ZoneEditor from "../ZoneEditor";

const initialZone = {name: "Goblin Cave", maps: [], zoneLinks: [], entryPoints: {}, openConnections: {}};

describe("ZoneEditor", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("flows a name edit from the field into the zone state", () => {
    render(<ZoneEditor initialZone={initialZone} />);

    fireEvent.change(screen.getByDisplayValue("Goblin Cave"), {target: {value: "Goblin Warren"}});

    expect(screen.getByDisplayValue("Goblin Warren")).toBeInTheDocument();
  });

  it("does not persist the edit anywhere - saving is deferred to step 11", () => {
    // No commitFiles mock, no Save button to click - an edit here only
    // ever touches in-memory React state until step 11 adds saving.
    render(<ZoneEditor initialZone={initialZone} />);

    expect(screen.queryByRole("button", {name: "Save"})).not.toBeInTheDocument();
  });

  it("renders the Validate button", () => {
    render(<ZoneEditor initialZone={initialZone} />);

    expect(screen.getByRole("button", {name: "Validate"})).toBeInTheDocument();
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
