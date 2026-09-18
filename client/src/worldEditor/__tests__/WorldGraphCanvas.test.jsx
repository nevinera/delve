import {describe, it, expect, vi} from "vitest";
import {render, screen, fireEvent} from "@testing-library/react";
import WorldGraphCanvas from "../WorldGraphCanvas";
import {WorldDraft} from "../WorldDraft";

function draftWith(data) {
  return new WorldDraft({name: "Northern Barrens", zones: {}, worldLinks: [], entryPoints: {}, ...data});
}

describe("WorldGraphCanvas", () => {
  it("shows a hint when there are no zones yet", () => {
    render(<WorldGraphCanvas draft={draftWith({})} onChange={vi.fn()} zoneDetailsByKey={{}} onRefresh={vi.fn()} refreshStatus="" />);
    expect(screen.getByText("No zones yet.")).toBeInTheDocument();
  });

  it("renders a node per zone and a port per exposed connection", () => {
    const draft = draftWith({zones: {goblin_cave: {path: "./x.json", name: "Goblin Cave"}}});
    const zoneDetailsByKey = {goblin_cave: {name: "Goblin Cave", openConnections: {"cave_entrance/back_door": "cliff_above"}}};

    const {container} = render(
      <WorldGraphCanvas draft={draft} onChange={vi.fn()} zoneDetailsByKey={zoneDetailsByKey} onRefresh={vi.fn()} refreshStatus="" />
    );

    expect(screen.getByText("Goblin Cave")).toBeInTheDocument();
    expect(container.querySelector('[data-node-key="goblin_cave"]')).toBeTruthy();
    expect(container.querySelector('[data-connection="cliff_above"]')).toBeTruthy();
  });

  it("draws an edge for a worldLink between two zones' ports", () => {
    const draft = draftWith({
      zones: {
        goblin_cave: {path: "./a.json"},
        stagnant_oasis: {path: "./b.json"},
      },
      worldLinks: [{zoneA: {zone: "goblin_cave", kind: "open", connection: "cliff_above"}, zoneB: {zone: "stagnant_oasis", kind: "open", connection: "goblin_trailhead"}, oneWay: false, requiredKey: null}],
    });
    const zoneDetailsByKey = {
      goblin_cave: {name: "Goblin Cave", openConnections: {a: "cliff_above"}},
      stagnant_oasis: {name: "Stagnant Oasis", openConnections: {b: "goblin_trailhead"}},
    };

    const {container} = render(
      <WorldGraphCanvas draft={draft} onChange={vi.fn()} zoneDetailsByKey={zoneDetailsByKey} onRefresh={vi.fn()} refreshStatus="" />
    );

    expect(container.querySelectorAll(".zone-graph-edge").length).toBe(1);
  });

  it("renders a port for each of a zone's entryPoints too, alongside its openConnections", () => {
    const draft = draftWith({zones: {goblin_cave: {path: "./x.json"}}});
    const zoneDetailsByKey = {
      goblin_cave: {
        name: "Goblin Cave",
        openConnections: {"cave_entrance/back_door": "cliff_above"},
        entryPoints: {"cave_entrance/cave_mouth": null},
      },
    };

    const {container} = render(
      <WorldGraphCanvas draft={draft} onChange={vi.fn()} zoneDetailsByKey={zoneDetailsByKey} onRefresh={vi.fn()} refreshStatus="" />
    );

    expect(container.querySelector('[data-kind="open"][data-connection="cliff_above"]')).toBeTruthy();
    expect(container.querySelector('[data-kind="entryPoint"][data-connection="cave_entrance/cave_mouth"]')).toBeTruthy();
  });

  it("gives an entryPoint port its own satellite (portal) node, tethered to the port, once it's this world's designated entry point", () => {
    const draft = draftWith({
      zones: {goblin_cave: {path: "./x.json"}},
      entryPoints: {"goblin_cave/cave_entrance/cave_mouth": null},
    });
    const zoneDetailsByKey = {
      goblin_cave: {name: "Goblin Cave", openConnections: {}, entryPoints: {"cave_entrance/cave_mouth": null}},
    };

    const {container} = render(
      <WorldGraphCanvas draft={draft} onChange={vi.fn()} zoneDetailsByKey={zoneDetailsByKey} onRefresh={vi.fn()} refreshStatus="" />
    );

    expect(container.querySelector('[data-satellite-key="entryPoint:goblin_cave/cave_entrance/cave_mouth"]')).toBeTruthy();
    expect(container.querySelector(".zone-graph-satellite-tether")).toBeTruthy();
    expect(screen.getByText("cave_entrance/cave_mouth")).toBeInTheDocument();
  });

  it("does not give an entryPoint port a satellite when it's not (yet) this world's designated entry point", () => {
    const draft = draftWith({zones: {goblin_cave: {path: "./x.json"}}});
    const zoneDetailsByKey = {
      goblin_cave: {name: "Goblin Cave", openConnections: {}, entryPoints: {"cave_entrance/cave_mouth": null}},
    };

    const {container} = render(
      <WorldGraphCanvas draft={draft} onChange={vi.fn()} zoneDetailsByKey={zoneDetailsByKey} onRefresh={vi.fn()} refreshStatus="" />
    );

    expect(container.querySelector(".zone-graph-satellite")).toBeFalsy();
  });

  it("does not give an openConnection port a satellite", () => {
    const draft = draftWith({zones: {goblin_cave: {path: "./x.json"}}});
    const zoneDetailsByKey = {
      goblin_cave: {name: "Goblin Cave", openConnections: {"a/b": "cliff_above"}, entryPoints: {}},
    };

    const {container} = render(
      <WorldGraphCanvas draft={draft} onChange={vi.fn()} zoneDetailsByKey={zoneDetailsByKey} onRefresh={vi.fn()} refreshStatus="" />
    );

    expect(container.querySelector(".zone-graph-satellite")).toBeFalsy();
  });

  it("highlights an entryPoint port that's this world's designated entry point for its zone", () => {
    const draft = draftWith({
      zones: {goblin_cave: {path: "./x.json"}},
      entryPoints: {"goblin_cave/cave_entrance/cave_mouth": null},
    });
    const zoneDetailsByKey = {
      goblin_cave: {name: "Goblin Cave", openConnections: {}, entryPoints: {"cave_entrance/cave_mouth": null}},
    };

    const {container} = render(
      <WorldGraphCanvas draft={draft} onChange={vi.fn()} zoneDetailsByKey={zoneDetailsByKey} onRefresh={vi.fn()} refreshStatus="" />
    );

    const port = container.querySelector('[data-kind="entryPoint"][data-connection="cave_entrance/cave_mouth"]');
    expect(port.getAttribute("data-world-entry-point")).toBe("true");
  });

  it("calls onRefresh when the refresh button is clicked", async () => {
    const onRefresh = vi.fn();
    render(<WorldGraphCanvas draft={draftWith({})} onChange={vi.fn()} zoneDetailsByKey={{}} onRefresh={onRefresh} refreshStatus="" />);

    screen.getByText("↻ Refresh Connections").click();

    expect(onRefresh).toHaveBeenCalled();
  });

  it("reports the current drag-override map via onPositionsChange whenever it changes", () => {
    const draft = draftWith({zones: {goblin_cave: {path: "./x.json"}}});
    const zoneDetailsByKey = {goblin_cave: {name: "Goblin Cave", openConnections: {}}};
    const onPositionsChange = vi.fn();

    const {container} = render(
      <WorldGraphCanvas draft={draft} onChange={vi.fn()} zoneDetailsByKey={zoneDetailsByKey} onRefresh={vi.fn()} refreshStatus="" onPositionsChange={onPositionsChange} />
    );

    // Called once on mount, with no overrides yet.
    expect(onPositionsChange).toHaveBeenLastCalledWith({});

    const nodeCircle = container.querySelector('[data-node-key="goblin_cave"] .zone-graph-node');
    fireEvent.pointerDown(nodeCircle, {pointerId: 9, clientX: 0, clientY: 0});
    fireEvent.pointerMove(nodeCircle, {pointerId: 9, clientX: 50, clientY: 30});
    fireEvent.pointerUp(nodeCircle, {pointerId: 9, clientX: 50, clientY: 30});

    const lastCall = onPositionsChange.mock.calls.at(-1)[0];
    expect(Object.keys(lastCall)).toEqual(["goblin_cave"]);
    expect(typeof lastCall.goblin_cave.x).toBe("number");
    expect(typeof lastCall.goblin_cave.y).toBe("number");
  });

  it("seeds node positions from initialPositions (persisted layout metadata)", () => {
    const draft = draftWith({zones: {goblin_cave: {path: "./x.json"}}});
    const zoneDetailsByKey = {goblin_cave: {name: "Goblin Cave", openConnections: {}}};
    const initialPositions = {goblin_cave: {x: 500, y: 500}};
    const onPositionsChange = vi.fn();

    const {container} = render(
      <WorldGraphCanvas
        draft={draft} onChange={vi.fn()} zoneDetailsByKey={zoneDetailsByKey} onRefresh={vi.fn()} refreshStatus=""
        initialPositions={initialPositions} onPositionsChange={onPositionsChange}
      />
    );

    const transform = container.querySelector('[data-node-key="goblin_cave"]').getAttribute("transform");
    expect(transform).toBe("translate(500, 500)");
    expect(onPositionsChange).toHaveBeenLastCalledWith(initialPositions);
  });
});
