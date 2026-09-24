import {describe, it, expect, vi, beforeEach, afterEach} from "vitest";
import {render, screen, fireEvent, waitFor, act} from "@testing-library/react";
import MapEditor from "../MapEditor";
import {commitFiles, GithubAuthError as CommitGithubAuthError} from "../../github/commitFiles";
import {GithubClient} from "../../github/delve-github";
import {loadMap, loadMapImageUrl, listUnitTypeKeys, listItemKeys, unitTypeDetailsFor, itemDetailsFor} from "../mapContentLoaders";
import {validateMap} from "../../validators/validateContent";

vi.mock("../../github/commitFiles", async (importOriginal) => {
  const actual = await importOriginal();
  return {...actual, commitFiles: vi.fn()};
});

vi.mock("../../github/delve-github", async (importOriginal) => {
  const actual = await importOriginal();
  return {...actual, GithubClient: vi.fn(function () { return {}; })};
});

vi.mock("../mapContentLoaders", async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    loadMap: vi.fn(),
    loadMapImageUrl: vi.fn(),
    listUnitTypeKeys: vi.fn(),
    listItemKeys: vi.fn(),
    unitTypeDetailsFor: vi.fn(),
    itemDetailsFor: vi.fn(),
  };
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

// Mocks every loader MapEditor fetches on mount, then renders and waits for
// the load to finish (mapData starts out as a blank placeholder, not null -
// see MapEditor.jsx's own comment on why - so "loaded" is a separate flag,
// not a null check).
async function renderReady({
  mapKey = "goblin-cave/gc1-entrance", map = BLANK_MAP, imageUrl = null,
  unitTypeKeys = [], unitTypeDetails = {}, itemKeys = [], itemDetails = {},
  backUrl, newUnitTypeUrl, newItemUrl,
} = {}) {
  loadMap.mockResolvedValue(map);
  loadMapImageUrl.mockResolvedValue(imageUrl);
  listUnitTypeKeys.mockResolvedValue(unitTypeKeys);
  listItemKeys.mockResolvedValue(itemKeys);
  unitTypeDetailsFor.mockResolvedValue(unitTypeDetails);
  itemDetailsFor.mockResolvedValue(itemDetails);

  render(<MapEditor mapKey={mapKey} backUrl={backUrl} newUnitTypeUrl={newUnitTypeUrl} newItemUrl={newItemUrl} />);
  await waitFor(() => expect(screen.queryByText("Loading…")).not.toBeInTheDocument());
}

describe("MapEditor", () => {
  beforeEach(() => {
    vi.stubGlobal("Image", FakeImage);
    URL.createObjectURL = vi.fn(() => "blob:fake");
    URL.revokeObjectURL = vi.fn();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it("shows a loading state, then the editor once the fetch resolves", async () => {
    let resolveLoad;
    loadMap.mockImplementation(() => new Promise((resolve) => (resolveLoad = resolve)));
    loadMapImageUrl.mockResolvedValue(null);
    listUnitTypeKeys.mockResolvedValue([]);
    listItemKeys.mockResolvedValue([]);
    unitTypeDetailsFor.mockResolvedValue({});
    itemDetailsFor.mockResolvedValue({});

    render(<MapEditor mapKey="goblin-cave/gc1-entrance" />);
    expect(screen.getByText("Loading…")).toBeInTheDocument();

    resolveLoad(BLANK_MAP);
    await waitFor(() => expect(screen.getByText(/Choose a map image/)).toBeInTheDocument());
  });

  it("shows a load error rather than a blank/loading state when the fetch fails", async () => {
    loadMap.mockRejectedValue(new Error("network down"));

    render(<MapEditor mapKey="goblin-cave/gc1-entrance" />);

    await screen.findByText(/Failed to load: network down/);
  });

  it("redirects to the GitHub reauth URL when the load itself hits a GithubAuthError", async () => {
    loadMap.mockRejectedValue(new CommitGithubAuthError("reauth_required", "/github/reauth"));
    delete window.location;
    window.location = {href: ""};

    render(<MapEditor mapKey="goblin-cave/gc1-entrance" />);

    await waitFor(() => expect(window.location.href).toBe("/github/reauth"));
  });

  it("shows a file picker with no image yet", async () => {
    await renderReady({mapKey: "goblin-cave/gc1-entrance", map: BLANK_MAP});
    expect(screen.getByText(/Choose a map image/)).toBeInTheDocument();
  });

  it("renders the (collapsible) sidebar alongside the canvas", async () => {
    await renderReady({mapKey: "goblin-cave/gc1-entrance", map: BLANK_MAP});
    expect(document.querySelector(".map-editor-sidebar")).toBeInTheDocument();
  });

  it("rejects a non-image file without touching URL.createObjectURL", async () => {
    await renderReady({mapKey: "goblin-cave/gc1-entrance", map: BLANK_MAP});
    const input = document.querySelector('input[type="file"]');

    fireEvent.change(input, {target: {files: [file("notes.txt", {type: "text/plain"})]}});

    expect(screen.getByText("Please choose an image file.")).toBeInTheDocument();
    expect(URL.createObjectURL).not.toHaveBeenCalled();
  });

  it("rejects an image over 25MB", async () => {
    await renderReady({mapKey: "goblin-cave/gc1-entrance", map: BLANK_MAP});
    const input = document.querySelector('input[type="file"]');

    fireEvent.change(input, {target: {files: [file("huge.png", {size: 26 * 1024 * 1024})]}});

    expect(screen.getByText(/must be under 25\.0MB/)).toBeInTheDocument();
    expect(URL.createObjectURL).not.toHaveBeenCalled();
  });

  it("accepts a valid image and renders the canvas toolbar", async () => {
    await renderReady({mapKey: "goblin-cave/gc1-entrance", map: BLANK_MAP});
    const input = document.querySelector('input[type="file"]');

    fireEvent.change(input, {target: {files: [file("map.png")]}});

    await waitFor(() => expect(screen.getByRole("button", {name: "Fit"})).toBeInTheDocument());
    expect(screen.queryByText(/Choose a map image/)).not.toBeInTheDocument();
  });

  it("shows an existing map's image immediately, without requiring a re-upload", async () => {
    await renderReady({mapKey: "goblin-cave/gc1-entrance", map: {...BLANK_MAP, pixelDimensions: {width: 2048, height: 1536}}, imageUrl: "data:image/webp;base64,AAAA"});

    expect(screen.queryByText(/Choose a map image/)).not.toBeInTheDocument();
    expect(screen.getByRole("button", {name: "Fit"})).toBeInTheDocument();
    expect(document.querySelector(".map-canvas-content img").src).toBe("data:image/webp;base64,AAAA");
  });

  it("doesn't crash mounting a map with an SVG background (the higher-res re-rasterization needs a real canvas 2D context, unavailable in jsdom - see MapPreviewScene's own WebGL note)", async () => {
    await renderReady({mapKey: "goblin-cave/gc1-entrance", map: {...BLANK_MAP, imageUrl: "gc1-entrance.svg", pixelDimensions: {width: 2048, height: 1536}}, imageUrl: "data:image/svg+xml;base64,AAAA"});

    // Rasterization never resolves here (no real Image decoding in jsdom),
    // so the canvas still falls back to the original (raw SVG) source.
    expect(document.querySelector(".map-canvas-content img").src).toBe("data:image/svg+xml;base64,AAAA");
  });

  it("flows a feetDimensions edit from the fields panel into the canvas grid", async () => {
    await renderReady({mapKey: "goblin-cave/gc1-entrance", map: {...BLANK_MAP, pixelDimensions: {width: 2048, height: 1536}}, imageUrl: "data:image/webp;base64,AAAA"});
    expect(document.querySelector(".map-canvas-grid")).not.toBeInTheDocument();

    fireEvent.change(document.querySelectorAll(".map-fields-dimension-pair input")[0], {target: {value: "60"}});
    fireEvent.change(document.querySelectorAll(".map-fields-dimension-pair input")[1], {target: {value: "45"}});

    expect(document.querySelector(".map-canvas-grid")).toBeInTheDocument();
  });

  it("keeps the draft's pixelDimensions in sync with whatever image is actually loaded", async () => {
    await renderReady({mapKey: "goblin-cave/gc1-entrance", map: BLANK_MAP});

    fireEvent.change(document.querySelector('input[type="file"]'), {target: {files: [file("map.png")]}});
    await waitFor(() => expect(screen.getByRole("button", {name: "Fit"})).toBeInTheDocument());

    expect(screen.getByText("800 × 600")).toBeInTheDocument();
  });

  it("adds a wall via the sidebar's '+ Add Wall' button, going straight into placing its first point", async () => {
    await renderReady({mapKey: "goblin-cave/gc1-entrance", map: {...BLANK_MAP, pixelDimensions: {width: 800, height: 600}, feetDimensions: {width: 160, height: 120}}, imageUrl: "data:image/webp;base64,AAAA"});
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
    await renderReady({mapKey: "goblin-cave/gc1-entrance", map: {...BLANK_MAP, pixelDimensions: {width: 800, height: 600}, feetDimensions: {width: 160, height: 120}}, imageUrl: "data:image/webp;base64,AAAA"});
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
    await renderReady({mapKey: "goblin-cave/gc1-entrance", map: {...BLANK_MAP, pixelDimensions: {width: 800, height: 600}, feetDimensions: {width: 160, height: 120}}, imageUrl: "data:image/webp;base64,AAAA"});
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
    await renderReady({mapKey: "goblin-cave/gc1-entrance", map: {...BLANK_MAP, pixelDimensions: {width: 800, height: 600}, feetDimensions: {width: 160, height: 120}}, imageUrl: "data:image/webp;base64,AAAA"});
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

  it("flows choosing a unit type + '+ Add Unit' into a single canvas click, creating a unit", async () => {
    await renderReady({mapKey: "goblin-cave/gc1-entrance", map: {...BLANK_MAP, pixelDimensions: {width: 800, height: 600}, feetDimensions: {width: 160, height: 120}}, imageUrl: "data:image/webp;base64,AAAA", unitTypeKeys: ["goblin-raider"], unitTypeDetails: {"goblin-raider": {name: "Goblin Raider", tokenImageUrl: null}}});
    const wrapper = document.querySelector(".map-canvas-wrapper");
    Object.defineProperty(wrapper, "clientWidth", {value: 800, configurable: true});
    Object.defineProperty(wrapper, "clientHeight", {value: 600, configurable: true});
    fireEvent.click(screen.getByRole("button", {name: "Fit"}));

    fireEvent.click(document.querySelectorAll(".map-sidebar-section-heading")[2]); // Units
    const unitTypeSelect = screen.getAllByRole("combobox").find((el) => el.querySelector('option[value="goblin-raider"]'));
    fireEvent.change(unitTypeSelect, {target: {value: "goblin-raider"}});
    fireEvent.click(screen.getByRole("button", {name: "+ Add Unit"}));

    fireEvent.pointerDown(wrapper, {clientX: 0, clientY: 0});
    fireEvent.pointerUp(wrapper, {clientX: 0, clientY: 0});

    // A default identifier is assigned on placement (issue #46) - no more
    // "Unit 1" placeholder fallback to check against.
    expect(document.querySelector(".map-unit-row-name")).toHaveTextContent(/^goblin-raider-[a-z]{6}$/);
    // Choosing "goblin-raider" from the dropdown kicks off an async detail
    // fetch (see requestUnitTypeDetails) - the resolved name lands a tick
    // later, not synchronously.
    await waitFor(() => expect(document.querySelector(".map-unit-row-type")).toHaveTextContent("Goblin Raider"));
    // Single-shot - the tool reverted to "select", so the button's enabled
    // again (the dropdown's own choice isn't cleared by placing one).
    expect(screen.getByRole("button", {name: "+ Add Unit"})).not.toBeDisabled();
  });

  it("flows a click on a unit's position pill into re-placing it via a map click", async () => {
    await renderReady({mapKey: "goblin-cave/gc1-entrance", map: {
          ...BLANK_MAP, pixelDimensions: {width: 800, height: 600}, feetDimensions: {width: 160, height: 120},
          units: [{unitType: "goblin-raider", identifier: "a", position: {x: 0, y: 0, angle: 0}, hostility: "hostile", currentHpFraction: 1, movement: {type: "still"}}],
        }, imageUrl: "data:image/webp;base64,AAAA", unitTypeKeys: ["goblin-raider"], unitTypeDetails: {"goblin-raider": {name: "Goblin Raider", tokenImageUrl: null}}});
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

  it("clicking a unit's token on the map opens only that unit's row and scrolls it into view, closing any others already open", async () => {
    Element.prototype.scrollIntoView = vi.fn();
    await renderReady({mapKey: "goblin-cave/gc1-entrance", map: {
          ...BLANK_MAP, pixelDimensions: {width: 800, height: 600}, feetDimensions: {width: 160, height: 120},
          units: [
            {unitType: "goblin-raider", identifier: "a", position: {x: 5, y: 5, angle: 0}, hostility: "hostile", currentHpFraction: 1, movement: {type: "still"}},
            {unitType: "goblin-raider", identifier: "b", position: {x: 50, y: 5, angle: 0}, hostility: "hostile", currentHpFraction: 1, movement: {type: "still"}},
          ],
        }, imageUrl: "data:image/webp;base64,AAAA", unitTypeKeys: ["goblin-raider"], unitTypeDetails: {"goblin-raider": {name: "Goblin Raider", tokenImageUrl: null}}});
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

  it("flows a coordinate pill click in the sidebar into re-placing an existing point connection", async () => {
    await renderReady({mapKey: "goblin-cave/gc1-entrance", map: {
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
    await renderReady({mapKey: "goblin-cave/gc1-entrance", map: {
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
    await renderReady({mapKey: "goblin-cave/gc1-entrance", map: {...BLANK_MAP, pixelDimensions: {width: 800, height: 600}, feetDimensions: {width: 160, height: 120}, barriers: [{type: "wall", locations: [{x: 0, y: 0}, {x: 10, y: 0}]}]}, imageUrl: "data:image/webp;base64,AAAA"});
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
    await renderReady({mapKey: "goblin-cave/gc1-entrance", map: {...BLANK_MAP, pixelDimensions: {width: 800, height: 600}, feetDimensions: {width: 160, height: 120}, barriers: [{type: "wall", locations: [{x: 0, y: 0}, {x: 10, y: 0}]}]}, imageUrl: "data:image/webp;base64,AAAA"});

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
    await renderReady({mapKey: "goblin-cave/gc1-entrance", map: {...BLANK_MAP, pixelDimensions: {width: 800, height: 600}, feetDimensions: {width: 160, height: 120}, barriers: [{type: "wall", locations: [{x: 0, y: 0}, {x: 10, y: 0}]}]}, imageUrl: "data:image/webp;base64,AAAA"});
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
    it("adds a newly-fetched unit type key to the dropdown without a page reload", async () => {
      // The key list is cheap (no per-file fetch, see
      // Build::MapsController#list_unit_type_keys) - it shows up by its raw
      // key until actually chosen, not a friendly name yet.
      await renderReady({mapKey: "goblin-cave/gc1-entrance", map: BLANK_MAP, unitTypeKeys: []});

      fireEvent.click(document.querySelectorAll(".map-sidebar-section-heading")[2]); // Units
      expect(screen.queryByRole("option", {name: "goblin-raider"})).not.toBeInTheDocument();

      listUnitTypeKeys.mockResolvedValueOnce(["goblin-raider"]);
      fireEvent.click(screen.getByRole("button", {name: "Refresh"}));
      await waitFor(() => expect(screen.getByText("Refreshed.")).toBeInTheDocument());

      expect(screen.getByRole("option", {name: "goblin-raider"})).toBeInTheDocument();
    });

    it("shows an error message when the refresh request fails", async () => {
      await renderReady({mapKey: "goblin-cave/gc1-entrance", map: BLANK_MAP, unitTypeKeys: []});
      listUnitTypeKeys.mockRejectedValueOnce(new Error("request failed: 500"));

      fireEvent.click(document.querySelectorAll(".map-sidebar-section-heading")[2]); // Units
      fireEvent.click(screen.getByRole("button", {name: "Refresh"}));

      await waitFor(() => expect(screen.getByText(/Refresh failed/)).toBeInTheDocument());
    });

    it("refreshes both unit type and item key lists from the one shared button", async () => {
      await renderReady({mapKey: "goblin-cave/gc1-entrance", map: {
            ...BLANK_MAP,
            units: [{unitType: "goblin-raider", identifier: "a", position: {x: 0, y: 0, angle: 0}, hostility: "hostile", currentHpFraction: 1, movement: {type: "still"}}],
          }, unitTypeKeys: [], itemKeys: []});
      listUnitTypeKeys.mockResolvedValueOnce(["goblin-raider"]);
      listItemKeys.mockResolvedValueOnce(["sword-of-doom"]);

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
    it("flows choosing an item + '+ Add Loot Entry' into a unit's lootTable at weight 1", async () => {
      await renderReady({mapKey: "goblin-cave/gc1-entrance", map: {
            ...BLANK_MAP, pixelDimensions: {width: 800, height: 600}, feetDimensions: {width: 160, height: 120},
            units: [{unitType: "goblin-raider", identifier: "a", position: {x: 0, y: 0, angle: 0}, hostility: "hostile", currentHpFraction: 1, movement: {type: "still"}}],
          }, imageUrl: "data:image/webp;base64,AAAA", itemKeys: ["sword-of-doom"], itemDetails: {"sword-of-doom": {identifier: "sword-of-doom", name: "Sword of Doom", slot: "main_hand"}}});

      fireEvent.click(document.querySelectorAll(".map-sidebar-section-heading")[2]); // Units
      fireEvent.click(document.querySelector(".map-unit-row")); // expand the unit's row, revealing its loot table
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
    function twoUnitMap() {
      return {
        ...BLANK_MAP, pixelDimensions: {width: 800, height: 600}, feetDimensions: {width: 160, height: 120},
        units: [
          {unitType: "goblin-raider", identifier: "a", position: {x: 5, y: 5, angle: 0}, hostility: "hostile", currentHpFraction: 1, movement: {type: "still"}},
          {unitType: "goblin-raider", identifier: "b", position: {x: 50, y: 5, angle: 0}, hostility: "hostile", currentHpFraction: 1, movement: {type: "still"}},
        ],
      };
    }

    async function renderWithTwoUnits() {
      await renderReady({mapKey: "goblin-cave/gc1-entrance", map: twoUnitMap(), imageUrl: "data:image/webp;base64,AAAA"});
      const wrapper = document.querySelector(".map-canvas-wrapper");
      Object.defineProperty(wrapper, "clientWidth", {value: 800, configurable: true});
      Object.defineProperty(wrapper, "clientHeight", {value: 600, configurable: true});
      fireEvent.click(screen.getByRole("button", {name: "Fit"}));
      fireEvent.click(document.querySelectorAll(".map-sidebar-section-heading")[2]); // Units
      return wrapper;
    }

    it("'+ Add Group' immediately enters grouping mode, and clicking units (map token + sidebar row) adds both", async () => {
      await renderWithTwoUnits();

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

    it("clicking a group member again (while grouping mode is active) removes it", async () => {
      await renderWithTwoUnits();

      fireEvent.change(screen.getByPlaceholderText("New group name…"), {target: {value: "raiders"}});
      fireEvent.click(screen.getByRole("button", {name: "+ Add Group"}));
      const marker = document.querySelectorAll(".map-canvas-shapes g")[0];
      fireEvent.pointerDown(marker, {pointerId: 1});
      expect(document.querySelector(".map-unit-group-count")).toHaveTextContent("(1)");

      fireEvent.pointerDown(marker, {pointerId: 1});

      expect(document.querySelector(".map-unit-group-count")).toHaveTextContent("(0)");
    });

    it("Escape exits grouping mode", async () => {
      await renderWithTwoUnits();
      fireEvent.change(screen.getByPlaceholderText("New group name…"), {target: {value: "raiders"}});
      fireEvent.click(screen.getByRole("button", {name: "+ Add Group"}));
      expect(screen.getByRole("button", {name: "Done"})).toBeInTheDocument();

      fireEvent.keyDown(document, {key: "Escape"});

      expect(screen.getByRole("button", {name: "Add/Remove Units"})).toBeInTheDocument();
    });
  });

  describe("movement", () => {
    async function renderWithOneUnit() {
      await renderReady({mapKey: "goblin-cave/gc1-entrance", map: {
            ...BLANK_MAP, pixelDimensions: {width: 800, height: 600}, feetDimensions: {width: 160, height: 120},
            units: [{unitType: "goblin-raider", identifier: "a", position: {x: 0, y: 0, angle: 0}, hostility: "hostile", currentHpFraction: 1, movement: {type: "still"}}],
          }, imageUrl: "data:image/webp;base64,AAAA"});
      const wrapper = document.querySelector(".map-canvas-wrapper");
      Object.defineProperty(wrapper, "clientWidth", {value: 800, configurable: true});
      Object.defineProperty(wrapper, "clientHeight", {value: 600, configurable: true});
      fireEvent.click(screen.getByRole("button", {name: "Fit"}));
      fireEvent.click(document.querySelectorAll(".map-sidebar-section-heading")[2]); // Units
      fireEvent.click(document.querySelector(".map-unit-row")); // expand the unit's row
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
      await renderReady({mapKey: "goblin-cave/gc1-entrance", map: {
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
      fireEvent.click(document.querySelectorAll(".map-sidebar-section-heading")[2]); // Units
      fireEvent.click(document.querySelector(".map-unit-row"));

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

      await renderReady({mapKey: "goblin-cave/gc1-entrance", map: {
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
      await renderReady({mapKey: "goblin-cave/gc1-entrance", map: BLANK_MAP, unitTypeKeys: ["goblin-raider"], unitTypeDetails: {}});

      fireEvent.click(document.querySelectorAll(".map-sidebar-section-heading")[2]); // Units
      expect(unitTypeDetailsFor).not.toHaveBeenCalled();
      expect(screen.getByRole("option", {name: "goblin-raider"})).toBeInTheDocument();

      unitTypeDetailsFor.mockResolvedValueOnce({"goblin-raider": {name: "Goblin Raider", tokenImageUrl: null}});
      const unitTypeSelect = screen.getAllByRole("combobox").find((el) => el.querySelector('option[value="goblin-raider"]'));
      fireEvent.change(unitTypeSelect, {target: {value: "goblin-raider"}});

      expect(unitTypeDetailsFor).toHaveBeenCalledWith(expect.anything(), ["goblin-raider"]);
      await waitFor(() => expect(screen.getByRole("option", {name: "Goblin Raider"})).toBeInTheDocument());
    });
  });

  describe("choosing a background image", () => {
    it("sets imageUrl to a sibling filename based on the map's own key", async () => {
      await renderReady({mapKey: "goblin-cave/gc1-entrance", map: BLANK_MAP});
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
      await renderReady({mapKey: "goblin-cave/gc1-entrance", map: BLANK_MAP});
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
      await renderReady({mapKey: "goblin-cave/gc1-entrance", map: BLANK_MAP});

      fireEvent.click(screen.getByRole("button", {name: "Validate"}));

      await screen.findByText("feetDimensions is required");
      expect(screen.getByRole("button", {name: "Save"})).toBeDisabled();
    });

    it("redirects to the GitHub reauth URL on a GithubAuthError during save", async () => {
      validateMap.mockResolvedValue({valid: true});
      commitFiles.mockRejectedValue(new CommitGithubAuthError("reauth_required", "/github/reauth"));
      delete window.location;
      window.location = {href: ""};

      await renderReady({mapKey: "goblin-cave/gc1-entrance", map: BLANK_MAP});
      fireEvent.click(screen.getByRole("button", {name: "Validate"}));
      await waitFor(() => expect(screen.getByRole("button", {name: "Save"})).not.toBeDisabled());
      fireEvent.click(screen.getByRole("button", {name: "Save"}));

      await waitFor(() => expect(window.location.href).toBe("/github/reauth"));
    });
  });

  describe("hotkeys", () => {
    async function renderWithDimensions() {
      await renderReady({mapKey: "goblin-cave/gc1-entrance", map: {...BLANK_MAP, pixelDimensions: {width: 800, height: 600}, feetDimensions: {width: 160, height: 120}}, imageUrl: "data:image/webp;base64,AAAA"});
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
      await renderReady({mapKey: "goblin-cave/gc1-entrance", map: BLANK_MAP});

      fireEvent.keyDown(document, {key: "b"});

      fireEvent.click(document.querySelector(".map-sidebar-section-heading")); // Barriers
      expect(screen.queryByText(/Barrier 1:/)).not.toBeInTheDocument();
    });
  });
});
