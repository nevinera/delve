import {describe, it, expect, vi} from "vitest";
import {render, screen, fireEvent} from "@testing-library/react";
import ZoneGraphCanvas from "../ZoneGraphCanvas";
import {NODE_RADIUS} from "../circleLayout";

const mapDetailsByKey = {
  "gc1-goblin-cave-entrance": {identifier: "cave_entrance", name: "Cave Entrance", connections: [{identifier: "cave_mouth", type: "line"}]},
  "gc2-goblin-cave-interior": {identifier: "cave_interior", name: "Cave Interior", connections: [{identifier: "entrance", type: "line"}]},
};

function zoneData(overrides = {}) {
  return {
    maps: [
      {$ref: "./gc1-goblin-cave-entrance/gc1-goblin-cave-entrance.json", referenceTo: "map"},
      {$ref: "./gc2-goblin-cave-interior/gc2-goblin-cave-interior.json", referenceTo: "map"},
    ],
    zoneLinks: [],
    entryPoints: {},
    openConnections: {},
    ...overrides,
  };
}

function port(container, mapIdentifier, connectionIdentifier) {
  const nodeKey = mapIdentifier === "cave_entrance" ? "gc1-goblin-cave-entrance" : "gc2-goblin-cave-interior";
  return container.querySelector(`.zone-graph-port[data-node-key="${nodeKey}"][data-connection="${connectionIdentifier}"]`);
}

function nodeCenter(container, nodeKey) {
  const transform = container.querySelector(`[data-node-key="${nodeKey}"]`).getAttribute("transform");
  const [, x, y] = transform.match(/translate\(([^,]+), ([^)]+)\)/);
  return {x: parseFloat(x), y: parseFloat(y)};
}

describe("ZoneGraphCanvas", () => {
  it("shows a hint instead of a graph when there are no maps", () => {
    render(<ZoneGraphCanvas zoneData={zoneData({maps: []})} mapDetailsByKey={{}} dispatch={vi.fn()} />);
    expect(screen.getByText("No maps yet.")).toBeInTheDocument();
  });

  it("renders one node per referenced, resolved map, labeled by name", () => {
    render(<ZoneGraphCanvas zoneData={zoneData()} mapDetailsByKey={mapDetailsByKey} dispatch={vi.fn()} />);
    expect(screen.getByText("Cave Entrance")).toBeInTheDocument();
    expect(screen.getByText("Cave Interior")).toBeInTheDocument();
  });

  it("shows a placeholder icon inside a node with no thumbnail", () => {
    const {container} = render(<ZoneGraphCanvas zoneData={zoneData()} mapDetailsByKey={mapDetailsByKey} dispatch={vi.fn()} />);
    const node = container.querySelector('[data-node-key="gc1-goblin-cave-entrance"]');
    expect(node.querySelector(".zone-graph-node-thumb-placeholder")).toHaveTextContent("🗺");
    expect(node.querySelector("image")).toBeNull();
  });

  it("renders a clipped thumbnail image inside a node that has one", () => {
    const details = {
      ...mapDetailsByKey,
      "gc1-goblin-cave-entrance": {...mapDetailsByKey["gc1-goblin-cave-entrance"], thumbnailUrl: "data:image/webp;base64,AAA="},
    };
    const {container} = render(<ZoneGraphCanvas zoneData={zoneData()} mapDetailsByKey={details} dispatch={vi.fn()} />);
    const node = container.querySelector('[data-node-key="gc1-goblin-cave-entrance"]');
    const image = node.querySelector("image");
    expect(image).toHaveAttribute("href", "data:image/webp;base64,AAA=");
    // "meet", not "slice" - the whole thumbnail must stay visible (fit,
    // not filled-and-cropped), so a non-square image is still recognizable.
    expect(image).toHaveAttribute("preserveAspectRatio", "xMidYMid meet");
    expect(node.querySelector(".zone-graph-node-thumb-placeholder")).toBeNull();
  });

  it("sizes the thumbnail's box so even a square image's diagonal never exceeds the node's diameter (no clipping by the circle)", () => {
    const details = {
      ...mapDetailsByKey,
      "gc1-goblin-cave-entrance": {...mapDetailsByKey["gc1-goblin-cave-entrance"], thumbnailUrl: "data:image/webp;base64,AAA="},
    };
    const {container} = render(<ZoneGraphCanvas zoneData={zoneData()} mapDetailsByKey={details} dispatch={vi.fn()} />);
    const image = container.querySelector('[data-node-key="gc1-goblin-cave-entrance"] image');

    const width = Number(image.getAttribute("width"));
    const height = Number(image.getAttribute("height"));
    expect(width).toBe(height); // square box, so the worst case (a square image) is the one that matters
    expect(Math.hypot(width, height)).toBeLessThanOrEqual(NODE_RADIUS * 2 + 1e-9);
  });

  it("places a linked port on the side of its node facing the node it's connected to", () => {
    const data = zoneData({
      zoneLinks: [{connectionA: {map: "cave_entrance", connection: "cave_mouth"}, connectionB: {map: "cave_interior", connection: "entrance"}, oneWay: false, requiredKey: null}],
    });
    const {container} = render(<ZoneGraphCanvas zoneData={data} mapDetailsByKey={mapDetailsByKey} dispatch={vi.fn()} />);

    const entranceCenter = nodeCenter(container, "gc1-goblin-cave-entrance");
    const interiorCenter = nodeCenter(container, "gc2-goblin-cave-interior");
    const entrancePort = port(container, "cave_entrance", "cave_mouth");
    const interiorPort = port(container, "cave_interior", "entrance");

    const angleToOther = Math.atan2(interiorCenter.y - entranceCenter.y, interiorCenter.x - entranceCenter.x);
    const angleOfPort = Math.atan2(Number(entrancePort.getAttribute("cy")) - entranceCenter.y, Number(entrancePort.getAttribute("cx")) - entranceCenter.x);
    expect(angleOfPort).toBeCloseTo(angleToOther);

    const angleBack = Math.atan2(entranceCenter.y - interiorCenter.y, entranceCenter.x - interiorCenter.x);
    const angleOfOtherPort = Math.atan2(Number(interiorPort.getAttribute("cy")) - interiorCenter.y, Number(interiorPort.getAttribute("cx")) - interiorCenter.x);
    expect(angleOfOtherPort).toBeCloseTo(angleBack);
  });

  it("keeps a linked port facing its target even after that target node is dragged", () => {
    const data = zoneData({
      zoneLinks: [{connectionA: {map: "cave_entrance", connection: "cave_mouth"}, connectionB: {map: "cave_interior", connection: "entrance"}, oneWay: false, requiredKey: null}],
    });
    const {container} = render(<ZoneGraphCanvas zoneData={data} mapDetailsByKey={mapDetailsByKey} dispatch={vi.fn()} />);

    const interiorNode = container.querySelector('[data-node-key="gc2-goblin-cave-interior"] .zone-graph-node');
    fireEvent.pointerDown(interiorNode, {pointerId: 5, clientX: 0, clientY: 0});
    fireEvent.pointerMove(interiorNode, {pointerId: 5, clientX: 500, clientY: 500});
    fireEvent.pointerUp(interiorNode, {pointerId: 5, clientX: 500, clientY: 500});

    const entranceCenter = nodeCenter(container, "gc1-goblin-cave-entrance");
    const interiorCenter = nodeCenter(container, "gc2-goblin-cave-interior");
    const entrancePort = port(container, "cave_entrance", "cave_mouth");

    const angleToOther = Math.atan2(interiorCenter.y - entranceCenter.y, interiorCenter.x - entranceCenter.x);
    const angleOfPort = Math.atan2(Number(entrancePort.getAttribute("cy")) - entranceCenter.y, Number(entrancePort.getAttribute("cx")) - entranceCenter.x);
    expect(angleOfPort).toBeCloseTo(angleToOther);
  });

  it("renders a satellite node for an entry point, labeled by the connection identifier", () => {
    const data = zoneData({entryPoints: {"cave_entrance/cave_mouth": null}});
    const {container} = render(<ZoneGraphCanvas zoneData={data} mapDetailsByKey={mapDetailsByKey} dispatch={vi.fn()} />);

    const satellite = container.querySelector('.zone-graph-satellite[data-kind="entryPoint"]');
    expect(satellite).not.toBeNull();
    expect(screen.getByText("cave_mouth")).toBeInTheDocument();
  });

  it("renders a satellite node for an open connection, labeled by its exposed name", () => {
    const data = zoneData({openConnections: {"cave_entrance/cave_mouth": "back_way"}});
    render(<ZoneGraphCanvas zoneData={data} mapDetailsByKey={mapDetailsByKey} dispatch={vi.fn()} />);

    expect(screen.getByText("back_way")).toBeInTheDocument();
  });

  it("renders no satellite for an open or zoneLink connection", () => {
    const {container} = render(<ZoneGraphCanvas zoneData={zoneData()} mapDetailsByKey={mapDetailsByKey} dispatch={vi.fn()} />);
    expect(container.querySelector(".zone-graph-satellite")).toBeNull();
  });

  it("places a fresh satellite along the same ray its port would already have used, so the port doesn't jump on first render", () => {
    const data = zoneData({entryPoints: {"cave_entrance/cave_mouth": null}});
    const {container} = render(<ZoneGraphCanvas zoneData={data} mapDetailsByKey={mapDetailsByKey} dispatch={vi.fn()} />);

    const entranceCenter = nodeCenter(container, "gc1-goblin-cave-entrance");
    const entrancePort = port(container, "cave_entrance", "cave_mouth");

    // Same fallback ray as the unlinked case (i=0 of 1 connections -> +x).
    expect(Number(entrancePort.getAttribute("cx"))).toBeCloseTo(entranceCenter.x + NODE_RADIUS);
    expect(Number(entrancePort.getAttribute("cy"))).toBeCloseTo(entranceCenter.y);
  });

  it("dragging a satellite pulls its matched port to face the new position", () => {
    const data = zoneData({entryPoints: {"cave_entrance/cave_mouth": null}});
    const {container} = render(<ZoneGraphCanvas zoneData={data} mapDetailsByKey={mapDetailsByKey} dispatch={vi.fn()} />);

    const satellite = container.querySelector('.zone-graph-satellite[data-kind="entryPoint"]');
    fireEvent.pointerDown(satellite, {pointerId: 7, clientX: 0, clientY: 0});
    fireEvent.pointerMove(satellite, {pointerId: 7, clientX: 0, clientY: 500});
    fireEvent.pointerUp(satellite, {pointerId: 7, clientX: 0, clientY: 500});

    const entranceCenter = nodeCenter(container, "gc1-goblin-cave-entrance");
    const entrancePort = port(container, "cave_entrance", "cave_mouth");
    const movedSatellite = container.querySelector('.zone-graph-satellite[data-kind="entryPoint"]');

    const angleToSatellite = Math.atan2(
      Number(movedSatellite.getAttribute("cy")) - entranceCenter.y,
      Number(movedSatellite.getAttribute("cx")) - entranceCenter.x
    );
    const angleOfPort = Math.atan2(Number(entrancePort.getAttribute("cy")) - entranceCenter.y, Number(entrancePort.getAttribute("cx")) - entranceCenter.x);
    expect(angleOfPort).toBeCloseTo(angleToSatellite);
    // It actually moved from the original +x-facing default.
    expect(Number(entrancePort.getAttribute("cy"))).not.toBeCloseTo(entranceCenter.y);
  });

  it("leaves an unlinked port on the even-spacing fallback, not pointing at anything", () => {
    const {container} = render(<ZoneGraphCanvas zoneData={zoneData()} mapDetailsByKey={mapDetailsByKey} dispatch={vi.fn()} />);
    const entranceCenter = nodeCenter(container, "gc1-goblin-cave-entrance");
    const entrancePort = port(container, "cave_entrance", "cave_mouth");

    // The one connection on this node, unlinked, falls back to angle 0
    // (i=0 of 1) - i.e. straight out along +x from the node center.
    expect(Number(entrancePort.getAttribute("cx"))).toBeCloseTo(entranceCenter.x + NODE_RADIUS);
    expect(Number(entrancePort.getAttribute("cy"))).toBeCloseTo(entranceCenter.y);
  });

  it("shows a custom tooltip with the connection identifier on hover, and hides it on mouse leave", () => {
    const {container} = render(<ZoneGraphCanvas zoneData={zoneData()} mapDetailsByKey={mapDetailsByKey} dispatch={vi.fn()} />);
    const p = port(container, "cave_entrance", "cave_mouth");

    expect(screen.queryByText("cave_mouth")).not.toBeInTheDocument();
    expect(p.querySelector("title")).toBeNull(); // not the slow, unstyleable native tooltip

    fireEvent.mouseEnter(p, {clientX: 50, clientY: 60});
    expect(screen.getByText("cave_mouth")).toBeInTheDocument();

    fireEvent.mouseLeave(p);
    expect(screen.queryByText("cave_mouth")).not.toBeInTheDocument();
  });

  it("renders one port per connection, tagged with its open status", () => {
    const {container} = render(<ZoneGraphCanvas zoneData={zoneData()} mapDetailsByKey={mapDetailsByKey} dispatch={vi.fn()} />);
    expect(port(container, "cave_entrance", "cave_mouth")).toHaveAttribute("data-status", "open");
    expect(port(container, "cave_interior", "entrance")).toHaveAttribute("data-status", "open");
  });

  it("renders an edge for an existing zoneLink, and tags both ends as zoneLink", () => {
    const data = zoneData({
      zoneLinks: [{connectionA: {map: "cave_entrance", connection: "cave_mouth"}, connectionB: {map: "cave_interior", connection: "entrance"}, oneWay: false, requiredKey: null}],
    });
    const {container} = render(<ZoneGraphCanvas zoneData={data} mapDetailsByKey={mapDetailsByKey} dispatch={vi.fn()} />);

    expect(container.querySelectorAll(".zone-graph-edge")).toHaveLength(1);
    expect(port(container, "cave_entrance", "cave_mouth")).toHaveAttribute("data-status", "zoneLink");
    expect(port(container, "cave_interior", "entrance")).toHaveAttribute("data-status", "zoneLink");
  });

  it("dragging from one open port to another dispatches ADD_ZONE_LINK", () => {
    const dispatch = vi.fn();
    const {container} = render(<ZoneGraphCanvas zoneData={zoneData()} mapDetailsByKey={mapDetailsByKey} dispatch={dispatch} />);

    const from = port(container, "cave_entrance", "cave_mouth");
    const to = port(container, "cave_interior", "entrance");
    const toX = Number(to.getAttribute("cx"));
    const toY = Number(to.getAttribute("cy"));

    fireEvent.pointerDown(from, {pointerId: 1, clientX: 0, clientY: 0});
    fireEvent.pointerMove(container.querySelector(".zone-graph-wrapper"), {pointerId: 1, clientX: toX, clientY: toY});
    fireEvent.pointerUp(container.querySelector(".zone-graph-wrapper"), {pointerId: 1, clientX: toX, clientY: toY});

    expect(dispatch).toHaveBeenCalledWith({
      type: "ADD_ZONE_LINK",
      connectionA: {map: "cave_entrance", connection: "cave_mouth"},
      connectionB: {map: "cave_interior", connection: "entrance"},
    });
  });

  it("shows a tooltip for the port under the cursor while dragging a link, even though pointer capture means it never gets a real mouseenter", () => {
    const {container} = render(<ZoneGraphCanvas zoneData={zoneData()} mapDetailsByKey={mapDetailsByKey} dispatch={vi.fn()} />);
    const wrapper = container.querySelector(".zone-graph-wrapper");

    const from = port(container, "cave_entrance", "cave_mouth");
    const to = port(container, "cave_interior", "entrance");
    const toX = Number(to.getAttribute("cx"));
    const toY = Number(to.getAttribute("cy"));

    fireEvent.pointerDown(from, {pointerId: 1, clientX: 0, clientY: 0});
    expect(screen.queryByText("entrance")).not.toBeInTheDocument();

    fireEvent.pointerMove(wrapper, {pointerId: 1, clientX: toX, clientY: toY});
    expect(screen.getByText("entrance")).toBeInTheDocument();

    fireEvent.pointerMove(wrapper, {pointerId: 1, clientX: 9999, clientY: 9999});
    expect(screen.queryByText("entrance")).not.toBeInTheDocument();

    fireEvent.pointerUp(wrapper, {pointerId: 1, clientX: 9999, clientY: 9999});
    expect(screen.queryByText("entrance")).not.toBeInTheDocument();
  });

  it("dragging an existing link's port to empty space dispatches REMOVE_ZONE_LINK", () => {
    const dispatch = vi.fn();
    const data = zoneData({
      zoneLinks: [{connectionA: {map: "cave_entrance", connection: "cave_mouth"}, connectionB: {map: "cave_interior", connection: "entrance"}, oneWay: false, requiredKey: null}],
    });
    const {container} = render(<ZoneGraphCanvas zoneData={data} mapDetailsByKey={mapDetailsByKey} dispatch={dispatch} />);

    const from = port(container, "cave_entrance", "cave_mouth");
    const wrapper = container.querySelector(".zone-graph-wrapper");

    fireEvent.pointerDown(from, {pointerId: 1, clientX: 0, clientY: 0});
    fireEvent.pointerMove(wrapper, {pointerId: 1, clientX: 9999, clientY: 9999});
    fireEvent.pointerUp(wrapper, {pointerId: 1, clientX: 9999, clientY: 9999});

    expect(dispatch).toHaveBeenCalledWith({type: "REMOVE_ZONE_LINK", index: 0});
  });

  it("dropping an open port on empty space is a no-op", () => {
    const dispatch = vi.fn();
    const {container} = render(<ZoneGraphCanvas zoneData={zoneData()} mapDetailsByKey={mapDetailsByKey} dispatch={dispatch} />);

    const from = port(container, "cave_entrance", "cave_mouth");
    const wrapper = container.querySelector(".zone-graph-wrapper");

    fireEvent.pointerDown(from, {pointerId: 1, clientX: 0, clientY: 0});
    fireEvent.pointerMove(wrapper, {pointerId: 1, clientX: 9999, clientY: 9999});
    fireEvent.pointerUp(wrapper, {pointerId: 1, clientX: 9999, clientY: 9999});

    expect(dispatch).not.toHaveBeenCalled();
  });

  it("dragging the background pans the view (moves the transformed group)", () => {
    const {container} = render(<ZoneGraphCanvas zoneData={zoneData()} mapDetailsByKey={mapDetailsByKey} dispatch={vi.fn()} />);
    const wrapper = container.querySelector(".zone-graph-wrapper");
    const group = container.querySelector(".zone-graph-svg > g");

    expect(group).toHaveAttribute("transform", "translate(0, 0) scale(1)");

    fireEvent.pointerDown(wrapper, {pointerId: 2, clientX: 100, clientY: 50});
    fireEvent.pointerMove(wrapper, {pointerId: 2, clientX: 130, clientY: 70});
    fireEvent.pointerUp(wrapper, {pointerId: 2, clientX: 130, clientY: 70});

    expect(group).toHaveAttribute("transform", "translate(30, 20) scale(1)");
  });

  it("the +/- buttons zoom the view", () => {
    const {container} = render(<ZoneGraphCanvas zoneData={zoneData()} mapDetailsByKey={mapDetailsByKey} dispatch={vi.fn()} />);
    const group = container.querySelector(".zone-graph-svg > g");

    fireEvent.click(screen.getByRole("button", {name: "+"}));
    expect(group).toHaveAttribute("transform", "translate(0, 0) scale(1.25)");

    fireEvent.click(screen.getByRole("button", {name: "−"}));
    expect(group).toHaveAttribute("transform", "translate(0, 0) scale(1)");
  });

  it("Reset re-fits the view to the current node positions once the wrapper has a real size", () => {
    const {container} = render(<ZoneGraphCanvas zoneData={zoneData()} mapDetailsByKey={mapDetailsByKey} dispatch={vi.fn()} />);
    const wrapper = container.querySelector(".zone-graph-wrapper");
    const group = container.querySelector(".zone-graph-svg > g");

    // jsdom never lays anything out - getBoundingClientRect always
    // reports zero size, which is exactly why the mount-time fit is a
    // no-op in every other test here. Mock a real size just for this one.
    vi.spyOn(wrapper, "getBoundingClientRect").mockReturnValue({width: 400, height: 300, left: 0, top: 0});

    fireEvent.click(screen.getByRole("button", {name: "Reset"}));

    // Both nodes are resolved with a connection each - circleLayout puts
    // them on opposite sides of the origin, so their mean is the origin;
    // fitting to a 400x300 wrapper should center pan on (200, 150).
    expect(group.getAttribute("transform")).toMatch(/^translate\(200(\.\d+)?, 150(\.\d+)?\) scale\(/);
  });

  it("dragging a node moves its ports along with it", () => {
    const {container} = render(<ZoneGraphCanvas zoneData={zoneData()} mapDetailsByKey={mapDetailsByKey} dispatch={vi.fn()} />);

    const nodeGroup = container.querySelector('[data-node-key="gc1-goblin-cave-entrance"]');
    const nodeCircle = nodeGroup.querySelector(".zone-graph-node");
    const before = port(container, "cave_entrance", "cave_mouth").getAttribute("cx");

    fireEvent.pointerDown(nodeCircle, {pointerId: 3, clientX: 0, clientY: 0});
    fireEvent.pointerMove(nodeCircle, {pointerId: 3, clientX: 50, clientY: 0});
    fireEvent.pointerUp(nodeCircle, {pointerId: 3, clientX: 50, clientY: 0});

    const after = port(container, "cave_entrance", "cave_mouth").getAttribute("cx");
    expect(Number(after)).toBeCloseTo(Number(before) + 50);
  });

  it("reports the current drag-override map via onPositionsChange whenever it changes", () => {
    const onPositionsChange = vi.fn();
    const {container} = render(<ZoneGraphCanvas zoneData={zoneData()} mapDetailsByKey={mapDetailsByKey} dispatch={vi.fn()} onPositionsChange={onPositionsChange} />);

    // Called once on mount, with no overrides yet.
    expect(onPositionsChange).toHaveBeenLastCalledWith({});

    const nodeCircle = container.querySelector('[data-node-key="gc1-goblin-cave-entrance"] .zone-graph-node');
    fireEvent.pointerDown(nodeCircle, {pointerId: 9, clientX: 0, clientY: 0});
    fireEvent.pointerMove(nodeCircle, {pointerId: 9, clientX: 50, clientY: 30});
    fireEvent.pointerUp(nodeCircle, {pointerId: 9, clientX: 50, clientY: 30});

    const lastCall = onPositionsChange.mock.calls.at(-1)[0];
    expect(Object.keys(lastCall)).toEqual(["gc1-goblin-cave-entrance"]);
    expect(typeof lastCall["gc1-goblin-cave-entrance"].x).toBe("number");
    expect(typeof lastCall["gc1-goblin-cave-entrance"].y).toBe("number");
  });

  it("seeds node positions from initialPositions (persisted layout metadata)", () => {
    const onPositionsChange = vi.fn();
    const initialPositions = {"gc1-goblin-cave-entrance": {x: 500, y: 500}};
    const {container} = render(
      <ZoneGraphCanvas zoneData={zoneData()} mapDetailsByKey={mapDetailsByKey} dispatch={vi.fn()} initialPositions={initialPositions} onPositionsChange={onPositionsChange} />
    );

    expect(nodeCenter(container, "gc1-goblin-cave-entrance")).toEqual({x: 500, y: 500});
    expect(onPositionsChange).toHaveBeenLastCalledWith(initialPositions);
  });
});
