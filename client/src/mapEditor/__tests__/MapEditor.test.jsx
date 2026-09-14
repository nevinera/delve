import {describe, it, expect, vi, beforeEach, afterEach} from "vitest";
import {render, screen, fireEvent, waitFor} from "@testing-library/react";
import MapEditor from "../MapEditor";

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

    expect(screen.getByText(/Unit 1: Goblin Raider/)).toBeInTheDocument();
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
    fireEvent.click(screen.getByRole("button", {name: "0, 0"})); // the position pill
    expect(screen.getByText("Placing Points")).toBeInTheDocument();

    fireEvent.pointerDown(wrapper, {clientX: 50, clientY: 0}); // (50, 0)px -> (10, 120)ft at 5px/ft

    expect(screen.queryByText("Placing Points")).not.toBeInTheDocument();
    expect(screen.getByRole("button", {name: "10, 120"})).toBeInTheDocument();
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
});
