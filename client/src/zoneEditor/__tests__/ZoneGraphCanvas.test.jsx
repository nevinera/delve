import {describe, it, expect, vi} from "vitest";
import {render, screen, fireEvent} from "@testing-library/react";
import ZoneGraphCanvas from "../ZoneGraphCanvas";

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
    expect(node.querySelector(".zone-graph-node-thumb-placeholder")).toBeNull();
  });

  it("gives each port a title tooltip with its connection identifier", () => {
    const {container} = render(<ZoneGraphCanvas zoneData={zoneData()} mapDetailsByKey={mapDetailsByKey} dispatch={vi.fn()} />);
    const p = port(container, "cave_entrance", "cave_mouth");
    expect(p.querySelector("title")).toHaveTextContent("cave_mouth");
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
});
