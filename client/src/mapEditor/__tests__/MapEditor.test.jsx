import {describe, it, expect, vi, beforeEach, afterEach} from "vitest";
import {render, screen, fireEvent, waitFor, act} from "@testing-library/react";
import MapEditor from "../MapEditor";
import {commitFiles, GithubAuthError} from "../../github/commitFiles";
import {validateMap} from "../../validators/validateContent";

vi.mock("../../github/commitFiles", async (importOriginal) => {
  const actual = await importOriginal();
  return {...actual, commitFiles: vi.fn()};
});

vi.mock("../../validators/validateContent", () => ({
  validateMap: vi.fn(),
}));

// jsdom doesn't decode real image bytes, so Image().src never fires a real
// onload - stub it to synchronously report a fixed size, like a real image
// would once loaded.
class FakeImage {
  set src(_value) {
    this.naturalWidth = 800;
    this.naturalHeight = 600;
    this.onload?.();
  }
}

function file(name, {type = "image/png", size = 1024} = {}) {
  const f = new File([new Uint8Array(size)], name, {type});
  return f;
}

// Mirrors Build::MapsController#blank_map's shape.
const BLANK_MAP = {
  identifier: "gc1-entrance", name: "Gc1 Entrance", elvl: null,
  imageUrl: null, pixelDimensions: null, feetDimensions: null,
  barriers: [], connections: [], units: [],
};

describe("MapEditor", () => {
  beforeEach(() => {
    vi.stubGlobal("Image", FakeImage);
    URL.createObjectURL = vi.fn(() => "blob:fake");
    URL.revokeObjectURL = vi.fn();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("shows a file picker with no image yet", () => {
    render(<MapEditor mapKey="goblin-cave/gc1-entrance" initialMap={BLANK_MAP} />);
    expect(screen.getByText(/Choose a map image/)).toBeInTheDocument();
  });

  it("renders the (collapsible) sidebar alongside the canvas", () => {
    render(<MapEditor mapKey="goblin-cave/gc1-entrance" initialMap={BLANK_MAP} />);
    expect(document.querySelector(".map-editor-sidebar")).toBeInTheDocument();
  });

  it("rejects a non-image file without touching URL.createObjectURL", () => {
    render(<MapEditor mapKey="goblin-cave/gc1-entrance" initialMap={BLANK_MAP} />);
    const input = document.querySelector('input[type="file"]');

    fireEvent.change(input, {target: {files: [file("notes.txt", {type: "text/plain"})]}});

    expect(screen.getByText("Please choose an image file.")).toBeInTheDocument();
    expect(URL.createObjectURL).not.toHaveBeenCalled();
  });

  it("rejects an image over 25MB", () => {
    render(<MapEditor mapKey="goblin-cave/gc1-entrance" initialMap={BLANK_MAP} />);
    const input = document.querySelector('input[type="file"]');

    fireEvent.change(input, {target: {files: [file("huge.png", {size: 26 * 1024 * 1024})]}});

    expect(screen.getByText(/must be under 25\.0MB/)).toBeInTheDocument();
    expect(URL.createObjectURL).not.toHaveBeenCalled();
  });

  it("accepts a valid image and renders the canvas toolbar", async () => {
    render(<MapEditor mapKey="goblin-cave/gc1-entrance" initialMap={BLANK_MAP} />);
    const input = document.querySelector('input[type="file"]');

    fireEvent.change(input, {target: {files: [file("map.png")]}});

    await waitFor(() => expect(screen.getByRole("button", {name: "Fit"})).toBeInTheDocument());
    expect(screen.queryByText(/Choose a map image/)).not.toBeInTheDocument();
  });

  it("shows an existing map's image immediately, without requiring a re-upload", () => {
    render(
      <MapEditor
        mapKey="goblin-cave/gc1-entrance"
        initialMap={{...BLANK_MAP, pixelDimensions: {width: 2048, height: 1536}}}
        initialImageDataUri="data:image/webp;base64,AAAA"
        initialPixelDimensions={{width: 2048, height: 1536}}
      />
    );

    expect(screen.queryByText(/Choose a map image/)).not.toBeInTheDocument();
    expect(screen.getByRole("button", {name: "Fit"})).toBeInTheDocument();
    expect(document.querySelector(".map-canvas-content img").src).toBe("data:image/webp;base64,AAAA");
  });

  it("flows a feetDimensions edit from the fields panel into the canvas grid", () => {
    render(
      <MapEditor
        mapKey="goblin-cave/gc1-entrance"
        initialMap={{...BLANK_MAP, pixelDimensions: {width: 2048, height: 1536}}}
        initialImageDataUri="data:image/webp;base64,AAAA"
        initialPixelDimensions={{width: 2048, height: 1536}}
      />
    );
    expect(document.querySelector(".map-canvas-grid")).not.toBeInTheDocument();

    fireEvent.change(document.querySelectorAll(".map-fields-dimension-pair input")[0], {target: {value: "60"}});
    fireEvent.change(document.querySelectorAll(".map-fields-dimension-pair input")[1], {target: {value: "45"}});

    expect(document.querySelector(".map-canvas-grid")).toBeInTheDocument();
  });

  it("keeps the draft's pixelDimensions in sync with whatever image is actually loaded", async () => {
    render(<MapEditor mapKey="goblin-cave/gc1-entrance" initialMap={BLANK_MAP} />);

    fireEvent.change(document.querySelector('input[type="file"]'), {target: {files: [file("map.png")]}});
    await waitFor(() => expect(screen.getByRole("button", {name: "Fit"})).toBeInTheDocument());

    expect(screen.getByText("800 × 600")).toBeInTheDocument();
  });

  it("adds a wall via the sidebar's '+ Add Wall' button", () => {
    render(
      <MapEditor
        mapKey="goblin-cave/gc1-entrance"
        initialMap={{...BLANK_MAP, pixelDimensions: {width: 800, height: 600}, feetDimensions: {width: 160, height: 120}}}
        initialImageDataUri="data:image/webp;base64,AAAA"
        initialPixelDimensions={{width: 800, height: 600}}
      />
    );

    // The Barriers section starts collapsed.
    fireEvent.click(document.querySelector(".map-sidebar-section-heading"));
    fireEvent.click(screen.getByRole("button", {name: "+ Add Wall"}));

    expect(screen.getByText(/Barrier 1: wall/)).toBeInTheDocument();
  });

  it("flows the sidebar's '+ Add Circle' button into a canvas drag, creating a circle barrier and reverting the tool", () => {
    render(
      <MapEditor
        mapKey="goblin-cave/gc1-entrance"
        initialMap={{...BLANK_MAP, pixelDimensions: {width: 800, height: 600}, feetDimensions: {width: 160, height: 120}}}
        initialImageDataUri="data:image/webp;base64,AAAA"
        initialPixelDimensions={{width: 800, height: 600}}
      />
    );
    const wrapper = document.querySelector(".map-canvas-wrapper");
    Object.defineProperty(wrapper, "clientWidth", {value: 800, configurable: true});
    Object.defineProperty(wrapper, "clientHeight", {value: 600, configurable: true});
    fireEvent.click(screen.getByRole("button", {name: "Fit"}));

    fireEvent.click(document.querySelector(".map-sidebar-section-heading"));
    fireEvent.click(screen.getByRole("button", {name: "+ Add Circle"}));
    expect(screen.getByRole("button", {name: "+ Add Circle"})).toBeDisabled();

    fireEvent.pointerDown(wrapper, {clientX: 0, clientY: 0, pointerId: 1});
    fireEvent.pointerMove(wrapper, {clientX: 25, clientY: 0, pointerId: 1});
    fireEvent.pointerUp(wrapper, {clientX: 25, clientY: 0, pointerId: 1});

    expect(screen.getByText(/Barrier 1: circle/)).toBeInTheDocument();
    // Single-shot - the tool reverted to "select", so the button's enabled again.
    expect(screen.getByRole("button", {name: "+ Add Circle"})).not.toBeDisabled();
  });

  it("flows the sidebar's '+ Add Point Connection' button into a single canvas click, creating a point connection", () => {
    render(
      <MapEditor
        mapKey="goblin-cave/gc1-entrance"
        initialMap={{...BLANK_MAP, pixelDimensions: {width: 800, height: 600}, feetDimensions: {width: 160, height: 120}}}
        initialImageDataUri="data:image/webp;base64,AAAA"
        initialPixelDimensions={{width: 800, height: 600}}
      />
    );
    const wrapper = document.querySelector(".map-canvas-wrapper");
    Object.defineProperty(wrapper, "clientWidth", {value: 800, configurable: true});
    Object.defineProperty(wrapper, "clientHeight", {value: 600, configurable: true});
    fireEvent.click(screen.getByRole("button", {name: "Fit"}));

    fireEvent.click(document.querySelectorAll(".map-sidebar-section-heading")[1]); // Connections
    fireEvent.click(screen.getByRole("button", {name: "+ Add Point Connection"}));

    fireEvent.pointerDown(wrapper, {clientX: 0, clientY: 0});

    expect(screen.getByText(/Connection 1: point/)).toBeInTheDocument();
    expect(screen.getByRole("button", {name: "+ Add Point Connection"})).not.toBeDisabled();
  });

  it("flows the sidebar's '+ Add Line Connection' button into a canvas drag, creating a line connection", () => {
    render(
      <MapEditor
        mapKey="goblin-cave/gc1-entrance"
        initialMap={{...BLANK_MAP, pixelDimensions: {width: 800, height: 600}, feetDimensions: {width: 160, height: 120}}}
        initialImageDataUri="data:image/webp;base64,AAAA"
        initialPixelDimensions={{width: 800, height: 600}}
      />
    );
    const wrapper = document.querySelector(".map-canvas-wrapper");
    Object.defineProperty(wrapper, "clientWidth", {value: 800, configurable: true});
    Object.defineProperty(wrapper, "clientHeight", {value: 600, configurable: true});
    fireEvent.click(screen.getByRole("button", {name: "Fit"}));

    fireEvent.click(document.querySelectorAll(".map-sidebar-section-heading")[1]); // Connections
    fireEvent.click(screen.getByRole("button", {name: "+ Add Line Connection"}));

    fireEvent.pointerDown(wrapper, {clientX: 0, clientY: 0, pointerId: 1});
    fireEvent.pointerMove(wrapper, {clientX: 50, clientY: 0, pointerId: 1});
    fireEvent.pointerUp(wrapper, {clientX: 50, clientY: 0, pointerId: 1});

    expect(screen.getByText(/Connection 1: line/)).toBeInTheDocument();
    expect(screen.getByRole("button", {name: "+ Add Line Connection"})).not.toBeDisabled();
  });

  it("flows choosing a unit type + '+ Add Unit' into a single canvas click, creating a unit", () => {
    render(
      <MapEditor
        mapKey="goblin-cave/gc1-entrance"
        initialMap={{...BLANK_MAP, pixelDimensions: {width: 800, height: 600}, feetDimensions: {width: 160, height: 120}}}
        initialImageDataUri="data:image/webp;base64,AAAA"
        initialAvailableUnitTypeKeys={["goblin-raider"]}
        initialUnitTypeDetails={{"goblin-raider": {name: "Goblin Raider", tokenImageUrl: null}}}
        initialPixelDimensions={{width: 800, height: 600}}
      />
    );
    const wrapper = document.querySelector(".map-canvas-wrapper");
    Object.defineProperty(wrapper, "clientWidth", {value: 800, configurable: true});
    Object.defineProperty(wrapper, "clientHeight", {value: 600, configurable: true});
    fireEvent.click(screen.getByRole("button", {name: "Fit"}));

    fireEvent.click(document.querySelectorAll(".map-sidebar-section-heading")[2]); // Units
    fireEvent.change(screen.getByRole("combobox"), {target: {value: "goblin-raider"}});
    fireEvent.click(screen.getByRole("button", {name: "+ Add Unit"}));

    fireEvent.pointerDown(wrapper, {clientX: 0, clientY: 0});

    expect(document.querySelector(".map-unit-row-name")).toHaveTextContent("Unit 1");
    expect(document.querySelector(".map-unit-row-type")).toHaveTextContent("Goblin Raider");
    // Single-shot - the tool reverted to "select", so the button's enabled
    // again (the dropdown's own choice isn't cleared by placing one).
    expect(screen.getByRole("button", {name: "+ Add Unit"})).not.toBeDisabled();
  });

  it("flows a click on a unit's position pill into re-placing it via a map click", () => {
    render(
      <MapEditor
        mapKey="goblin-cave/gc1-entrance"
        initialMap={{
          ...BLANK_MAP, pixelDimensions: {width: 800, height: 600}, feetDimensions: {width: 160, height: 120},
          units: [{unitType: "goblin-raider", identifier: "a", position: {x: 0, y: 0, angle: 0}, hostility: "hostile", currentHpFraction: 1, movement: {type: "still"}}],
        }}
        initialImageDataUri="data:image/webp;base64,AAAA"
        initialAvailableUnitTypeKeys={["goblin-raider"]}
        initialUnitTypeDetails={{"goblin-raider": {name: "Goblin Raider", tokenImageUrl: null}}}
        initialPixelDimensions={{width: 800, height: 600}}
      />
    );
    const wrapper = document.querySelector(".map-canvas-wrapper");
    Object.defineProperty(wrapper, "clientWidth", {value: 800, configurable: true});
    Object.defineProperty(wrapper, "clientHeight", {value: 600, configurable: true});
    fireEvent.click(screen.getByRole("button", {name: "Fit"}));

    fireEvent.click(document.querySelectorAll(".map-sidebar-section-heading")[2]); // Units
    fireEvent.click(document.querySelector(".map-unit-row")); // expand the unit's row
    fireEvent.click(screen.getByRole("button", {name: "0, 0"})); // the position pill
    expect(screen.getByText("Placing Points")).toBeInTheDocument();

    fireEvent.pointerDown(wrapper, {clientX: 50, clientY: 0}); // (50, 0)px -> (10, 120)ft at 5px/ft

    expect(screen.queryByText("Placing Points")).not.toBeInTheDocument();
    expect(screen.getByRole("button", {name: "10, 120"})).toBeInTheDocument();
  });

  it("clicking a unit's token on the map opens only that unit's row and scrolls it into view, closing any others already open", () => {
    Element.prototype.scrollIntoView = vi.fn();
    render(
      <MapEditor
        mapKey="goblin-cave/gc1-entrance"
        initialMap={{
          ...BLANK_MAP, pixelDimensions: {width: 800, height: 600}, feetDimensions: {width: 160, height: 120},
          units: [
            {unitType: "goblin-raider", identifier: "a", position: {x: 5, y: 5, angle: 0}, hostility: "hostile", currentHpFraction: 1, movement: {type: "still"}},
            {unitType: "goblin-raider", identifier: "b", position: {x: 50, y: 5, angle: 0}, hostility: "hostile", currentHpFraction: 1, movement: {type: "still"}},
          ],
        }}
        initialImageDataUri="data:image/webp;base64,AAAA"
        initialAvailableUnitTypeKeys={["goblin-raider"]}
        initialUnitTypeDetails={{"goblin-raider": {name: "Goblin Raider", tokenImageUrl: null}}}
        initialPixelDimensions={{width: 800, height: 600}}
      />
    );
    const wrapper = document.querySelector(".map-canvas-wrapper");
    Object.defineProperty(wrapper, "clientWidth", {value: 800, configurable: true});
    Object.defineProperty(wrapper, "clientHeight", {value: 600, configurable: true});
    fireEvent.click(screen.getByRole("button", {name: "Fit"}));

    fireEvent.click(document.querySelectorAll(".map-sidebar-section-heading")[2]); // Units
    const rows = document.querySelectorAll(".map-unit-row");
    fireEvent.click(rows[0]);
    fireEvent.click(rows[1]);
    expect(document.querySelectorAll(".map-unit-body")).toHaveLength(2);

    const markers = document.querySelectorAll(".map-canvas-shapes g");
    fireEvent.pointerDown(markers[0]);

    const bodies = document.querySelectorAll(".map-unit-body");
    expect(bodies).toHaveLength(1);
    expect(document.querySelectorAll(".map-unit-block")[0].querySelector(".map-unit-body")).toBeInTheDocument();
    expect(Element.prototype.scrollIntoView).toHaveBeenCalled();
  });

  it("flows a coordinate pill click in the sidebar into re-placing an existing point connection", () => {
    render(
      <MapEditor
        mapKey="goblin-cave/gc1-entrance"
        initialMap={{
          ...BLANK_MAP, pixelDimensions: {width: 800, height: 600}, feetDimensions: {width: 160, height: 120},
          connections: [{identifier: "a", type: "point", position: {x: 0, y: 0, angle: 0}, fuzzRadius: 2, fuzzAngle: 90}],
        }}
        initialImageDataUri="data:image/webp;base64,AAAA"
        initialPixelDimensions={{width: 800, height: 600}}
      />
    );
    const wrapper = document.querySelector(".map-canvas-wrapper");
    Object.defineProperty(wrapper, "clientWidth", {value: 800, configurable: true});
    Object.defineProperty(wrapper, "clientHeight", {value: 600, configurable: true});
    fireEvent.click(screen.getByRole("button", {name: "Fit"}));

    fireEvent.click(document.querySelectorAll(".map-sidebar-section-heading")[1]); // Connections
    fireEvent.click(screen.getByRole("button", {name: "0, 0"})); // the position pill
    expect(screen.getByText("Placing Points")).toBeInTheDocument();

    fireEvent.pointerDown(wrapper, {clientX: 50, clientY: 0}); // (50, 0)px -> (10, 120)ft at 5px/ft

    expect(screen.queryByText("Placing Points")).not.toBeInTheDocument();
    expect(screen.getByRole("button", {name: "10, 120"})).toBeInTheDocument();
  });

  it("starting a barrier-point placement cancels an in-progress connection-field placement", () => {
    render(
      <MapEditor
        mapKey="goblin-cave/gc1-entrance"
        initialMap={{
          ...BLANK_MAP, pixelDimensions: {width: 800, height: 600}, feetDimensions: {width: 160, height: 120},
          barriers: [{type: "wall", locations: [{x: 0, y: 0}, {x: 10, y: 0}]}],
          connections: [{identifier: "a", type: "point", position: {x: 0, y: 0, angle: 0}, fuzzRadius: 2, fuzzAngle: 90}],
        }}
        initialImageDataUri="data:image/webp;base64,AAAA"
        initialPixelDimensions={{width: 800, height: 600}}
      />
    );

    fireEvent.click(document.querySelectorAll(".map-sidebar-section-heading")[1]); // Connections
    fireEvent.click(screen.getByRole("button", {name: "0, 0"}));
    expect(screen.getByText("Placing Points")).toBeInTheDocument();

    fireEvent.click(document.querySelectorAll(".map-sidebar-section-heading")[0]); // Barriers
    fireEvent.click(screen.getByText(/Barrier 1: wall/));
    fireEvent.click(document.querySelectorAll(".map-point-plus")[0]);

    // Still just one "Placing Points" status - the connection pill's own
    // placement was cancelled when the barrier one started.
    expect(screen.getAllByText("Placing Points").length).toBe(1);
  });

  it("flows a '+' click in the sidebar into placement mode, then a map click into a new pill", () => {
    render(
      <MapEditor
        mapKey="goblin-cave/gc1-entrance"
        initialMap={{...BLANK_MAP, pixelDimensions: {width: 800, height: 600}, feetDimensions: {width: 160, height: 120}, barriers: [{type: "wall", locations: [{x: 0, y: 0}, {x: 10, y: 0}]}]}}
        initialImageDataUri="data:image/webp;base64,AAAA"
        initialPixelDimensions={{width: 800, height: 600}}
      />
    );
    const wrapper = document.querySelector(".map-canvas-wrapper");
    Object.defineProperty(wrapper, "clientWidth", {value: 800, configurable: true});
    Object.defineProperty(wrapper, "clientHeight", {value: 600, configurable: true});
    fireEvent.click(screen.getByRole("button", {name: "Fit"}));

    // Expand Barriers, select the wall, start placement via its leading "+".
    fireEvent.click(document.querySelector(".map-sidebar-section-heading"));
    fireEvent.click(screen.getByText(/Barrier 1: wall/));
    expect(screen.queryByText("Placing Points")).not.toBeInTheDocument();
    fireEvent.click(document.querySelectorAll(".map-point-plus")[0]);
    expect(screen.getByText("Placing Points")).toBeInTheDocument();

    fireEvent.pointerDown(wrapper, {clientX: 0, clientY: 300});

    // (0, 300)px -> (0, 60)ft at 5px/ft - inserted before the existing points.
    expect(document.querySelectorAll(".map-point-pill")[0]).toHaveTextContent("0, 60");
    // Placement auto-advances rather than exiting - a pending pill still shows.
    expect(document.querySelector(".map-point-pill-pending")).toBeInTheDocument();
  });

  it("cancels placement on Escape, from the canvas", () => {
    render(
      <MapEditor
        mapKey="goblin-cave/gc1-entrance"
        initialMap={{...BLANK_MAP, pixelDimensions: {width: 800, height: 600}, feetDimensions: {width: 160, height: 120}, barriers: [{type: "wall", locations: [{x: 0, y: 0}, {x: 10, y: 0}]}]}}
        initialImageDataUri="data:image/webp;base64,AAAA"
        initialPixelDimensions={{width: 800, height: 600}}
      />
    );

    fireEvent.click(document.querySelector(".map-sidebar-section-heading"));
    fireEvent.click(screen.getByText(/Barrier 1: wall/));
    fireEvent.click(document.querySelectorAll(".map-point-plus")[0]);
    expect(screen.getByText("Placing Points")).toBeInTheDocument();

    fireEvent.keyDown(document, {key: "Escape"});

    expect(screen.queryByText("Placing Points")).not.toBeInTheDocument();
    expect(document.querySelector(".map-point-pill-pending")).not.toBeInTheDocument();
    // Nothing was written for the cancelled point.
    expect(document.querySelectorAll(".map-point-pill").length).toBe(2);
  });

  it("flows a click on an existing pill into edit placement, then a map click replaces that point in place", () => {
    render(
      <MapEditor
        mapKey="goblin-cave/gc1-entrance"
        initialMap={{...BLANK_MAP, pixelDimensions: {width: 800, height: 600}, feetDimensions: {width: 160, height: 120}, barriers: [{type: "wall", locations: [{x: 0, y: 0}, {x: 10, y: 0}]}]}}
        initialImageDataUri="data:image/webp;base64,AAAA"
        initialPixelDimensions={{width: 800, height: 600}}
      />
    );
    const wrapper = document.querySelector(".map-canvas-wrapper");
    Object.defineProperty(wrapper, "clientWidth", {value: 800, configurable: true});
    Object.defineProperty(wrapper, "clientHeight", {value: 600, configurable: true});
    fireEvent.click(screen.getByRole("button", {name: "Fit"}));

    fireEvent.click(document.querySelector(".map-sidebar-section-heading"));
    fireEvent.click(screen.getByText(/Barrier 1: wall/));

    // Click the second pill (10, 0) rather than a "+".
    fireEvent.click(document.querySelectorAll(".map-point-pill")[1]);
    expect(screen.getByText("Placing Points")).toBeInTheDocument();
    expect(document.querySelectorAll(".map-point-pill")[1]).toHaveTextContent("…");
    // The wall still has exactly 2 points during edit - nothing inserted.
    expect(document.querySelectorAll(".map-point-pill").length).toBe(2);

    fireEvent.pointerDown(wrapper, {clientX: 0, clientY: 300}); // (0, 300)px -> (0, 60)ft

    // Replaced in place, still 2 pills, and placement exited (no auto-advance).
    expect(document.querySelectorAll(".map-point-pill").length).toBe(2);
    expect(document.querySelectorAll(".map-point-pill")[1]).toHaveTextContent("0, 60");
    expect(screen.queryByText("Placing Points")).not.toBeInTheDocument();
  });

  describe("refreshing available unit types", () => {
    beforeEach(() => {
      global.fetch = vi.fn();
    });

    it("adds a newly-fetched unit type key to the dropdown without a page reload", async () => {
      // The key list is cheap (no per-file fetch, see
      // Build::MapsController#list_unit_type_keys) - it shows up by its raw
      // key until actually chosen, not a friendly name yet.
      global.fetch.mockResolvedValue({ok: true, json: () => Promise.resolve(["goblin-raider"])});
      render(
        <MapEditor
          mapKey="goblin-cave/gc1-entrance" initialMap={BLANK_MAP}
          initialAvailableUnitTypeKeys={[]} availableUnitTypesUrl="/build/maps/goblin-cave/gc1-entrance/available_unit_types"
        />
      );

      fireEvent.click(document.querySelectorAll(".map-sidebar-section-heading")[2]); // Units
      expect(screen.queryByRole("option", {name: "goblin-raider"})).not.toBeInTheDocument();

      fireEvent.click(screen.getByRole("button", {name: "Refresh"}));
      await waitFor(() => expect(screen.getByText("Refreshed.")).toBeInTheDocument());

      expect(screen.getByRole("option", {name: "goblin-raider"})).toBeInTheDocument();
    });

    it("shows an error message when the refresh request fails", async () => {
      global.fetch.mockResolvedValue({ok: false, status: 500});
      render(<MapEditor mapKey="goblin-cave/gc1-entrance" initialMap={BLANK_MAP} initialAvailableUnitTypeKeys={[]} />);

      fireEvent.click(document.querySelectorAll(".map-sidebar-section-heading")[2]); // Units
      fireEvent.click(screen.getByRole("button", {name: "Refresh"}));

      await waitFor(() => expect(screen.getByText(/Refresh failed/)).toBeInTheDocument());
    });

    it("refreshes both unit type and item key lists from the one shared button", async () => {
      global.fetch = vi.fn((url) => Promise.resolve({
        ok: true,
        json: () => Promise.resolve(url.includes("available_unit_types") ? ["goblin-raider"] : ["sword-of-doom"]),
      }));
      render(
        <MapEditor
          mapKey="goblin-cave/gc1-entrance"
          initialMap={{
            ...BLANK_MAP,
            units: [{unitType: "goblin-raider", identifier: "a", position: {x: 0, y: 0, angle: 0}, hostility: "hostile", currentHpFraction: 1, movement: {type: "still"}}],
          }}
          initialAvailableUnitTypeKeys={[]} availableUnitTypesUrl="/build/maps/goblin-cave/gc1-entrance/available_unit_types"
          initialAvailableItemKeys={[]} availableItemsUrl="/build/maps/goblin-cave/gc1-entrance/available_items"
        />
      );

      fireEvent.click(document.querySelectorAll(".map-sidebar-section-heading")[2]); // Units
      fireEvent.click(document.querySelector(".map-unit-row")); // expand the unit's row, revealing its Type dropdown
      expect(screen.queryAllByRole("option", {name: "goblin-raider"}).length).toBe(0);
      expect(screen.queryAllByRole("option", {name: "sword-of-doom"}).length).toBe(0);

      fireEvent.click(screen.getByRole("button", {name: "Refresh"}));
      await waitFor(() => expect(screen.getByText("Refreshed.")).toBeInTheDocument());

      // "goblin-raider" now shows up in both the "+ Add Unit" dropdown and
      // the existing unit's own Type dropdown.
      expect(screen.getAllByRole("option", {name: "goblin-raider"}).length).toBe(2);
      expect(screen.getAllByRole("option", {name: "sword-of-doom"}).length).toBe(1);
    });
  });

  describe("loot tables", () => {
    it("flows choosing an item + '+ Add Loot Entry' into a unit's lootTable at weight 1", () => {
      render(
        <MapEditor
          mapKey="goblin-cave/gc1-entrance"
          initialMap={{
            ...BLANK_MAP, pixelDimensions: {width: 800, height: 600}, feetDimensions: {width: 160, height: 120},
            units: [{unitType: "goblin-raider", identifier: "a", position: {x: 0, y: 0, angle: 0}, hostility: "hostile", currentHpFraction: 1, movement: {type: "still"}}],
          }}
          initialImageDataUri="data:image/webp;base64,AAAA"
          initialPixelDimensions={{width: 800, height: 600}}
          initialAvailableItemKeys={["sword-of-doom"]}
          initialItemDetails={{"sword-of-doom": {identifier: "sword-of-doom", name: "Sword of Doom", slot: "main_hand"}}}
        />
      );

      fireEvent.click(document.querySelectorAll(".map-sidebar-section-heading")[2]); // Units
      fireEvent.click(document.querySelector(".map-unit-row")); // expand the unit's row, revealing its loot table
      const itemSelect = screen.getAllByRole("combobox").find((el) => el.querySelector('option[value="sword-of-doom"]'));
      fireEvent.change(itemSelect, {target: {value: "sword-of-doom"}});
      fireEvent.click(screen.getByRole("button", {name: "+ Add Loot Entry"}));

      expect(screen.getByText("Sword of Doom")).toBeInTheDocument();
      expect(document.querySelector(".map-loot-entry input")).toHaveValue(1);
    });
  });

  describe("unit groups", () => {
    function twoUnitMap() {
      return {
        ...BLANK_MAP, pixelDimensions: {width: 800, height: 600}, feetDimensions: {width: 160, height: 120},
        units: [
          {unitType: "goblin-raider", identifier: "a", position: {x: 5, y: 5, angle: 0}, hostility: "hostile", currentHpFraction: 1, movement: {type: "still"}},
          {unitType: "goblin-raider", identifier: "b", position: {x: 50, y: 5, angle: 0}, hostility: "hostile", currentHpFraction: 1, movement: {type: "still"}},
        ],
      };
    }

    function renderWithTwoUnits() {
      render(
        <MapEditor
          mapKey="goblin-cave/gc1-entrance"
          initialMap={twoUnitMap()}
          initialImageDataUri="data:image/webp;base64,AAAA"
          initialPixelDimensions={{width: 800, height: 600}}
        />
      );
      const wrapper = document.querySelector(".map-canvas-wrapper");
      Object.defineProperty(wrapper, "clientWidth", {value: 800, configurable: true});
      Object.defineProperty(wrapper, "clientHeight", {value: 600, configurable: true});
      fireEvent.click(screen.getByRole("button", {name: "Fit"}));
      fireEvent.click(document.querySelectorAll(".map-sidebar-section-heading")[2]); // Units
      return wrapper;
    }

    it("'+ Add Group' immediately enters grouping mode, and clicking units (map token + sidebar row) adds both", () => {
      renderWithTwoUnits();

      fireEvent.change(screen.getByPlaceholderText("New group name…"), {target: {value: "raiders"}});
      fireEvent.click(screen.getByRole("button", {name: "+ Add Group"}));
      expect(screen.getByRole("button", {name: "Done"})).toBeInTheDocument();

      // Add the first unit via its token on the map.
      const marker = document.querySelectorAll(".map-canvas-shapes g")[0];
      fireEvent.pointerDown(marker, {pointerId: 1});

      // Add the second unit via its row in the sidebar.
      const rows = document.querySelectorAll(".map-unit-row");
      const ungroupedRow = [...rows].find((r) => r.querySelector(".map-unit-row-name")?.textContent === "b");
      fireEvent.click(ungroupedRow);

      expect(document.querySelector(".map-unit-group-count")).toHaveTextContent("(2)");
      const highlight = document.querySelector(".map-group-highlight");
      expect(highlight.querySelectorAll("circle")).toHaveLength(2);
      expect(highlight.querySelectorAll("line")).toHaveLength(1);
    });

    it("clicking a group member again (while grouping mode is active) removes it", () => {
      renderWithTwoUnits();

      fireEvent.change(screen.getByPlaceholderText("New group name…"), {target: {value: "raiders"}});
      fireEvent.click(screen.getByRole("button", {name: "+ Add Group"}));
      const marker = document.querySelectorAll(".map-canvas-shapes g")[0];
      fireEvent.pointerDown(marker, {pointerId: 1});
      expect(document.querySelector(".map-unit-group-count")).toHaveTextContent("(1)");

      fireEvent.pointerDown(marker, {pointerId: 1});

      expect(document.querySelector(".map-unit-group-count")).toHaveTextContent("(0)");
    });

    it("Escape exits grouping mode", () => {
      renderWithTwoUnits();
      fireEvent.change(screen.getByPlaceholderText("New group name…"), {target: {value: "raiders"}});
      fireEvent.click(screen.getByRole("button", {name: "+ Add Group"}));
      expect(screen.getByRole("button", {name: "Done"})).toBeInTheDocument();

      fireEvent.keyDown(document, {key: "Escape"});

      expect(screen.getByRole("button", {name: "Add/Remove Units"})).toBeInTheDocument();
    });
  });

  describe("movement", () => {
    function renderWithOneUnit() {
      render(
        <MapEditor
          mapKey="goblin-cave/gc1-entrance"
          initialMap={{
            ...BLANK_MAP, pixelDimensions: {width: 800, height: 600}, feetDimensions: {width: 160, height: 120},
            units: [{unitType: "goblin-raider", identifier: "a", position: {x: 0, y: 0, angle: 0}, hostility: "hostile", currentHpFraction: 1, movement: {type: "still"}}],
          }}
          initialImageDataUri="data:image/webp;base64,AAAA"
          initialPixelDimensions={{width: 800, height: 600}}
        />
      );
      const wrapper = document.querySelector(".map-canvas-wrapper");
      Object.defineProperty(wrapper, "clientWidth", {value: 800, configurable: true});
      Object.defineProperty(wrapper, "clientHeight", {value: 600, configurable: true});
      fireEvent.click(screen.getByRole("button", {name: "Fit"}));
      fireEvent.click(document.querySelectorAll(".map-sidebar-section-heading")[2]); // Units
      fireEvent.click(document.querySelector(".map-unit-row")); // expand the unit's row
      return wrapper;
    }

    it("switches a unit to patrol, lays down two consecutive steps via '+' then clicks, and draws the path", () => {
      const wrapper = renderWithOneUnit();

      const movementSelect = screen.getAllByRole("combobox").find((el) => el.querySelector('option[value="patrol"]'));
      fireEvent.change(movementSelect, {target: {value: "patrol"}});
      fireEvent.click(document.querySelector(".map-unit-movement-fields .map-point-plus"));

      fireEvent.pointerDown(wrapper, {clientX: 50, clientY: 0}); // -> (10,120)ft
      fireEvent.pointerDown(wrapper, {clientX: 100, clientY: 0}); // -> (20,120)ft, auto-advanced

      expect(screen.getByRole("button", {name: "10, 120"})).toBeInTheDocument();
      expect(screen.getByRole("button", {name: "20, 120"})).toBeInTheDocument();
      const overlay = document.querySelector(".map-movement-highlight");
      expect(overlay.querySelector("polyline")).toBeInTheDocument();

      fireEvent.keyDown(document, {key: "Escape"}); // stop the still-armed placement
    });

    it("inserts a step between two existing ones via that gap's '+', without disturbing the others", () => {
      render(
        <MapEditor
          mapKey="goblin-cave/gc1-entrance"
          initialMap={{
            ...BLANK_MAP, pixelDimensions: {width: 800, height: 600}, feetDimensions: {width: 160, height: 120},
            units: [{
              unitType: "goblin-raider", identifier: "a", position: {x: 0, y: 0, angle: 0}, hostility: "hostile", currentHpFraction: 1,
              movement: {
                type: "patrol", choose: "loop",
                steps: [
                  {position: {x: 5, y: 5, angle: 0}, movementRate: 0.5, waitTime: 1},
                  {position: {x: 50, y: 5, angle: 0}, movementRate: 0.5, waitTime: 1},
                ],
              },
            }],
          }}
          initialImageDataUri="data:image/webp;base64,AAAA"
          initialPixelDimensions={{width: 800, height: 600}}
        />
      );
      const wrapper = document.querySelector(".map-canvas-wrapper");
      Object.defineProperty(wrapper, "clientWidth", {value: 800, configurable: true});
      Object.defineProperty(wrapper, "clientHeight", {value: 600, configurable: true});
      fireEvent.click(screen.getByRole("button", {name: "Fit"}));
      fireEvent.click(document.querySelectorAll(".map-sidebar-section-heading")[2]); // Units
      fireEvent.click(document.querySelector(".map-unit-row"));

      const plusButtons = document.querySelectorAll(".map-unit-movement-fields .map-point-plus");
      expect(plusButtons).toHaveLength(2); // between the two steps, and after the last - none before step 0
      fireEvent.click(plusButtons[0]); // between the two existing steps
      fireEvent.pointerDown(wrapper, {clientX: 50, clientY: 0}); // -> (10,120)ft

      const pills = [...document.querySelectorAll(".map-patrol-step-pill")].map((p) => p.textContent);
      expect(pills).toEqual(["5, 5", "10, 120", "50, 5"]);
    });

    it("switches a unit to wander, re-places its location via the pill, and draws the dim circle", () => {
      const wrapper = renderWithOneUnit();

      const movementSelect = screen.getAllByRole("combobox").find((el) => el.querySelector('option[value="wander"]'));
      fireEvent.change(movementSelect, {target: {value: "wander"}});

      fireEvent.click(document.querySelector(".map-wander-location-btn")); // the seeded location pill
      fireEvent.pointerDown(wrapper, {clientX: 50, clientY: 0}); // -> (10,120)ft

      expect(screen.getByRole("button", {name: "10, 120"})).toBeInTheDocument();
      expect(document.querySelector(".map-movement-highlight circle")).toBeInTheDocument();
    });

    it("switching back to still clears the visualization", () => {
      renderWithOneUnit();
      const movementSelect = () => screen.getAllByRole("combobox").find((el) => el.querySelector('option[value="patrol"]'));
      fireEvent.change(movementSelect(), {target: {value: "patrol"}});
      fireEvent.click(document.querySelector(".map-unit-movement-fields .map-point-plus"));
      const wrapper = document.querySelector(".map-canvas-wrapper");
      fireEvent.pointerDown(wrapper, {clientX: 50, clientY: 0});
      fireEvent.keyDown(document, {key: "Escape"});
      expect(document.querySelector(".map-movement-highlight polyline")).toBeInTheDocument();

      const stillSelect = screen.getAllByRole("combobox").find((el) => el.querySelector('option[value="still"]'));
      fireEvent.change(stillSelect, {target: {value: "still"}});

      expect(document.querySelector(".map-movement-highlight polyline")).not.toBeInTheDocument();
      expect(document.querySelector(".map-movement-highlight circle")).not.toBeInTheDocument();
    });
  });

  describe("simulate units (slice 9)", () => {
    it("toggling into simulate mode hides the editing panels, blocks drags, animates the unit, and restores everything on stop", () => {
      let frameCallback = null;
      vi.stubGlobal("requestAnimationFrame", (cb) => { frameCallback = cb; return 1; });
      vi.stubGlobal("cancelAnimationFrame", () => {});
      let now = 1000;
      vi.spyOn(performance, "now").mockImplementation(() => now);

      render(
        <MapEditor
          mapKey="goblin-cave/gc1-entrance"
          initialMap={{
            ...BLANK_MAP, pixelDimensions: {width: 800, height: 600}, feetDimensions: {width: 160, height: 120},
            units: [{
              unitType: "goblin-raider", identifier: "a", position: {x: 0, y: 0, angle: 0}, hostility: "hostile", currentHpFraction: 1,
              movement: {
                type: "patrol", choose: "loop",
                steps: [
                  {position: {x: 0, y: 0, angle: 0}, movementRate: 1, waitTime: 0},
                  {position: {x: 50, y: 0, angle: 0}, movementRate: 1, waitTime: 0},
                ],
              },
            }],
          }}
          initialImageDataUri="data:image/webp;base64,AAAA"
          initialPixelDimensions={{width: 800, height: 600}}
        />
      );
      const wrapper = document.querySelector(".map-canvas-wrapper");
      Object.defineProperty(wrapper, "clientWidth", {value: 800, configurable: true});
      Object.defineProperty(wrapper, "clientHeight", {value: 600, configurable: true});
      fireEvent.click(screen.getByRole("button", {name: "Fit"}));

      fireEvent.click(screen.getByRole("button", {name: "Simulate Units"}));

      // Sidebar swaps to a status notice, hiding every editing control.
      expect(screen.getByText(/Simulating units/)).toBeInTheDocument();
      expect(screen.queryByRole("button", {name: "+ Add Unit"})).not.toBeInTheDocument();

      // Dragging the unit's token is a no-op while simulating.
      const marker = document.querySelector(".map-canvas-shapes g");
      const cxBefore = document.querySelector(".map-canvas-shapes circle").getAttribute("cx");
      fireEvent.pointerDown(marker, {pointerId: 1});
      fireEvent.pointerMove(wrapper, {clientX: 999, clientY: 999, pointerId: 1});
      expect(document.querySelector(".map-canvas-shapes circle").getAttribute("cx")).toBe(cxBefore);

      // Advance the animation loop - the token visibly moves.
      expect(frameCallback).toBeTypeOf("function");
      act(() => {
        for (let i = 0; i < 5; i++) {
          now += 20;
          frameCallback(now);
        }
      });
      expect(document.querySelector(".map-canvas-shapes circle").getAttribute("cx")).not.toBe(cxBefore);

      fireEvent.click(screen.getByRole("button", {name: "Stop Simulating"}));

      // Sidebar and editing controls are back, and the unit snapped back to
      // its authored position (0,0)ft - nothing was ever written to mapData.
      expect(screen.queryByText(/Simulating units/)).not.toBeInTheDocument();
      fireEvent.click(document.querySelectorAll(".map-sidebar-section-heading")[2]); // Units
      expect(screen.getByRole("button", {name: "+ Add Unit"})).toBeInTheDocument();
      expect(document.querySelector(".map-canvas-shapes circle").getAttribute("cx")).toBe(cxBefore);

      vi.restoreAllMocks();
      vi.unstubAllGlobals();
    });
  });

  describe("lazily loading unit type details", () => {
    it("fetches a unit type's details only once it's actually chosen in the dropdown", async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({"goblin-raider": {name: "Goblin Raider", tokenImageUrl: null}}),
      });
      render(
        <MapEditor
          mapKey="goblin-cave/gc1-entrance" initialMap={BLANK_MAP}
          initialAvailableUnitTypeKeys={["goblin-raider"]} initialUnitTypeDetails={{}}
          availableUnitTypesUrl="/build/maps/goblin-cave/gc1-entrance/available_unit_types"
        />
      );

      fireEvent.click(document.querySelectorAll(".map-sidebar-section-heading")[2]); // Units
      expect(fetch).not.toHaveBeenCalled();
      expect(screen.getByRole("option", {name: "goblin-raider"})).toBeInTheDocument();

      fireEvent.change(screen.getByRole("combobox"), {target: {value: "goblin-raider"}});

      expect(fetch).toHaveBeenCalledWith(expect.stringContaining("keys[]=goblin-raider"));
      await waitFor(() => expect(screen.getByRole("option", {name: "Goblin Raider"})).toBeInTheDocument());
    });
  });

  describe("choosing a background image", () => {
    it("sets imageUrl to a sibling filename based on the map's own key", async () => {
      render(<MapEditor mapKey="goblin-cave/gc1-entrance" initialMap={BLANK_MAP} />);
      const input = document.querySelector('input[type="file"]');

      fireEvent.change(input, {target: {files: [file("background.webp")]}});
      await waitFor(() => expect(screen.getByRole("button", {name: "Fit"})).toBeInTheDocument());

      validateMap.mockResolvedValue({valid: true});
      fireEvent.click(screen.getByRole("button", {name: "Validate"}));
      await waitFor(() => expect(validateMap).toHaveBeenCalledWith(expect.objectContaining({imageUrl: "gc1-entrance.webp"})));
    });
  });

  describe("validate/save", () => {
    it("validates, then allows saving (image + json) once valid", async () => {
      validateMap.mockResolvedValue({valid: true});
      commitFiles.mockResolvedValue({commitSha: "abc", branch: "main"});
      render(<MapEditor mapKey="goblin-cave/gc1-entrance" initialMap={BLANK_MAP} />);
      const input = document.querySelector('input[type="file"]');
      fireEvent.change(input, {target: {files: [file("background.webp")]}});
      await waitFor(() => expect(screen.getByRole("button", {name: "Fit"})).toBeInTheDocument());

      expect(screen.getByRole("button", {name: "Save"})).toBeDisabled();
      fireEvent.click(screen.getByRole("button", {name: "Validate"}));
      await waitFor(() => expect(screen.getByRole("button", {name: "Save"})).not.toBeDisabled());

      fireEvent.click(screen.getByRole("button", {name: "Save"}));
      await waitFor(() => expect(commitFiles).toHaveBeenCalledWith(
        {
          "zones/goblin-cave/gc1-entrance/gc1-entrance.json": expect.objectContaining({imageUrl: "gc1-entrance.webp"}),
          "zones/goblin-cave/gc1-entrance/gc1-entrance.webp": expect.any(File),
        },
        {message: "Update Gc1 Entrance"}
      ));
      await screen.findByText("Saved.");
    });

    it("shows the validation error message and re-disables Save", async () => {
      validateMap.mockResolvedValue({valid: false, error: {message: "feetDimensions is required", path: "$.feetDimensions"}});
      render(<MapEditor mapKey="goblin-cave/gc1-entrance" initialMap={BLANK_MAP} />);

      fireEvent.click(screen.getByRole("button", {name: "Validate"}));

      await screen.findByText("feetDimensions is required");
      expect(screen.getByRole("button", {name: "Save"})).toBeDisabled();
    });

    it("redirects to the GitHub reauth URL on a GithubAuthError during save", async () => {
      validateMap.mockResolvedValue({valid: true});
      commitFiles.mockRejectedValue(new GithubAuthError("reauth_required", "/github/reauth"));
      delete window.location;
      window.location = {href: ""};

      render(<MapEditor mapKey="goblin-cave/gc1-entrance" initialMap={BLANK_MAP} />);
      fireEvent.click(screen.getByRole("button", {name: "Validate"}));
      await waitFor(() => expect(screen.getByRole("button", {name: "Save"})).not.toBeDisabled());
      fireEvent.click(screen.getByRole("button", {name: "Save"}));

      await waitFor(() => expect(window.location.href).toBe("/github/reauth"));
    });
  });
});
