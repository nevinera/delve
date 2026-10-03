import {describe, it, expect, vi, beforeEach, afterEach} from "vitest";
import {useState} from "react";
import {render, screen, fireEvent, waitFor, act, within} from "@testing-library/react";
import MapWorkbench from "../MapWorkbench";
import {MapDraft} from "../MapDraft";

// The editing surface on its own, hosted the way the world editor's map
// level hosts it: mapData in state, onMapChange applying each MapDraft fn,
// and an upload turning into a displayable imageUrl.

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
  return new File([new Uint8Array(size)], name, {type});
}

const BLANK_MAP = {
  identifier: "gc1-entrance", name: "Gc1 Entrance", elvl: null,
  imageUrl: null, pixelDimensions: null, feetDimensions: null,
  barriers: [], connections: [], units: [],
};

let current;

async function renderReady({
  mapKey = "gc1-entrance", map = BLANK_MAP, imageUrl = null,
  unitTypeKeys = [], unitTypeDetails = {}, itemKeys = [], itemDetails = {},
} = {}) {
  current = {mapData: map, uploads: []};
  function Host() {
    const [mapData, setMapData] = useState(map);
    const [url, setUrl] = useState(imageUrl);
    current.mapData = mapData;
    return (
      <MapWorkbench
        mapKey={mapKey}
        mapData={mapData}
        onMapChange={(fn) => setMapData((data) => fn(new MapDraft(data)).data)}
        imageUrl={url}
        onImageUpload={(uploaded, name) => { current.uploads.push(name); setUrl(URL.createObjectURL(uploaded)); }}
        unitTypes={{keys: unitTypeKeys, details: unitTypeDetails}}
        items={{keys: itemKeys, details: itemDetails}}
        ncuTokenUrls={{}}
      />
    );
  }
  render(<Host />);
}

function showTab(name) {
  fireEvent.click(screen.getByRole("tab", {name}));
}

// The Units tab, with the first group in its list open.
function openFirstGroup() {
  showTab("Units");
  fireEvent.click(within(screen.getByRole("list", {name: "Groups"})).getAllByRole("button")[0]);
}

describe("MapWorkbench", () => {
  beforeEach(() => {
    vi.stubGlobal("Image", FakeImage);
    URL.createObjectURL = vi.fn(() => "blob:fake");
    URL.revokeObjectURL = vi.fn();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it("shows a file picker with no image yet", async () => {
    await renderReady({map: BLANK_MAP});
    expect(screen.getByText(/Choose a map image/)).toBeInTheDocument();
  });

  it("renders the (collapsible) sidebar alongside the canvas", async () => {
    await renderReady({map: BLANK_MAP});
    expect(document.querySelector(".map-editor-sidebar")).toBeInTheDocument();
  });

  it("rejects a non-image file without touching URL.createObjectURL", async () => {
    await renderReady({map: BLANK_MAP});
    const input = document.querySelector('input[type="file"]');

    fireEvent.change(input, {target: {files: [file("notes.txt", {type: "text/plain"})]}});

    expect(screen.getByText("Please choose an image file.")).toBeInTheDocument();
    expect(URL.createObjectURL).not.toHaveBeenCalled();
  });

  it("rejects an image over 25MB", async () => {
    await renderReady({map: BLANK_MAP});
    const input = document.querySelector('input[type="file"]');

    fireEvent.change(input, {target: {files: [file("huge.png", {size: 26 * 1024 * 1024})]}});

    expect(screen.getByText(/must be under 25\.0MB/)).toBeInTheDocument();
    expect(URL.createObjectURL).not.toHaveBeenCalled();
  });

  it("accepts a valid image and renders the canvas toolbar", async () => {
    await renderReady({map: BLANK_MAP});
    const input = document.querySelector('input[type="file"]');

    fireEvent.change(input, {target: {files: [file("map.png")]}});

    await waitFor(() => expect(screen.getByRole("button", {name: "Fit"})).toBeInTheDocument());
    expect(screen.queryByText(/Choose a map image/)).not.toBeInTheDocument();
  });

  it("shows an existing map's image immediately, without requiring a re-upload", async () => {
    await renderReady({map: {...BLANK_MAP, pixelDimensions: {width: 2048, height: 1536}}, imageUrl: "data:image/webp;base64,AAAA"});

    expect(screen.queryByText(/Choose a map image/)).not.toBeInTheDocument();
    expect(screen.getByRole("button", {name: "Fit"})).toBeInTheDocument();
    expect(document.querySelector(".map-canvas-content img").src).toBe("data:image/webp;base64,AAAA");
  });

  it("doesn't crash mounting a map with an SVG background (the higher-res re-rasterization needs a real canvas 2D context, unavailable in jsdom - see MapPreviewScene's own WebGL note)", async () => {
    await renderReady({map: {...BLANK_MAP, imageUrl: "gc1-entrance.svg", pixelDimensions: {width: 2048, height: 1536}}, imageUrl: "data:image/svg+xml;base64,AAAA"});

    // Rasterization never resolves here (no real Image decoding in jsdom),
    // so the canvas still falls back to the original (raw SVG) source.
    expect(document.querySelector(".map-canvas-content img").src).toBe("data:image/svg+xml;base64,AAAA");
  });

  it("flows a feetDimensions edit from the fields panel into the canvas grid", async () => {
    await renderReady({map: {...BLANK_MAP, pixelDimensions: {width: 2048, height: 1536}}, imageUrl: "data:image/webp;base64,AAAA"});
    expect(document.querySelector(".map-canvas-grid")).not.toBeInTheDocument();

    fireEvent.change(document.querySelectorAll(".map-fields-dimension-pair input")[0], {target: {value: "60"}});
    fireEvent.change(document.querySelectorAll(".map-fields-dimension-pair input")[1], {target: {value: "45"}});

    expect(document.querySelector(".map-canvas-grid")).toBeInTheDocument();
  });

  it("keeps the draft's pixelDimensions in sync with whatever image is actually loaded", async () => {
    await renderReady({map: BLANK_MAP});

    fireEvent.change(document.querySelector('input[type="file"]'), {target: {files: [file("map.png")]}});
    await waitFor(() => expect(screen.getByRole("button", {name: "Fit"})).toBeInTheDocument());

    expect(screen.getByText("800 × 600")).toBeInTheDocument();
  });

  it("adds a wall via the sidebar's '+ Add Wall' button, going straight into placing its first point", async () => {
    await renderReady({map: {...BLANK_MAP, pixelDimensions: {width: 800, height: 600}, feetDimensions: {width: 160, height: 120}}, imageUrl: "data:image/webp;base64,AAAA"});
    const wrapper = document.querySelector(".map-canvas-wrapper");
    Object.defineProperty(wrapper, "clientWidth", {value: 800, configurable: true});
    Object.defineProperty(wrapper, "clientHeight", {value: 600, configurable: true});
    fireEvent.click(screen.getByRole("button", {name: "Fit"}));

    // The Barriers section starts collapsed.
    fireEvent.click(document.querySelector(".map-sidebar-section-heading"));
    fireEvent.click(screen.getByRole("button", {name: "+ Add Wall"}));

    expect(screen.getByText(/Barrier 1: wall/)).toBeInTheDocument();
    // No extra "+" click needed - placement mode for the first point is
    // already armed, and the row's already expanded so a placed pill
    // shows up right away.
    expect(screen.getByText("Placing Points")).toBeInTheDocument();

    fireEvent.pointerDown(wrapper, {clientX: 50, clientY: 0}); // (50, 0)px -> (10, 120)ft at 5px/ft

    expect(document.querySelector(".map-point-pill-editable")).toHaveTextContent("10, 120");
    // Insert mode auto-advances to the next gap, so a second click lays
    // down a consecutive point too.
    expect(screen.getByText("Placing Points")).toBeInTheDocument();
  });

  it("flows the sidebar's '+ Add Circle' button into a canvas drag, creating a circle barrier and reverting the tool", async () => {
    await renderReady({map: {...BLANK_MAP, pixelDimensions: {width: 800, height: 600}, feetDimensions: {width: 160, height: 120}}, imageUrl: "data:image/webp;base64,AAAA"});
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

  it("flows the sidebar's '+ Add Point Connection' button into a single canvas click, creating a point connection", async () => {
    await renderReady({map: {...BLANK_MAP, pixelDimensions: {width: 800, height: 600}, feetDimensions: {width: 160, height: 120}}, imageUrl: "data:image/webp;base64,AAAA"});
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

  it("flows the sidebar's '+ Add Line Connection' button into a canvas drag, creating a line connection", async () => {
    await renderReady({map: {...BLANK_MAP, pixelDimensions: {width: 800, height: 600}, feetDimensions: {width: 160, height: 120}}, imageUrl: "data:image/webp;base64,AAAA"});
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

  it("places units from the palette with each map click, each in a group of its own, until disarmed", async () => {
    await renderReady({map: {...BLANK_MAP, pixelDimensions: {width: 800, height: 600}, feetDimensions: {width: 160, height: 120}}, imageUrl: "data:image/webp;base64,AAAA", unitTypeKeys: ["goblin-raider"], unitTypeDetails: {"goblin-raider": {name: "Goblin Raider", tokenImageUrl: null}}});
    const wrapper = document.querySelector(".map-canvas-wrapper");
    Object.defineProperty(wrapper, "clientWidth", {value: 800, configurable: true});
    Object.defineProperty(wrapper, "clientHeight", {value: 600, configurable: true});
    fireEvent.click(screen.getByRole("button", {name: "Fit"}));

    showTab("Units");
    fireEvent.click(screen.getByRole("button", {name: "Add a unit type"}));
    fireEvent.click(within(screen.getByRole("dialog", {name: "Add a unit type"})).getByRole("button", {name: "Goblin Raider"}));
    expect(screen.getByRole("button", {name: "Goblin Raider", pressed: true})).toBeInTheDocument();

    for (const x of [0, 50]) {
      fireEvent.pointerDown(wrapper, {clientX: x, clientY: 0});
      fireEvent.pointerUp(wrapper, {clientX: x, clientY: 0});
    }

    expect(current.mapData.units.map((unit) => unit.unitType)).toEqual(["goblin-raider", "goblin-raider"]);
    const groups = current.mapData.units.map((unit) => unit.groupIdentifier);
    groups.forEach((group) => expect(group).toMatch(/^group-[a-z]{6}$/));
    expect(new Set(groups).size).toEqual(2);
    expect(screen.getByRole("button", {name: "Goblin Raider", pressed: true})).toBeInTheDocument();

    fireEvent.keyDown(document, {key: "Escape"});
    expect(screen.getByRole("button", {name: "Goblin Raider", pressed: false})).toBeInTheDocument();
  });

  it("highlights a palette entry's units while it's hovered", async () => {
    await renderReady({map: {
          ...BLANK_MAP, pixelDimensions: {width: 800, height: 600}, feetDimensions: {width: 160, height: 120},
          units: [
            {unitType: "goblin-raider", identifier: "a", position: {x: 5, y: 5, angle: 0}, hostility: "hostile", currentHpFraction: 1, movement: {type: "still"}},
            {unitType: "slime", identifier: "b", position: {x: 50, y: 5, angle: 0}, hostility: "hostile", currentHpFraction: 1, movement: {type: "still"}},
          ],
        }, imageUrl: "data:image/webp;base64,AAAA", unitTypeKeys: ["goblin-raider", "slime"]});

    showTab("Units");
    fireEvent.mouseEnter(screen.getByRole("button", {name: "slime"}));

    expect(document.querySelectorAll(".map-group-highlight circle")).toHaveLength(1);
  });

  it("only lets the current tab's shapes be edited", async () => {
    await renderReady({map: {
          ...BLANK_MAP, pixelDimensions: {width: 800, height: 600}, feetDimensions: {width: 160, height: 120},
          units: [{unitType: "goblin-raider", identifier: "a", position: {x: 5, y: 5, angle: 0}, hostility: "hostile", currentHpFraction: 1, movement: {type: "still"}}],
          ncus: [{identifier: "sage", name: "Sage", position: {x: 50, y: 5, angle: 0}, movement: {type: "still"}}],
        }, imageUrl: "data:image/webp;base64,AAAA"});
    const unitLayer = () => document.querySelector("[data-unit-index]").closest(".map-canvas-layer");

    expect(unitLayer()).toHaveClass("map-canvas-layer-inactive");
    showTab("Units");
    expect(unitLayer()).not.toHaveClass("map-canvas-layer-inactive");
    showTab("Quests");
    expect(unitLayer()).toHaveClass("map-canvas-layer-inactive");
    expect(screen.getByText(/^NCUs/)).toBeInTheDocument();
  });

  it("flows a click on a unit's position pill into re-placing it via a map click", async () => {
    await renderReady({map: {
          ...BLANK_MAP, pixelDimensions: {width: 800, height: 600}, feetDimensions: {width: 160, height: 120},
          units: [{unitType: "goblin-raider", identifier: "a", position: {x: 0, y: 0, angle: 0}, hostility: "hostile", currentHpFraction: 1, movement: {type: "still"}}],
        }, imageUrl: "data:image/webp;base64,AAAA", unitTypeKeys: ["goblin-raider"], unitTypeDetails: {"goblin-raider": {name: "Goblin Raider", tokenImageUrl: null}}});
    const wrapper = document.querySelector(".map-canvas-wrapper");
    Object.defineProperty(wrapper, "clientWidth", {value: 800, configurable: true});
    Object.defineProperty(wrapper, "clientHeight", {value: 600, configurable: true});
    fireEvent.click(screen.getByRole("button", {name: "Fit"}));

    openFirstGroup(); // its only unit's row opens straight away
    fireEvent.click(screen.getByRole("button", {name: "0, 0"})); // the position pill
    expect(screen.getByText("Placing Points")).toBeInTheDocument();

    fireEvent.pointerDown(wrapper, {clientX: 50, clientY: 0}); // (50, 0)px -> (10, 120)ft at 5px/ft

    expect(screen.queryByText("Placing Points")).not.toBeInTheDocument();
    expect(screen.getByRole("button", {name: "10, 120"})).toBeInTheDocument();
  });

  it("clicking a member's token on the map opens its row in the open group and scrolls it into view", async () => {
    Element.prototype.scrollIntoView = vi.fn();
    await renderReady({map: {
          ...BLANK_MAP, pixelDimensions: {width: 800, height: 600}, feetDimensions: {width: 160, height: 120},
          units: [
            {unitType: "goblin-raider", identifier: "a", position: {x: 5, y: 5, angle: 0}, hostility: "hostile", currentHpFraction: 1, movement: {type: "still"}, groupIdentifier: "pack"},
            {unitType: "goblin-raider", identifier: "b", position: {x: 50, y: 5, angle: 0}, hostility: "hostile", currentHpFraction: 1, movement: {type: "still"}, groupIdentifier: "pack"},
          ],
        }, imageUrl: "data:image/webp;base64,AAAA", unitTypeKeys: ["goblin-raider"], unitTypeDetails: {"goblin-raider": {name: "Goblin Raider", tokenImageUrl: null}}});
    vi.stubGlobal("requestAnimationFrame", (cb) => { cb(); return 1; });

    openFirstGroup();
    expect(document.querySelectorAll(".map-unit-body")).toHaveLength(0);

    fireEvent.pointerDown(document.querySelectorAll("[data-unit-index]")[1]);

    expect(document.querySelectorAll(".map-unit-block")[1].querySelector(".map-unit-body")).toBeInTheDocument();
    expect(Element.prototype.scrollIntoView).toHaveBeenCalled();
    vi.unstubAllGlobals();
  });

  it("flows a coordinate pill click in the sidebar into re-placing an existing point connection", async () => {
    await renderReady({map: {
          ...BLANK_MAP, pixelDimensions: {width: 800, height: 600}, feetDimensions: {width: 160, height: 120},
          connections: [{identifier: "a", type: "point", position: {x: 0, y: 0, angle: 0}, fuzzRadius: 2, fuzzAngle: 90}],
        }, imageUrl: "data:image/webp;base64,AAAA"});
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

  it("starting a barrier-point placement cancels an in-progress connection-field placement", async () => {
    await renderReady({map: {
          ...BLANK_MAP, pixelDimensions: {width: 800, height: 600}, feetDimensions: {width: 160, height: 120},
          barriers: [{type: "wall", locations: [{x: 0, y: 0}, {x: 10, y: 0}]}],
          connections: [{identifier: "a", type: "point", position: {x: 0, y: 0, angle: 0}, fuzzRadius: 2, fuzzAngle: 90}],
        }, imageUrl: "data:image/webp;base64,AAAA"});

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

  it("flows a '+' click in the sidebar into placement mode, then a map click into a new pill", async () => {
    await renderReady({map: {...BLANK_MAP, pixelDimensions: {width: 800, height: 600}, feetDimensions: {width: 160, height: 120}, barriers: [{type: "wall", locations: [{x: 0, y: 0}, {x: 10, y: 0}]}]}, imageUrl: "data:image/webp;base64,AAAA"});
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

  it("cancels placement on Escape, from the canvas", async () => {
    await renderReady({map: {...BLANK_MAP, pixelDimensions: {width: 800, height: 600}, feetDimensions: {width: 160, height: 120}, barriers: [{type: "wall", locations: [{x: 0, y: 0}, {x: 10, y: 0}]}]}, imageUrl: "data:image/webp;base64,AAAA"});

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

  it("flows a click on an existing pill into edit placement, then a map click replaces that point in place", async () => {
    await renderReady({map: {...BLANK_MAP, pixelDimensions: {width: 800, height: 600}, feetDimensions: {width: 160, height: 120}, barriers: [{type: "wall", locations: [{x: 0, y: 0}, {x: 10, y: 0}]}]}, imageUrl: "data:image/webp;base64,AAAA"});
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

  describe("loot tables", () => {
    it("flows choosing an item + '+ Add Loot Entry' into a unit's lootTable at weight 1", async () => {
      await renderReady({map: {
            ...BLANK_MAP, pixelDimensions: {width: 800, height: 600}, feetDimensions: {width: 160, height: 120},
            units: [{unitType: "goblin-raider", identifier: "a", position: {x: 0, y: 0, angle: 0}, hostility: "hostile", currentHpFraction: 1, movement: {type: "still"}}],
          }, imageUrl: "data:image/webp;base64,AAAA", itemKeys: ["sword-of-doom"], itemDetails: {"sword-of-doom": {identifier: "sword-of-doom", name: "Sword of Doom", slot: "main_hand"}}});

      openFirstGroup(); // its only unit's row opens straight away
      const itemSelect = screen.getAllByRole("combobox").find((el) => el.querySelector('option[value="sword-of-doom"]'));
      fireEvent.change(itemSelect, {target: {value: "sword-of-doom"}});
      fireEvent.click(screen.getByRole("button", {name: "+ Add Loot Entry"}));

      // Choosing the item kicks off an async detail fetch (requestItemDetails) -
      // the resolved name lands a tick later, not synchronously.
      await waitFor(() => expect(screen.getByText("Sword of Doom")).toBeInTheDocument());
      expect(document.querySelector(".map-loot-entry input")).toHaveValue(1);
    });
  });

  describe("unit groups", () => {
    function threeUnitMap() {
      return {
        ...BLANK_MAP, pixelDimensions: {width: 800, height: 600}, feetDimensions: {width: 160, height: 120},
        units: [
          {unitType: "goblin-raider", identifier: "a", position: {x: 5, y: 5, angle: 0}, hostility: "hostile", currentHpFraction: 1, movement: {type: "still"}, groupIdentifier: "pack"},
          {unitType: "goblin-raider", identifier: "b", position: {x: 50, y: 5, angle: 0}, hostility: "hostile", currentHpFraction: 1, movement: {type: "still"}},
          {unitType: "goblin-raider", identifier: "c", position: {x: 90, y: 5, angle: 0}, hostility: "hostile", currentHpFraction: 1, movement: {type: "still"}, groupIdentifier: "pack"},
        ],
      };
    }
    const token = (i) => document.querySelectorAll("[data-unit-index]")[i];
    const memberNames = () => [...document.querySelectorAll(".map-unit-row-name")].map((el) => el.textContent);

    async function renderOnUnitsTab() {
      await renderReady({map: threeUnitMap(), imageUrl: "data:image/webp;base64,AAAA"});
      showTab("Units");
    }

    it("double-clicking a unit opens its group; double-clicking empty map closes it", async () => {
      await renderOnUnitsTab();

      fireEvent.doubleClick(token(2));
      expect(screen.getByRole("textbox", {name: "Group name"})).toHaveValue("pack");
      expect(memberNames()).toEqual(["a", "c"]);
      expect(document.querySelectorAll(".map-group-highlight circle")).toHaveLength(2);

      fireEvent.doubleClick(document.querySelector(".map-canvas-content img"));
      expect(screen.getByRole("list", {name: "Groups"})).toBeInTheDocument();
    });

    it("opening an ungrouped unit's group gives it a group identifier", async () => {
      await renderOnUnitsTab();

      fireEvent.doubleClick(token(1));

      expect(current.mapData.units[1].groupIdentifier).toMatch(/^group-[a-z]{6}$/);
      expect(memberNames()).toEqual(["b"]);
    });

    it("shift-clicking units adds them to the open group, or moves members out to groups of their own", async () => {
      await renderOnUnitsTab();
      fireEvent.doubleClick(token(0));

      fireEvent.pointerDown(token(1), {pointerId: 1, shiftKey: true});
      expect(memberNames()).toEqual(["a", "b", "c"]);

      fireEvent.pointerDown(token(0), {pointerId: 1, shiftKey: true});
      expect(memberNames()).toEqual(["b", "c"]);
      expect(current.mapData.units[0].groupIdentifier).toMatch(/^group-[a-z]{6}$/);
    });

    it("closes the group once its last member leaves", async () => {
      await renderReady({map: {...threeUnitMap(), units: threeUnitMap().units.slice(0, 1)}, imageUrl: "data:image/webp;base64,AAAA"});
      showTab("Units");
      fireEvent.doubleClick(token(0));

      fireEvent.pointerDown(token(0), {pointerId: 1, shiftKey: true});

      expect(screen.getByRole("list", {name: "Groups"})).toBeInTheDocument();
    });

    it("renaming the open group renames it on every member", async () => {
      await renderOnUnitsTab();
      fireEvent.doubleClick(token(0));

      const name = screen.getByRole("textbox", {name: "Group name"});
      fireEvent.change(name, {target: {value: "wolves"}});
      fireEvent.blur(name);

      expect(current.mapData.units.map((unit) => unit.groupIdentifier)).toEqual(["wolves", undefined, "wolves"]);
      expect(screen.getByRole("textbox", {name: "Group name"})).toHaveValue("wolves");
    });

    it("Escape or the Close group link closes it", async () => {
      await renderOnUnitsTab();
      fireEvent.doubleClick(token(0));
      fireEvent.keyDown(document, {key: "Escape"});
      expect(screen.getByRole("list", {name: "Groups"})).toBeInTheDocument();

      fireEvent.doubleClick(token(0));
      fireEvent.click(screen.getByRole("button", {name: "← Close group"}));
      expect(screen.getByRole("list", {name: "Groups"})).toBeInTheDocument();
    });

    it("Escape cancels a member's placement first, leaving the group open", async () => {
      await renderOnUnitsTab();
      fireEvent.doubleClick(token(1));
      fireEvent.click(screen.getByRole("button", {name: "50, 5"})); // its position pill

      fireEvent.keyDown(document, {key: "Escape"});

      expect(screen.getByRole("textbox", {name: "Group name"})).toBeInTheDocument();
    });
  });

  describe("movement", () => {
    async function renderWithOneUnit() {
      await renderReady({map: {
            ...BLANK_MAP, pixelDimensions: {width: 800, height: 600}, feetDimensions: {width: 160, height: 120},
            units: [{unitType: "goblin-raider", identifier: "a", position: {x: 0, y: 0, angle: 0}, hostility: "hostile", currentHpFraction: 1, movement: {type: "still"}}],
          }, imageUrl: "data:image/webp;base64,AAAA"});
      const wrapper = document.querySelector(".map-canvas-wrapper");
      Object.defineProperty(wrapper, "clientWidth", {value: 800, configurable: true});
      Object.defineProperty(wrapper, "clientHeight", {value: 600, configurable: true});
      fireEvent.click(screen.getByRole("button", {name: "Fit"}));
      openFirstGroup(); // its only unit's row opens straight away
      return wrapper;
    }

    it("switches a unit to patrol, lays down two consecutive steps via '+' then clicks, and draws the path", async () => {
      const wrapper = await renderWithOneUnit();

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

    it("inserts a step between two existing ones via that gap's '+', without disturbing the others", async () => {
      await renderReady({map: {
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
          }, imageUrl: "data:image/webp;base64,AAAA"});
      const wrapper = document.querySelector(".map-canvas-wrapper");
      Object.defineProperty(wrapper, "clientWidth", {value: 800, configurable: true});
      Object.defineProperty(wrapper, "clientHeight", {value: 600, configurable: true});
      fireEvent.click(screen.getByRole("button", {name: "Fit"}));
      openFirstGroup();

      const plusButtons = document.querySelectorAll(".map-unit-movement-fields .map-point-plus");
      expect(plusButtons).toHaveLength(2); // between the two steps, and after the last - none before step 0
      fireEvent.click(plusButtons[0]); // between the two existing steps
      fireEvent.pointerDown(wrapper, {clientX: 50, clientY: 0}); // -> (10,120)ft

      const pills = [...document.querySelectorAll(".map-patrol-step-pill")].map((p) => p.textContent);
      expect(pills).toEqual(["5, 5", "10, 120", "50, 5"]);
    });

    it("switches a unit to wander, re-places its location via the pill, and draws the dim circle", async () => {
      const wrapper = await renderWithOneUnit();

      const movementSelect = screen.getAllByRole("combobox").find((el) => el.querySelector('option[value="wander"]'));
      fireEvent.change(movementSelect, {target: {value: "wander"}});

      fireEvent.click(document.querySelector(".map-wander-location-btn")); // the seeded location pill
      fireEvent.pointerDown(wrapper, {clientX: 50, clientY: 0}); // -> (10,120)ft

      expect(screen.getByRole("button", {name: "10, 120"})).toBeInTheDocument();
      expect(document.querySelector(".map-movement-highlight circle")).toBeInTheDocument();
    });

    it("switching back to still clears the visualization", async () => {
      await renderWithOneUnit();
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
    it("toggling into simulate mode hides the editing panels, blocks drags, animates the unit, and restores everything on stop", async () => {
      let frameCallback = null;
      vi.stubGlobal("requestAnimationFrame", (cb) => { frameCallback = cb; return 1; });
      vi.stubGlobal("cancelAnimationFrame", () => {});
      let now = 1000;
      vi.spyOn(performance, "now").mockImplementation(() => now);

      await renderReady({map: {
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
          }, imageUrl: "data:image/webp;base64,AAAA"});
      const wrapper = document.querySelector(".map-canvas-wrapper");
      Object.defineProperty(wrapper, "clientWidth", {value: 800, configurable: true});
      Object.defineProperty(wrapper, "clientHeight", {value: 600, configurable: true});
      fireEvent.click(screen.getByRole("button", {name: "Fit"}));
      showTab("Units");

      fireEvent.click(screen.getByRole("button", {name: "Simulate Units"}));

      // Sidebar swaps to a status notice, hiding every editing control.
      expect(screen.getByText(/Simulating units/)).toBeInTheDocument();
      expect(screen.queryByRole("region", {name: "Unit palette"})).not.toBeInTheDocument();

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
      expect(screen.getByRole("region", {name: "Unit palette"})).toBeInTheDocument();
      expect(document.querySelector(".map-canvas-shapes circle").getAttribute("cx")).toBe(cxBefore);

      vi.restoreAllMocks();
      vi.unstubAllGlobals();
    });
  });

  describe("hotkeys", () => {
    async function renderWithDimensions() {
      await renderReady({map: {...BLANK_MAP, pixelDimensions: {width: 800, height: 600}, feetDimensions: {width: 160, height: 120}}, imageUrl: "data:image/webp;base64,AAAA"});
      const wrapper = document.querySelector(".map-canvas-wrapper");
      Object.defineProperty(wrapper, "clientWidth", {value: 800, configurable: true});
      Object.defineProperty(wrapper, "clientHeight", {value: 600, configurable: true});
      fireEvent.click(screen.getByRole("button", {name: "Fit"}));
      return wrapper;
    }

    it("'b' starts a new line barrier, straight into placing its first point - same as the button", async () => {
      await renderWithDimensions();

      fireEvent.keyDown(document, {key: "b"});

      fireEvent.click(document.querySelector(".map-sidebar-section-heading")); // Barriers
      expect(screen.getByText(/Barrier 1: wall/)).toBeInTheDocument();
      expect(screen.getByText("Placing Points")).toBeInTheDocument();
    });

    it("'c' arms the add-circle tool - same as the '+ Add Circle' button", async () => {
      const wrapper = await renderWithDimensions();

      fireEvent.keyDown(document, {key: "c"});
      fireEvent.pointerDown(wrapper, {clientX: 0, clientY: 0, pointerId: 1});
      fireEvent.pointerMove(wrapper, {clientX: 25, clientY: 0, pointerId: 1});
      fireEvent.pointerUp(wrapper, {clientX: 25, clientY: 0, pointerId: 1});

      fireEvent.click(document.querySelector(".map-sidebar-section-heading")); // Barriers
      expect(screen.getByText(/Barrier 1: circle/)).toBeInTheDocument();
    });

    it("'l' arms the add-line-connection tool - same as the '+ Add Line Connection' button", async () => {
      const wrapper = await renderWithDimensions();

      fireEvent.keyDown(document, {key: "l"});
      fireEvent.pointerDown(wrapper, {clientX: 0, clientY: 0, pointerId: 1});
      fireEvent.pointerMove(wrapper, {clientX: 50, clientY: 0, pointerId: 1});
      fireEvent.pointerUp(wrapper, {clientX: 50, clientY: 0, pointerId: 1});

      fireEvent.click(document.querySelectorAll(".map-sidebar-section-heading")[1]); // Connections
      expect(screen.getByText(/Connection 1: line/)).toBeInTheDocument();
    });

    it("'p' arms the add-point-connection tool - same as the '+ Add Point Connection' button", async () => {
      const wrapper = await renderWithDimensions();

      fireEvent.keyDown(document, {key: "p"});
      fireEvent.pointerDown(wrapper, {clientX: 0, clientY: 0});

      fireEvent.click(document.querySelectorAll(".map-sidebar-section-heading")[1]); // Connections
      expect(screen.getByText(/Connection 1: point/)).toBeInTheDocument();
    });

    it("ignores hotkeys while typing in a text field", async () => {
      await renderWithDimensions();
      fireEvent.click(document.querySelector(".map-sidebar-section-heading")); // Barriers - unrelated, just to reach a text field
      const nameInput = screen.getByPlaceholderText("gc1-goblin-cave-entrance");

      fireEvent.keyDown(nameInput, {key: "b"});

      expect(screen.queryByText("Placing Points")).not.toBeInTheDocument();
    });

    it("ignores hotkeys while another tool/placement is already active", async () => {
      const wrapper = await renderWithDimensions();
      fireEvent.keyDown(document, {key: "c"}); // arm add-circle first

      fireEvent.keyDown(document, {key: "b"}); // shouldn't override it with a wall

      // add-circle is still the pending placeholder/active tool, not a wall -
      // and a drag still creates a circle, confirming "b" never fired.
      fireEvent.click(document.querySelector(".map-sidebar-section-heading")); // Barriers
      expect(screen.getByText(/Barrier 1: circle/)).toBeInTheDocument();
      fireEvent.pointerDown(wrapper, {clientX: 0, clientY: 0, pointerId: 1});
      fireEvent.pointerMove(wrapper, {clientX: 25, clientY: 0, pointerId: 1});
      fireEvent.pointerUp(wrapper, {clientX: 25, clientY: 0, pointerId: 1});
      expect(screen.getAllByText(/Barrier 1:/).length).toBe(1);
      expect(screen.getByText(/Barrier 1: circle/)).toBeInTheDocument();
    });

    it("'?' shows the hotkey list, and Escape dismisses it", async () => {
      await renderWithDimensions();

      fireEvent.keyDown(document, {key: "?"});
      expect(screen.getByText("Hotkeys")).toBeInTheDocument();
      expect(screen.getByText("New line barrier")).toBeInTheDocument();

      fireEvent.keyDown(document, {key: "Escape"});
      expect(screen.queryByText("Hotkeys")).not.toBeInTheDocument();
    });

    it("does nothing for any hotkey until feetDimensions is set", async () => {
      await renderReady({map: BLANK_MAP});

      fireEvent.keyDown(document, {key: "b"});

      fireEvent.click(document.querySelector(".map-sidebar-section-heading")); // Barriers
      expect(screen.queryByText(/Barrier 1:/)).not.toBeInTheDocument();
    });
  });
  describe("choosing a background image", () => {
    it("names it after the map, beside the map file", async () => {
      await renderReady({map: BLANK_MAP});

      fireEvent.change(document.querySelector('input[type="file"]'), {target: {files: [file("background.webp")]}});
      await waitFor(() => expect(screen.getByRole("button", {name: "Fit"})).toBeInTheDocument());

      expect(current.uploads).toEqual(["gc1-entrance.webp"]);
      expect(current.mapData.imageUrl).toEqual("gc1-entrance.webp");
    });
  });
});
