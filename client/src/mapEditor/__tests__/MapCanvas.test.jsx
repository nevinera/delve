import {describe, it, expect, vi, beforeEach, afterEach} from "vitest";
import {render, screen, fireEvent, act} from "@testing-library/react";
import MapCanvas from "../MapCanvas";

const IMAGE = {url: "blob:fake", pixelDimensions: {width: 800, height: 600}};

function mapData(overrides = {}) {
  return {barriers: [], connections: [], units: [], feetDimensions: null, ...overrides};
}

function content() {
  return document.querySelector(".map-canvas-content");
}

function noop() {}

describe("MapCanvas", () => {
  // Panning schedules its setOffset via requestAnimationFrame (throttled to
  // one state update per frame - see MapCanvas.jsx) - run it synchronously
  // here so these tests can assert on the transform immediately, rather
  // than testing frame-timing itself.
  beforeEach(() => {
    vi.stubGlobal("requestAnimationFrame", (cb) => {
      cb();
      return 1;
    });
    vi.stubGlobal("cancelAnimationFrame", () => {});
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("shows a Back link (in the toolbar, not overlaid) pointing at backUrl, with or without an image", () => {
    render(<MapCanvas image={null} imageError="" onImageFile={noop} backUrl="/build/maps" mapData={mapData()} dispatch={noop} onSelectBarrier={noop} />);
    let backLink = screen.getByRole("link", {name: "← Back"});
    expect(backLink).toHaveAttribute("href", "/build/maps");
    expect(backLink.closest(".map-canvas-toolbar-row")).toBeInTheDocument();

    render(<MapCanvas image={IMAGE} imageError="" onImageFile={noop} backUrl="/build/maps" mapData={mapData()} dispatch={noop} onSelectBarrier={noop} />);
    backLink = screen.getAllByRole("link", {name: "← Back"})[1];
    expect(backLink).toHaveAttribute("href", "/build/maps");
  });

  it("keeps the zoom buttons together in their own button-group, separate from Back", () => {
    render(<MapCanvas image={IMAGE} imageError="" onImageFile={noop} backUrl="/build/maps" mapData={mapData()} dispatch={noop} onSelectBarrier={noop} />);

    const group = document.querySelector(".map-toolbar-button-group");
    expect(group).toBeInTheDocument();
    expect(group).toContainElement(screen.getByRole("button", {name: "−"}));
    expect(group).toContainElement(screen.getByRole("button", {name: "Fit"}));
    expect(group).toContainElement(screen.getByRole("button", {name: "+"}));
    // Back sits in the row but outside the group, so it gets the row's
    // wider inter-item gap instead of the group's tight one.
    expect(group).not.toContainElement(screen.getByRole("link", {name: "← Back"}));
  });

  it("only shows zoom controls and the replace-image row once an image is loaded", () => {
    render(<MapCanvas image={null} imageError="" onImageFile={noop} backUrl="/build/maps" mapData={mapData()} dispatch={noop} onSelectBarrier={noop} />);
    expect(screen.queryByRole("button", {name: "Fit"})).not.toBeInTheDocument();
    expect(screen.queryByText("Replace image")).not.toBeInTheDocument();
  });

  it("shows the dropzone and forwards a dropped file", () => {
    const onImageFile = vi.fn();
    render(<MapCanvas image={null} imageError="" onImageFile={onImageFile} mapData={mapData()} dispatch={noop} onSelectBarrier={noop} />);

    const dropzone = screen.getByText(/Choose a map image/).closest(".map-canvas-dropzone");
    const droppedFile = new File(["x"], "map.png", {type: "image/png"});
    fireEvent.drop(dropzone, {dataTransfer: {files: [droppedFile]}});

    expect(onImageFile).toHaveBeenCalledWith(droppedFile);
  });

  it("shows the image error message even before an image is loaded", () => {
    render(<MapCanvas image={null} imageError="Please choose an image file." onImageFile={noop} mapData={mapData()} dispatch={noop} onSelectBarrier={noop} />);
    expect(screen.getByText("Please choose an image file.")).toBeInTheDocument();
  });

  it("pans by dragging on the canvas", () => {
    render(<MapCanvas image={IMAGE} imageError="" onImageFile={noop} mapData={mapData()} dispatch={noop} onSelectBarrier={noop} />);
    const wrapper = document.querySelector(".map-canvas-wrapper");
    // Mount auto-fits (and now centers - see the Fit tests below), so pan
    // math is asserted as a delta from that baseline, not an absolute value.
    const base = transformParts();

    fireEvent.pointerDown(wrapper, {clientX: 100, clientY: 100, pointerId: 1});
    fireEvent.pointerMove(wrapper, {clientX: 130, clientY: 150, pointerId: 1});
    fireEvent.pointerUp(wrapper, {clientX: 130, clientY: 150, pointerId: 1});

    const after = transformParts();
    expect(after.x - base.x).toBeCloseTo(30, 5);
    expect(after.y - base.y).toBeCloseTo(50, 5);
  });

  it("coalesces several pointermoves within one frame into a single flush at the latest position", () => {
    let scheduleCount = 0;
    let scheduledCallback = null;
    // Simulates several pointermove events arriving before the browser's
    // next paint - capture the frame callback instead of running it
    // immediately, so it can be invoked once, after every pointermove.
    vi.stubGlobal("requestAnimationFrame", (cb) => {
      scheduleCount += 1;
      scheduledCallback = cb;
      return scheduleCount;
    });

    render(<MapCanvas image={IMAGE} imageError="" onImageFile={noop} mapData={mapData()} dispatch={noop} onSelectBarrier={noop} />);
    const wrapper = document.querySelector(".map-canvas-wrapper");
    const base = transformParts();

    fireEvent.pointerDown(wrapper, {clientX: 0, clientY: 0, pointerId: 1});
    fireEvent.pointerMove(wrapper, {clientX: 5, clientY: 5, pointerId: 1});
    fireEvent.pointerMove(wrapper, {clientX: 10, clientY: 10, pointerId: 1});
    fireEvent.pointerMove(wrapper, {clientX: 20, clientY: 20, pointerId: 1});

    // Only the first pointermove scheduled a frame - the later two just
    // updated the pending position without scheduling another.
    expect(scheduleCount).toBe(1);

    act(() => scheduledCallback()); // simulate the browser's next paint
    const after = transformParts();
    expect(after.x - base.x).toBeCloseTo(20, 5);
    expect(after.y - base.y).toBeCloseTo(20, 5);
  });

  it("stops panning on pointer up and a later move has no further effect", () => {
    render(<MapCanvas image={IMAGE} imageError="" onImageFile={noop} mapData={mapData()} dispatch={noop} onSelectBarrier={noop} />);
    const wrapper = document.querySelector(".map-canvas-wrapper");
    const base = transformParts();

    fireEvent.pointerDown(wrapper, {clientX: 0, clientY: 0, pointerId: 1});
    fireEvent.pointerMove(wrapper, {clientX: 10, clientY: 10, pointerId: 1});
    fireEvent.pointerUp(wrapper, {clientX: 10, clientY: 10, pointerId: 1});
    fireEvent.pointerMove(wrapper, {clientX: 999, clientY: 999, pointerId: 1});

    const after = transformParts();
    expect(after.x - base.x).toBeCloseTo(10, 5);
    expect(after.y - base.y).toBeCloseTo(10, 5);
  });

  it("zoom in/out buttons change the scale, Fit resets pan/zoom back to the same fit it started at", () => {
    render(<MapCanvas image={IMAGE} imageError="" onImageFile={noop} mapData={mapData()} dispatch={noop} onSelectBarrier={noop} />);
    const wrapper = document.querySelector(".map-canvas-wrapper");
    const base = transformParts();

    fireEvent.pointerDown(wrapper, {clientX: 0, clientY: 0, pointerId: 1});
    fireEvent.pointerMove(wrapper, {clientX: 40, clientY: 0, pointerId: 1});
    fireEvent.pointerUp(wrapper, {clientX: 40, clientY: 0, pointerId: 1});
    const afterPan = transformParts();
    expect(afterPan.x - base.x).toBeCloseTo(40, 5);
    expect(afterPan.y - base.y).toBeCloseTo(0, 5);

    fireEvent.click(screen.getByRole("button", {name: "+"}));
    expect(transformParts().scale).toBeCloseTo(base.scale * 1.25, 5);

    fireEvent.click(screen.getByRole("button", {name: "Fit"}));
    // Nothing about the image/wrapper changed since mount, so Fit should
    // land back on exactly the same (centered) placement it started at.
    const afterFit = transformParts();
    expect(afterFit.scale).toBeCloseTo(base.scale, 5);
    expect(afterFit.x).toBeCloseTo(base.x, 5);
    expect(afterFit.y).toBeCloseTo(base.y, 5);
  });

  it("Fit shows the whole image (contain), not just fit-to-width, and centers the axis with leftover space", () => {
    // A tall, narrow image in a roughly square wrapper: fitting to width
    // alone (1000/500 = 2x) would blow the image up well past the
    // wrapper's height (2000 * 2 = 4000 >> 1000). Contain picks the
    // smaller of the two axis scales instead, so the full image stays
    // visible - and the resulting horizontal leftover space (the image is
    // only 250px wide at this zoom, in a 1000px-wide wrapper) is split
    // evenly on both sides instead of left flush against the left edge.
    const tallImage = {url: "blob:fake", pixelDimensions: {width: 500, height: 2000}};
    render(<MapCanvas image={tallImage} imageError="" onImageFile={noop} mapData={mapData()} dispatch={noop} onSelectBarrier={noop} />);
    const wrapper = document.querySelector(".map-canvas-wrapper");
    Object.defineProperty(wrapper, "clientWidth", {value: 1000, configurable: true});
    Object.defineProperty(wrapper, "clientHeight", {value: 1000, configurable: true});

    fireEvent.click(screen.getByRole("button", {name: "Fit"}));

    const {scale, x, y} = transformParts();
    expect(scale).toBeCloseTo(0.5, 5);
    expect(x).toBeCloseTo(375, 5); // (1000 - 500*0.5) / 2
    expect(y).toBeCloseTo(0, 5); // height exactly fills the wrapper, no leftover
  });

  function transformParts() {
    const t = content().style.transform;
    const scale = parseFloat(t.match(/scale\(([\d.]+)\)/)[1]);
    const [x, y] = t.match(/translate\(([-\d.]+)px, ([-\d.]+)px\)/).slice(1).map(parseFloat);
    return {x, y, scale};
  }

  it("zooms in on wheel-up and keeps the point under the cursor fixed", () => {
    render(<MapCanvas image={IMAGE} imageError="" onImageFile={noop} mapData={mapData()} dispatch={noop} onSelectBarrier={noop} />);
    const wrapper = document.querySelector(".map-canvas-wrapper");
    const before = transformParts();

    fireEvent.wheel(wrapper, {clientX: 100, clientY: 50, deltaY: -100});

    const after = transformParts();
    // Proportional to deltaY (sensitivity 0.0008), not a full 1.25x-per-event
    // step like the +/- buttons - a single wheel notch should be gentle.
    expect(after.scale).toBeCloseTo(before.scale * Math.exp(0.08), 5);
    // the image-pixel point under the cursor should map back to the same
    // screen position after zooming (rect origin is (0,0) in jsdom).
    const pixelUnderCursorBefore = (100 - before.x) / before.scale;
    const screenAfter = after.x + pixelUnderCursorBefore * after.scale;
    expect(screenAfter).toBeCloseTo(100, 5);
  });

  it("zooms out on wheel-down", () => {
    render(<MapCanvas image={IMAGE} imageError="" onImageFile={noop} mapData={mapData()} dispatch={noop} onSelectBarrier={noop} />);
    const wrapper = document.querySelector(".map-canvas-wrapper");
    // jsdom reports a 0-width wrapper, so the initial fit-zoom is already
    // clamped to the floor - zoom in first so zooming out has room to move.
    fireEvent.click(screen.getByRole("button", {name: "+"}));
    fireEvent.click(screen.getByRole("button", {name: "+"}));
    const before = transformParts();

    fireEvent.wheel(wrapper, {clientX: 100, clientY: 50, deltaY: 100});

    expect(transformParts().scale).toBeCloseTo(before.scale / Math.exp(0.08), 5);
  });

  it("coalesces several wheel events within one frame by multiplying their factors together", () => {
    let scheduleCount = 0;
    let scheduledCallback = null;
    vi.stubGlobal("requestAnimationFrame", (cb) => {
      scheduleCount += 1;
      scheduledCallback = cb;
      return scheduleCount;
    });

    render(<MapCanvas image={IMAGE} imageError="" onImageFile={noop} mapData={mapData()} dispatch={noop} onSelectBarrier={noop} />);
    const wrapper = document.querySelector(".map-canvas-wrapper");
    const before = transformParts();

    fireEvent.wheel(wrapper, {clientX: 100, clientY: 50, deltaY: -100});
    fireEvent.wheel(wrapper, {clientX: 100, clientY: 50, deltaY: -100});

    // Only the first wheel event scheduled a frame.
    expect(scheduleCount).toBe(1);

    act(() => scheduledCallback());

    // Both events' factors applied together in one flush - exp(0.08) twice.
    expect(transformParts().scale).toBeCloseTo(before.scale * Math.exp(0.08) * Math.exp(0.08), 5);
  });

  it("caps a single large deltaY spike at the per-event max factor", () => {
    render(<MapCanvas image={IMAGE} imageError="" onImageFile={noop} mapData={mapData()} dispatch={noop} onSelectBarrier={noop} />);
    const wrapper = document.querySelector(".map-canvas-wrapper");
    const before = transformParts();

    fireEvent.wheel(wrapper, {clientX: 100, clientY: 50, deltaY: -100000});

    expect(transformParts().scale).toBeCloseTo(before.scale * 1.25, 5);
  });

  it("does not scroll the page on wheel (preventDefault called)", () => {
    render(<MapCanvas image={IMAGE} imageError="" onImageFile={noop} mapData={mapData()} dispatch={noop} onSelectBarrier={noop} />);
    const wrapper = document.querySelector(".map-canvas-wrapper");
    const event = new WheelEvent("wheel", {clientX: 0, clientY: 0, deltaY: -100, cancelable: true, bubbles: true});

    wrapper.dispatchEvent(event);

    expect(event.defaultPrevented).toBe(true);
  });

  it("draws the 5ft grid only once feetDimensions has both axes set", () => {
    render(<MapCanvas image={IMAGE} imageError="" onImageFile={noop} mapData={mapData()} dispatch={noop} onSelectBarrier={noop} />);
    expect(document.querySelector(".map-canvas-grid")).not.toBeInTheDocument();

    render(<MapCanvas image={IMAGE} imageError="" onImageFile={noop} mapData={mapData({feetDimensions: {width: 160, height: 120}})} dispatch={noop} onSelectBarrier={noop} />);
    const grid = document.querySelector(".map-canvas-grid");
    expect(grid).toBeInTheDocument();

    // 800px / 160ft = 5px/ft, so 5ft of spacing is 25px on each axis here.
    const pattern = grid.querySelector("pattern");
    expect(pattern).toHaveAttribute("width", "25");
    expect(pattern).toHaveAttribute("height", "25");
  });

  it("does not draw a grid when feetDimensions is missing an axis", () => {
    render(<MapCanvas image={IMAGE} imageError="" onImageFile={noop} mapData={mapData({feetDimensions: {width: 160, height: null}})} dispatch={noop} onSelectBarrier={noop} />);
    expect(document.querySelector(".map-canvas-grid")).not.toBeInTheDocument();
  });

  it("shows a cursor readout in pixels (and feet, once feetDimensions is set) while hovering, and clears on pointer leave", () => {
    render(<MapCanvas image={IMAGE} imageError="" onImageFile={noop} mapData={mapData({feetDimensions: {width: 160, height: 120}})} dispatch={noop} onSelectBarrier={noop} />);
    const wrapper = document.querySelector(".map-canvas-wrapper");
    const base = transformParts();

    fireEvent.pointerMove(wrapper, {clientX: 100, clientY: 50});

    const expectedPixelX = Math.round((100 - base.x) / base.scale);
    const expectedPixelY = Math.round((50 - base.y) / base.scale);
    expect(document.querySelector(".map-canvas-status-bar")).toHaveTextContent(`${expectedPixelX}, ${expectedPixelY} px`);
    // 800px wide / 160ft = 5px/ft, so pixel-x / 5 = feet-x; feet-y flips
    // (image y grows down, feet y grows up) - see mapCoords.js.
    const expectedFeetX = (expectedPixelX / 5).toFixed(1);
    const expectedFeetY = (120 - expectedPixelY / 5).toFixed(1);
    expect(document.querySelector(".map-canvas-status-bar")).toHaveTextContent(`${expectedFeetX}, ${expectedFeetY} ft`);

    fireEvent.pointerLeave(wrapper);
    expect(document.querySelector(".map-canvas-status-bar")).toHaveTextContent("—");
  });

  it("shows only the pixel readout (no feet) when feetDimensions isn't set", () => {
    render(<MapCanvas image={IMAGE} imageError="" onImageFile={noop} mapData={mapData()} dispatch={noop} onSelectBarrier={noop} />);
    const wrapper = document.querySelector(".map-canvas-wrapper");

    fireEvent.pointerMove(wrapper, {clientX: 100, clientY: 50});

    expect(document.querySelector(".map-canvas-status-bar")).toHaveTextContent(/px/);
    expect(document.querySelector(".map-canvas-status-bar")).not.toHaveTextContent(/ft/);
  });

  describe("barriers (slice 3)", () => {
    const FEET_DIMENSIONS = {width: 160, height: 120}; // 800px/160ft = 5px/ft, 600px/120ft = 5px/ft

    // jsdom's 0-size wrapper makes the mount-time auto-fit clamp to the
    // zoom floor (0.05) with an odd offset, which makes hand-computed feet
    // coordinates unreadable - override the wrapper to exactly match the
    // image and re-Fit, landing on zoom=1/offset=(0,0), so client
    // coordinates equal content-pixel coordinates directly.
    function fitToImageSize() {
      const wrapper = document.querySelector(".map-canvas-wrapper");
      Object.defineProperty(wrapper, "clientWidth", {value: 800, configurable: true});
      Object.defineProperty(wrapper, "clientHeight", {value: 600, configurable: true});
      fireEvent.click(screen.getByRole("button", {name: "Fit"}));
    }

    it("draws a circle by dragging out a radius, committing on pointer up, then reverts the tool to select", () => {
      const dispatch = vi.fn();
      const onToolChange = vi.fn();
      render(
        <MapCanvas
          image={IMAGE} imageError="" onImageFile={noop} mapData={mapData({feetDimensions: FEET_DIMENSIONS})} dispatch={dispatch} onSelectBarrier={noop}
          tool="add-circle" onToolChange={onToolChange}
        />
      );
      const wrapper = document.querySelector(".map-canvas-wrapper");
      fitToImageSize();

      fireEvent.pointerDown(wrapper, {clientX: 0, clientY: 0, pointerId: 1}); // center at (0, 120) ft
      fireEvent.pointerMove(wrapper, {clientX: 25, clientY: 0, pointerId: 1}); // 25px right = 5ft
      fireEvent.pointerUp(wrapper, {clientX: 25, clientY: 0, pointerId: 1});

      expect(dispatch).toHaveBeenCalledWith({
        type: "ADD_ENTRY", section: "barriers",
        entry: {type: "circle", location: {x: 0, y: 120}, radius: 5},
      });
      expect(onToolChange).toHaveBeenCalledWith("select");
    });

    it("does not commit a zero-radius circle (an accidental click), but still reverts the tool to select", () => {
      const dispatch = vi.fn();
      const onToolChange = vi.fn();
      render(
        <MapCanvas
          image={IMAGE} imageError="" onImageFile={noop} mapData={mapData({feetDimensions: FEET_DIMENSIONS})} dispatch={dispatch} onSelectBarrier={noop}
          tool="add-circle" onToolChange={onToolChange}
        />
      );
      const wrapper = document.querySelector(".map-canvas-wrapper");

      fireEvent.pointerDown(wrapper, {clientX: 0, clientY: 0, pointerId: 1});
      fireEvent.pointerUp(wrapper, {clientX: 0, clientY: 0, pointerId: 1});

      expect(dispatch).not.toHaveBeenCalled();
      expect(onToolChange).toHaveBeenCalledWith("select");
    });

    it("cancels add-circle mode on Escape before any drag has started", () => {
      const onToolChange = vi.fn();
      render(
        <MapCanvas
          image={IMAGE} imageError="" onImageFile={noop} mapData={mapData({feetDimensions: FEET_DIMENSIONS})} dispatch={noop} onSelectBarrier={noop}
          tool="add-circle" onToolChange={onToolChange}
        />
      );

      fireEvent.keyDown(document, {key: "Escape"});

      expect(onToolChange).toHaveBeenCalledWith("select");
    });

    it("thickens only the hovered barrier's shape, not others or their handles", () => {
      const barriers = [
        {type: "wall", locations: [{x: 0, y: 0}, {x: 10, y: 0}]},
        {type: "circle", location: {x: 5, y: 5}, radius: 3},
      ];
      render(
        <MapCanvas
          image={IMAGE} imageError="" onImageFile={noop}
          mapData={mapData({feetDimensions: FEET_DIMENSIONS, barriers})}
          dispatch={noop} selectedBarrierIndex={0} onSelectBarrier={noop} hoveredBarrierIndex={0}
        />
      );

      const groups = document.querySelectorAll(".map-canvas-shapes g");
      const wallGroup = groups[0]; // barrier 0 (hovered + selected): polyline + 2 point handles
      const circleGroup = groups[1]; // barrier 1 (not hovered): just the body circle

      expect(wallGroup.querySelector("polyline")).toHaveAttribute("stroke-width", "6");
      expect(circleGroup.querySelector("circle")).toHaveAttribute("stroke-width", "3");
      // The selected wall's own point handles are unaffected by hover.
      wallGroup.querySelectorAll("circle").forEach((handle) => {
        expect(handle).toHaveAttribute("stroke-width", "1");
      });
    });

    it("renders a translucent 3ft-radius ring around a hovered wall point", () => {
      const barriers = [{type: "wall", locations: [{x: 0, y: 0}, {x: 10, y: 0}]}];
      render(
        <MapCanvas
          image={IMAGE} imageError="" onImageFile={noop}
          mapData={mapData({feetDimensions: FEET_DIMENSIONS, barriers})}
          dispatch={noop} selectedBarrierIndex={0} onSelectBarrier={noop}
          hoveredPoint={{barrierIndex: 0, pointIndex: 1}}
        />
      );

      const ring = document.querySelector(".map-canvas-point-hover-ring");
      expect(ring).toBeInTheDocument();
      // Point 1 (10, 0)ft -> pixel (50, 600) at 5px/ft; radius 3ft -> 15px.
      expect(ring).toHaveAttribute("cx", "50");
      expect(ring).toHaveAttribute("cy", "600");
      expect(ring).toHaveAttribute("r", "15");
    });

    it("shows no hover ring when hoveredPoint is null, or points at a different barrier", () => {
      const barriers = [{type: "wall", locations: [{x: 0, y: 0}, {x: 10, y: 0}]}];
      render(
        <MapCanvas
          image={IMAGE} imageError="" onImageFile={noop}
          mapData={mapData({feetDimensions: FEET_DIMENSIONS, barriers})}
          dispatch={noop} onSelectBarrier={noop}
          hoveredPoint={{barrierIndex: 1, pointIndex: 0}}
        />
      );

      expect(document.querySelector(".map-canvas-point-hover-ring")).not.toBeInTheDocument();
    });

    it("does not crash when hoveredPoint's index is stale (points past the barrier's current length)", () => {
      const barriers = [{type: "wall", locations: [{x: 0, y: 0}, {x: 10, y: 0}]}];
      render(
        <MapCanvas
          image={IMAGE} imageError="" onImageFile={noop}
          mapData={mapData({feetDimensions: FEET_DIMENSIONS, barriers})}
          dispatch={noop} onSelectBarrier={noop}
          hoveredPoint={{barrierIndex: 0, pointIndex: 5}}
        />
      );

      expect(document.querySelector(".map-canvas-point-hover-ring")).not.toBeInTheDocument();
    });

    it("selects an existing barrier by clicking it, and shows drag handles", () => {
      const onSelectBarrier = vi.fn();
      const barriers = [{type: "wall", locations: [{x: 0, y: 0}, {x: 10, y: 0}]}];
      render(
        <MapCanvas
          image={IMAGE} imageError="" onImageFile={noop}
          mapData={mapData({feetDimensions: FEET_DIMENSIONS, barriers})}
          dispatch={noop} selectedBarrierIndex={0} onSelectBarrier={onSelectBarrier}
        />
      );

      const polyline = document.querySelector(".map-canvas-shapes polyline");
      fireEvent.pointerDown(polyline);
      expect(onSelectBarrier).toHaveBeenCalledWith(0);

      // Selected -> two point handles rendered (one per vertex).
      expect(document.querySelectorAll(".map-canvas-shapes circle").length).toBe(2);
    });

    it("dragging a selected wall's point handle updates its location", () => {
      const dispatch = vi.fn();
      const barriers = [{type: "wall", locations: [{x: 0, y: 0}, {x: 10, y: 0}]}];
      render(
        <MapCanvas
          image={IMAGE} imageError="" onImageFile={noop}
          mapData={mapData({feetDimensions: FEET_DIMENSIONS, barriers})}
          dispatch={dispatch} selectedBarrierIndex={0} onSelectBarrier={noop}
        />
      );
      fitToImageSize();
      const wrapper = document.querySelector(".map-canvas-wrapper");
      const handle = document.querySelectorAll(".map-canvas-shapes circle")[0];

      // Point (0,0)ft is pixel (0,600) at this zoom/offset - see mapCoords.
      fireEvent.pointerDown(handle, {pointerId: 1});
      fireEvent.pointerMove(wrapper, {clientX: 25, clientY: 600, pointerId: 1});

      expect(dispatch).toHaveBeenCalledWith({
        type: "UPDATE_ENTRY_FIELD", section: "barriers", index: 0, field: "locations",
        value: [{x: 5, y: 0}, {x: 10, y: 0}],
      });
    });

    it("dragging a selected circle's body moves its location, without also panning the viewport", () => {
      const dispatch = vi.fn();
      const barriers = [{type: "circle", location: {x: 5, y: 5}, radius: 3}];
      render(
        <MapCanvas
          image={IMAGE} imageError="" onImageFile={noop}
          mapData={mapData({feetDimensions: FEET_DIMENSIONS, barriers})}
          dispatch={dispatch} selectedBarrierIndex={0} onSelectBarrier={noop}
        />
      );
      fitToImageSize();
      const wrapper = document.querySelector(".map-canvas-wrapper");
      const circleBody = document.querySelector(".map-canvas-shapes circle");
      const base = transformParts();

      // (5,5)ft is pixel (25,575) at this zoom/offset - see mapCoords.
      fireEvent.pointerDown(circleBody, {pointerId: 1});
      fireEvent.pointerMove(wrapper, {clientX: 50, clientY: 575, pointerId: 1});

      // Moved the circle's location (feet), not the viewport's pan offset.
      // toBeCloseTo, not toHaveBeenCalledWith - the pixelToFeet round trip
      // through this offset/zoom leaves a tiny float error (4.999999...).
      expect(dispatch).toHaveBeenCalledTimes(1);
      const call = dispatch.mock.calls[0][0];
      expect(call).toMatchObject({type: "UPDATE_ENTRY_FIELD", section: "barriers", index: 0, field: "location"});
      expect(call.value.x).toBeCloseTo(10, 5);
      expect(call.value.y).toBeCloseTo(5, 5);
      expect(transformParts().x).toBeCloseTo(base.x, 5);
    });
  });

  describe("connections (slice 4)", () => {
    const FEET_DIMENSIONS = {width: 160, height: 120}; // 800px/160ft = 5px/ft, 600px/120ft = 5px/ft

    function fitToImageSize() {
      const wrapper = document.querySelector(".map-canvas-wrapper");
      Object.defineProperty(wrapper, "clientWidth", {value: 800, configurable: true});
      Object.defineProperty(wrapper, "clientHeight", {value: 600, configurable: true});
      fireEvent.click(screen.getByRole("button", {name: "Fit"}));
    }

    it("places a point connection on a single click, then reverts the tool to select", () => {
      const dispatch = vi.fn();
      const onToolChange = vi.fn();
      render(
        <MapCanvas
          image={IMAGE} imageError="" onImageFile={noop} mapData={mapData({feetDimensions: FEET_DIMENSIONS})} dispatch={dispatch} onSelectBarrier={noop}
          tool="add-point-connection" onToolChange={onToolChange}
        />
      );
      fitToImageSize();
      const wrapper = document.querySelector(".map-canvas-wrapper");

      fireEvent.pointerDown(wrapper, {clientX: 50, clientY: 0}); // (50, 0)px -> (10, 120)ft at 5px/ft

      expect(dispatch).toHaveBeenCalledWith({
        type: "ADD_ENTRY", section: "connections",
        entry: {identifier: "connection-1", type: "point", position: {x: 10, y: 120, angle: 0}, fuzzRadius: 2, fuzzAngle: 90},
      });
      expect(onToolChange).toHaveBeenCalledWith("select");
    });

    it("picks the first unused connection-N identifier", () => {
      const dispatch = vi.fn();
      const connections = [{identifier: "connection-1", type: "point", position: {x: 0, y: 0, angle: 0}, fuzzRadius: 2, fuzzAngle: 90}];
      render(
        <MapCanvas
          image={IMAGE} imageError="" onImageFile={noop} mapData={mapData({feetDimensions: FEET_DIMENSIONS, connections})} dispatch={dispatch} onSelectBarrier={noop}
          tool="add-point-connection" onToolChange={noop}
        />
      );
      fitToImageSize();
      const wrapper = document.querySelector(".map-canvas-wrapper");

      fireEvent.pointerDown(wrapper, {clientX: 0, clientY: 0});

      expect(dispatch.mock.calls[0][0].entry.identifier).toBe("connection-2");
    });

    it("draws a line connection by dragging start to end, committing on pointer up, then reverts the tool", () => {
      const dispatch = vi.fn();
      const onToolChange = vi.fn();
      render(
        <MapCanvas
          image={IMAGE} imageError="" onImageFile={noop} mapData={mapData({feetDimensions: FEET_DIMENSIONS})} dispatch={dispatch} onSelectBarrier={noop}
          tool="add-line-connection" onToolChange={onToolChange}
        />
      );
      fitToImageSize();
      const wrapper = document.querySelector(".map-canvas-wrapper");

      fireEvent.pointerDown(wrapper, {clientX: 0, clientY: 0, pointerId: 1}); // (0, 0)px -> (0, 120)ft
      fireEvent.pointerMove(wrapper, {clientX: 50, clientY: 0, pointerId: 1}); // (50, 0)px -> (10, 120)ft
      fireEvent.pointerUp(wrapper, {clientX: 50, clientY: 0, pointerId: 1});

      expect(dispatch).toHaveBeenCalledWith({
        type: "ADD_ENTRY", section: "connections",
        entry: {identifier: "connection-1", type: "line", start: {x: 0, y: 120}, end: {x: 10, y: 120}},
      });
      expect(onToolChange).toHaveBeenCalledWith("select");
    });

    it("does not commit a zero-length line (an accidental click), but still reverts the tool", () => {
      const dispatch = vi.fn();
      const onToolChange = vi.fn();
      render(
        <MapCanvas
          image={IMAGE} imageError="" onImageFile={noop} mapData={mapData({feetDimensions: FEET_DIMENSIONS})} dispatch={dispatch} onSelectBarrier={noop}
          tool="add-line-connection" onToolChange={onToolChange}
        />
      );
      const wrapper = document.querySelector(".map-canvas-wrapper");

      fireEvent.pointerDown(wrapper, {clientX: 0, clientY: 0, pointerId: 1});
      fireEvent.pointerUp(wrapper, {clientX: 0, clientY: 0, pointerId: 1});

      expect(dispatch).not.toHaveBeenCalled();
      expect(onToolChange).toHaveBeenCalledWith("select");
    });

    it("selects an existing line connection by clicking it, and shows endpoint drag handles", () => {
      const onSelectConnection = vi.fn();
      const connections = [{identifier: "a", type: "line", start: {x: 0, y: 0}, end: {x: 10, y: 0}}];
      render(
        <MapCanvas
          image={IMAGE} imageError="" onImageFile={noop}
          mapData={mapData({feetDimensions: FEET_DIMENSIONS, connections})}
          dispatch={noop} onSelectBarrier={noop}
          selectedConnectionIndex={0} onSelectConnection={onSelectConnection}
        />
      );

      const line = document.querySelector(".map-canvas-shapes line");
      fireEvent.pointerDown(line);
      expect(onSelectConnection).toHaveBeenCalledWith(0);

      expect(document.querySelectorAll(".map-canvas-shapes circle").length).toBe(2);
    });

    it("dragging a line connection's endpoint handle updates just that end", () => {
      const dispatch = vi.fn();
      const connections = [{identifier: "a", type: "line", start: {x: 0, y: 0}, end: {x: 10, y: 0}}];
      render(
        <MapCanvas
          image={IMAGE} imageError="" onImageFile={noop}
          mapData={mapData({feetDimensions: FEET_DIMENSIONS, connections})}
          dispatch={dispatch} onSelectBarrier={noop}
          selectedConnectionIndex={0} onSelectConnection={noop}
        />
      );
      fitToImageSize();
      const wrapper = document.querySelector(".map-canvas-wrapper");
      const handle = document.querySelectorAll(".map-canvas-shapes circle")[0]; // start handle: (0,0)ft -> (0,600)px

      fireEvent.pointerDown(handle, {pointerId: 1});
      fireEvent.pointerMove(wrapper, {clientX: 25, clientY: 600, pointerId: 1});

      expect(dispatch).toHaveBeenCalledWith({
        type: "UPDATE_ENTRY_FIELD", section: "connections", index: 0, field: "start", value: {x: 5, y: 0},
      });
    });

    it("dragging a point connection's marker moves its position, keeping its facing angle", () => {
      const dispatch = vi.fn();
      const connections = [{identifier: "a", type: "point", position: {x: 5, y: 5, angle: 180}, fuzzRadius: 2, fuzzAngle: 90}];
      render(
        <MapCanvas
          image={IMAGE} imageError="" onImageFile={noop}
          mapData={mapData({feetDimensions: FEET_DIMENSIONS, connections})}
          dispatch={dispatch} onSelectBarrier={noop}
          selectedConnectionIndex={0} onSelectConnection={noop}
        />
      );
      fitToImageSize();
      const wrapper = document.querySelector(".map-canvas-wrapper");
      const marker = document.querySelector(".map-canvas-shapes circle"); // (5,5)ft -> (25,575)px

      fireEvent.pointerDown(marker, {pointerId: 1});
      fireEvent.pointerMove(wrapper, {clientX: 50, clientY: 575, pointerId: 1});

      expect(dispatch).toHaveBeenCalledTimes(1);
      const call = dispatch.mock.calls[0][0];
      expect(call).toMatchObject({type: "UPDATE_ENTRY_FIELD", section: "connections", index: 0, field: "position"});
      expect(call.value.x).toBeCloseTo(10, 5);
      expect(call.value.y).toBeCloseTo(5, 5);
      expect(call.value.angle).toBe(180);
    });
  });

  describe("units (slice 5)", () => {
    const FEET_DIMENSIONS = {width: 160, height: 120}; // 800px/160ft = 5px/ft, 600px/120ft = 5px/ft

    function fitToImageSize() {
      const wrapper = document.querySelector(".map-canvas-wrapper");
      Object.defineProperty(wrapper, "clientWidth", {value: 800, configurable: true});
      Object.defineProperty(wrapper, "clientHeight", {value: 600, configurable: true});
      fireEvent.click(screen.getByRole("button", {name: "Fit"}));
    }

    it("places a unit on a single click with the pending unit type, then reverts the tool to select", () => {
      const dispatch = vi.fn();
      const onToolChange = vi.fn();
      render(
        <MapCanvas
          image={IMAGE} imageError="" onImageFile={noop} mapData={mapData({feetDimensions: FEET_DIMENSIONS})} dispatch={dispatch} onSelectBarrier={noop}
          tool="add-unit" pendingUnitType="goblin-raider" onToolChange={onToolChange}
        />
      );
      fitToImageSize();
      const wrapper = document.querySelector(".map-canvas-wrapper");

      fireEvent.pointerDown(wrapper, {clientX: 50, clientY: 0}); // (50, 0)px -> (10, 120)ft at 5px/ft

      expect(dispatch).toHaveBeenCalledWith({
        type: "ADD_ENTRY", section: "units",
        entry: {unitType: "goblin-raider", position: {x: 10, y: 120, angle: 0}, hostility: "hostile", currentHpFraction: 1.0, movement: {type: "still"}},
      });
      expect(onToolChange).toHaveBeenCalledWith("select");
    });

    it("does not snap unit placement to a nearby barrier point", () => {
      const dispatch = vi.fn();
      const barriers = [{type: "wall", locations: [{x: 10, y: 120}, {x: 20, y: 120}]}];
      render(
        <MapCanvas
          image={IMAGE} imageError="" onImageFile={noop} mapData={mapData({feetDimensions: FEET_DIMENSIONS, barriers})} dispatch={dispatch} onSelectBarrier={noop}
          tool="add-unit" pendingUnitType="goblin-raider" onToolChange={noop}
        />
      );
      fitToImageSize();
      const wrapper = document.querySelector(".map-canvas-wrapper");

      // 1ft from the barrier point (10,120) - would snap for a barrier/connection, but not a unit.
      fireEvent.pointerDown(wrapper, {clientX: 55, clientY: 0});

      expect(dispatch.mock.calls[0][0].entry.position).toEqual({x: 11, y: 120, angle: 0});
    });

    it("selects an existing unit by clicking its marker, and shows drag handles via selection", () => {
      const onSelectUnit = vi.fn();
      const units = [{unitType: "goblin-raider", identifier: "a", position: {x: 5, y: 5, angle: 0}, hostility: "hostile", currentHpFraction: 1, movement: {type: "still"}}];
      render(
        <MapCanvas
          image={IMAGE} imageError="" onImageFile={noop}
          mapData={mapData({feetDimensions: FEET_DIMENSIONS, units})}
          dispatch={noop} onSelectBarrier={noop}
          selectedUnitIndex={0} onSelectUnit={onSelectUnit}
        />
      );

      const marker = document.querySelector(".map-canvas-shapes circle");
      fireEvent.pointerDown(marker);

      expect(onSelectUnit).toHaveBeenCalledWith(0);
    });

    it("calls onHoverUnit on pointer enter/leave of a unit's marker (so its sidebar row can highlight)", () => {
      const onHoverUnit = vi.fn();
      const units = [{unitType: "goblin-raider", identifier: "a", position: {x: 5, y: 5, angle: 0}, hostility: "hostile", currentHpFraction: 1, movement: {type: "still"}}];
      render(
        <MapCanvas
          image={IMAGE} imageError="" onImageFile={noop}
          mapData={mapData({feetDimensions: FEET_DIMENSIONS, units})}
          dispatch={noop} onSelectBarrier={noop}
          selectedUnitIndex={null} onSelectUnit={noop} onHoverUnit={onHoverUnit}
        />
      );

      const marker = document.querySelector(".map-canvas-shapes g");
      fireEvent.pointerEnter(marker);
      expect(onHoverUnit).toHaveBeenCalledWith(0);
      fireEvent.pointerLeave(marker);
      expect(onHoverUnit).toHaveBeenCalledWith(null);
    });

    it("clicking a unit's marker while grouping mode is active toggles membership instead of selecting/dragging", () => {
      const onSelectUnit = vi.fn();
      const onToggleGroupMember = vi.fn();
      const dispatch = vi.fn();
      const units = [{unitType: "goblin-raider", identifier: "a", position: {x: 5, y: 5, angle: 0}, hostility: "hostile", currentHpFraction: 1, movement: {type: "still"}}];
      render(
        <MapCanvas
          image={IMAGE} imageError="" onImageFile={noop}
          mapData={mapData({feetDimensions: FEET_DIMENSIONS, units})}
          dispatch={dispatch} onSelectBarrier={noop}
          selectedUnitIndex={null} onSelectUnit={onSelectUnit}
          groupingMode={{groupIdentifier: "pack"}} onToggleGroupMember={onToggleGroupMember}
        />
      );
      fitToImageSize();
      const wrapper = document.querySelector(".map-canvas-wrapper");
      const marker = document.querySelector(".map-canvas-shapes g");

      fireEvent.pointerDown(marker, {pointerId: 1});
      fireEvent.pointerMove(wrapper, {clientX: 999, clientY: 999, pointerId: 1});

      expect(onToggleGroupMember).toHaveBeenCalledWith(0);
      expect(onSelectUnit).not.toHaveBeenCalled();
      expect(dispatch).not.toHaveBeenCalled();
    });

    it("draws a translucent-red highlight (ring per member + full-mesh lines) for the group named by groupIdentifier via groupingMode", () => {
      const units = [
        {unitType: "goblin-raider", identifier: "a", position: {x: 5, y: 5, angle: 0}, hostility: "hostile", currentHpFraction: 1, movement: {type: "still"}, groupIdentifier: "pack"},
        {unitType: "goblin-raider", identifier: "b", position: {x: 20, y: 5, angle: 0}, hostility: "hostile", currentHpFraction: 1, movement: {type: "still"}, groupIdentifier: "pack"},
        {unitType: "goblin-raider", identifier: "c", position: {x: 40, y: 5, angle: 0}, hostility: "hostile", currentHpFraction: 1, movement: {type: "still"}},
      ];
      render(
        <MapCanvas
          image={IMAGE} imageError="" onImageFile={noop}
          mapData={mapData({feetDimensions: FEET_DIMENSIONS, units})}
          dispatch={noop} onSelectBarrier={noop}
          groupingMode={{groupIdentifier: "pack"}}
        />
      );

      const highlight = document.querySelector(".map-group-highlight");
      expect(highlight).toBeInTheDocument();
      // Two members -> one ring each, one connecting line.
      expect(highlight.querySelectorAll("circle")).toHaveLength(2);
      expect(highlight.querySelectorAll("line")).toHaveLength(1);
    });

    it("highlights via hoveredGroupIdentifier when grouping mode isn't active", () => {
      const units = [
        {unitType: "goblin-raider", identifier: "a", position: {x: 5, y: 5, angle: 0}, hostility: "hostile", currentHpFraction: 1, movement: {type: "still"}, groupIdentifier: "pack"},
        {unitType: "goblin-raider", identifier: "b", position: {x: 20, y: 5, angle: 0}, hostility: "hostile", currentHpFraction: 1, movement: {type: "still"}, groupIdentifier: "pack"},
      ];
      render(
        <MapCanvas
          image={IMAGE} imageError="" onImageFile={noop}
          mapData={mapData({feetDimensions: FEET_DIMENSIONS, units})}
          dispatch={noop} onSelectBarrier={noop}
          hoveredGroupIdentifier="pack"
        />
      );

      expect(document.querySelector(".map-group-highlight").querySelectorAll("circle")).toHaveLength(2);
    });

    it("draws no group highlight when no group is hovered/active", () => {
      const units = [{unitType: "goblin-raider", identifier: "a", position: {x: 5, y: 5, angle: 0}, hostility: "hostile", currentHpFraction: 1, movement: {type: "still"}, groupIdentifier: "pack"}];
      render(
        <MapCanvas
          image={IMAGE} imageError="" onImageFile={noop}
          mapData={mapData({feetDimensions: FEET_DIMENSIONS, units})}
          dispatch={noop} onSelectBarrier={noop}
        />
      );

      expect(document.querySelector(".map-group-highlight")).not.toBeInTheDocument();
    });

    it("dragging a unit's marker moves its position, keeping its facing angle", () => {
      const dispatch = vi.fn();
      const units = [{unitType: "goblin-raider", identifier: "a", position: {x: 5, y: 5, angle: 90}, hostility: "hostile", currentHpFraction: 1, movement: {type: "still"}}];
      render(
        <MapCanvas
          image={IMAGE} imageError="" onImageFile={noop}
          mapData={mapData({feetDimensions: FEET_DIMENSIONS, units})}
          dispatch={dispatch} onSelectBarrier={noop}
          selectedUnitIndex={0} onSelectUnit={noop}
        />
      );
      fitToImageSize();
      const wrapper = document.querySelector(".map-canvas-wrapper");
      const marker = document.querySelector(".map-canvas-shapes circle"); // (5,5)ft -> (25,575)px

      fireEvent.pointerDown(marker, {pointerId: 1});
      fireEvent.pointerMove(wrapper, {clientX: 50, clientY: 575, pointerId: 1});

      expect(dispatch).toHaveBeenCalledTimes(1);
      const call = dispatch.mock.calls[0][0];
      expect(call).toMatchObject({type: "UPDATE_ENTRY_FIELD", section: "units", index: 0, field: "position"});
      expect(call.value.x).toBeCloseTo(10, 5);
      expect(call.value.y).toBeCloseTo(5, 5);
      expect(call.value.angle).toBe(90);
    });

    it("renders a unit's real token image, circularly clipped and sized to its unit type's tokenRadius", () => {
      const units = [{unitType: "goblin-raider", identifier: "a", position: {x: 10, y: 60, angle: 0}, hostility: "hostile", currentHpFraction: 1, movement: {type: "still"}}];
      const availableUnitTypes = {"goblin-raider": {name: "Goblin Raider", tokenRadius: 3, tokenImageUrl: "data:image/webp;base64,AAAA"}};
      render(
        <MapCanvas
          image={IMAGE} imageError="" onImageFile={noop}
          mapData={mapData({feetDimensions: FEET_DIMENSIONS, units})}
          dispatch={noop} onSelectBarrier={noop} availableUnitTypes={availableUnitTypes}
        />
      );

      // (10,60)ft -> (50,300)px at 5px/ft; tokenRadius 3ft -> 15px.
      const image = document.querySelector(".map-canvas-shapes image");
      expect(image).toHaveAttribute("href", "data:image/webp;base64,AAAA");
      expect(image).toHaveAttribute("x", "35"); // 50 - 15
      expect(image).toHaveAttribute("y", "285"); // 300 - 15
      expect(image).toHaveAttribute("width", "30");
      expect(image).toHaveAttribute("height", "30");
    });

    it("falls back to a plain hostility-colored circle when the unit type has no tokenImageUrl", () => {
      const units = [{unitType: "slime", identifier: "a", position: {x: 0, y: 0, angle: 0}, hostility: "hostile", currentHpFraction: 1, movement: {type: "still"}}];
      const availableUnitTypes = {slime: {name: "Slime", tokenRadius: 2, tokenImageUrl: null}};
      render(
        <MapCanvas
          image={IMAGE} imageError="" onImageFile={noop}
          mapData={mapData({feetDimensions: FEET_DIMENSIONS, units})}
          dispatch={noop} onSelectBarrier={noop} availableUnitTypes={availableUnitTypes}
        />
      );

      expect(document.querySelector(".map-canvas-shapes image")).not.toBeInTheDocument();
      expect(document.querySelector(".map-canvas-shapes circle")).toBeInTheDocument();
    });
  });

  describe("movement (slice 8)", () => {
    const FEET_DIMENSIONS = {width: 160, height: 120}; // 800px/160ft = 5px/ft, 600px/120ft = 5px/ft

    function fitToImageSize() {
      const wrapper = document.querySelector(".map-canvas-wrapper");
      Object.defineProperty(wrapper, "clientWidth", {value: 800, configurable: true});
      Object.defineProperty(wrapper, "clientHeight", {value: 600, configurable: true});
      fireEvent.click(screen.getByRole("button", {name: "Fit"}));
    }

    function patrolUnit(overrides) {
      return {
        unitType: "goblin-raider", identifier: "a", position: {x: 0, y: 0, angle: 0}, hostility: "hostile", currentHpFraction: 1,
        movement: {
          type: "patrol", choose: "loop",
          steps: [
            {position: {x: 10, y: 10, angle: 0}, movementRate: 0.5, waitTime: 1},
            {position: {x: 20, y: 10, angle: 0}, movementRate: 0.5, waitTime: 1},
          ],
        },
        ...overrides,
      };
    }

    it("draws an orange dotted path through a patrol unit's steps in order, translucent by default", () => {
      const units = [patrolUnit()];
      render(
        <MapCanvas
          image={IMAGE} imageError="" onImageFile={noop}
          mapData={mapData({feetDimensions: FEET_DIMENSIONS, units})}
          dispatch={noop} onSelectBarrier={noop}
        />
      );

      const overlay = document.querySelector(".map-movement-highlight");
      expect(overlay).toBeInTheDocument();
      const line = overlay.querySelector("polyline");
      expect(line).toBeInTheDocument();
      expect(line).toHaveAttribute("stroke", "rgba(255, 152, 0, 0.35)");
      expect(overlay.querySelectorAll("circle")).toHaveLength(2);
    });

    it("draws a patrol unit's path fully opaque when its token is hovered", () => {
      const units = [patrolUnit()];
      render(
        <MapCanvas
          image={IMAGE} imageError="" onImageFile={noop}
          mapData={mapData({feetDimensions: FEET_DIMENSIONS, units})}
          dispatch={noop} onSelectBarrier={noop}
          hoveredUnitIndex={0}
        />
      );

      expect(document.querySelector(".map-movement-highlight polyline")).toHaveAttribute("stroke", "#ff9800");
    });

    it("draws a patrol unit's path fully opaque when its row is expanded (being edited)", () => {
      const units = [patrolUnit()];
      render(
        <MapCanvas
          image={IMAGE} imageError="" onImageFile={noop}
          mapData={mapData({feetDimensions: FEET_DIMENSIONS, units})}
          dispatch={noop} onSelectBarrier={noop}
          expandedUnitIndices={new Set([0])}
        />
      );

      expect(document.querySelector(".map-movement-highlight polyline")).toHaveAttribute("stroke", "#ff9800");
    });

    it("lights up a token-sized orange ring at a hovered patrol step's location", () => {
      const units = [{
        unitType: "goblin-raider", identifier: "a", position: {x: 0, y: 0, angle: 0}, hostility: "hostile", currentHpFraction: 1,
        movement: {
          type: "patrol", choose: "loop",
          steps: [
            {position: {x: 10, y: 10, angle: 0}, movementRate: 0.5, waitTime: 1},
            {position: {x: 20, y: 10, angle: 0}, movementRate: 0.5, waitTime: 1},
          ],
        },
      }];
      const availableUnitTypes = {"goblin-raider": {name: "Goblin Raider", tokenRadius: 4}};
      render(
        <MapCanvas
          image={IMAGE} imageError="" onImageFile={noop}
          mapData={mapData({feetDimensions: FEET_DIMENSIONS, units})}
          dispatch={noop} onSelectBarrier={noop}
          availableUnitTypes={availableUnitTypes}
          hoveredPatrolStep={{unitIndex: 0, stepIndex: 1}}
        />
      );

      // Base rendering: polyline + 2 step dots = 3 shapes without a hover ring.
      // With hoveredPatrolStep targeting step 1, a 4th (the ring) appears at (20,10)ft.
      const overlay = document.querySelector(".map-movement-highlight");
      const circles = overlay.querySelectorAll("circle");
      expect(circles).toHaveLength(3);
      const ring = circles[2];
      expect(ring).toHaveAttribute("cx", "100"); // 20ft * 5px/ft
      expect(ring).toHaveAttribute("cy", "550"); // (120-10)ft * 5px/ft
      expect(ring).toHaveAttribute("r", "20"); // tokenRadius 4ft * 5px/ft
    });

    it("draws a dim translucent circle at a wander unit's location/radius", () => {
      const units = [{
        unitType: "goblin-raider", identifier: "a", position: {x: 0, y: 0, angle: 0}, hostility: "hostile", currentHpFraction: 1,
        movement: {type: "wander", location: {x: 30, y: 30}, radius: 8, speed: 0.3, waitTime: 1},
      }];
      render(
        <MapCanvas
          image={IMAGE} imageError="" onImageFile={noop}
          mapData={mapData({feetDimensions: FEET_DIMENSIONS, units})}
          dispatch={noop} onSelectBarrier={noop}
        />
      );

      const circle = document.querySelector(".map-movement-highlight circle");
      expect(circle).toBeInTheDocument();
      expect(circle).toHaveAttribute("cx", "150"); // 30ft * 5px/ft
      expect(circle).toHaveAttribute("cy", "450"); // (120-30)ft * 5px/ft
      expect(circle).toHaveAttribute("r", "40"); // 8ft * 5px/ft
      // Filled in but translucent by default (not just an outline).
      expect(circle).toHaveAttribute("fill", "rgba(255, 152, 0, 0.18)");
      expect(circle).toHaveAttribute("stroke", "rgba(255, 152, 0, 0.35)");
    });

    it("draws a wander unit's circle more opaque when its token is hovered", () => {
      const units = [{
        unitType: "goblin-raider", identifier: "a", position: {x: 0, y: 0, angle: 0}, hostility: "hostile", currentHpFraction: 1,
        movement: {type: "wander", location: {x: 30, y: 30}, radius: 8, speed: 0.3, waitTime: 1},
      }];
      render(
        <MapCanvas
          image={IMAGE} imageError="" onImageFile={noop}
          mapData={mapData({feetDimensions: FEET_DIMENSIONS, units})}
          dispatch={noop} onSelectBarrier={noop}
          hoveredUnitIndex={0}
        />
      );

      const circle = document.querySelector(".map-movement-highlight circle");
      expect(circle).toHaveAttribute("fill", "rgba(255, 152, 0, 0.35)");
      expect(circle).toHaveAttribute("stroke", "#ff9800");
    });

    it("draws nothing for a still unit", () => {
      const units = [{unitType: "goblin-raider", identifier: "a", position: {x: 0, y: 0, angle: 0}, hostility: "hostile", currentHpFraction: 1, movement: {type: "still"}}];
      render(
        <MapCanvas
          image={IMAGE} imageError="" onImageFile={noop}
          mapData={mapData({feetDimensions: FEET_DIMENSIONS, units})}
          dispatch={noop} onSelectBarrier={noop}
        />
      );

      expect(document.querySelector(".map-movement-highlight").children).toHaveLength(0);
    });

    it("clicking the map appends a patrol step and auto-advances placement, so a run of clicks lays a path", () => {
      const dispatch = vi.fn();
      const units = [{
        unitType: "goblin-raider", identifier: "a", position: {x: 0, y: 0, angle: 0}, hostility: "hostile", currentHpFraction: 1,
        movement: {type: "patrol", choose: "loop", steps: []},
      }];
      const onPlacePatrolStep = vi.fn();
      render(
        <MapCanvas
          image={IMAGE} imageError="" onImageFile={noop} mapData={mapData({feetDimensions: FEET_DIMENSIONS, units})} dispatch={dispatch} onSelectBarrier={noop}
          patrolStepPlacement={{unitIndex: 0, stepIndex: 0, mode: "insert"}} onPlacePatrolStep={onPlacePatrolStep} onCancelPatrolStepPlacement={noop}
        />
      );
      fitToImageSize();
      const wrapper = document.querySelector(".map-canvas-wrapper");

      fireEvent.pointerDown(wrapper, {clientX: 50, clientY: 0}); // (50,0)px -> (10,120)ft

      expect(onPlacePatrolStep).toHaveBeenCalledWith({x: 10, y: 120});
    });

    it("shows the 'Placing Points' status while a patrol step or wander location is being placed", () => {
      const {rerender} = render(
        <MapCanvas
          image={IMAGE} imageError="" onImageFile={noop} mapData={mapData()} dispatch={noop} onSelectBarrier={noop}
          patrolStepPlacement={{unitIndex: 0, stepIndex: 0, mode: "insert"}}
        />
      );
      expect(screen.getByText("Placing Points")).toBeInTheDocument();

      rerender(
        <MapCanvas
          image={IMAGE} imageError="" onImageFile={noop} mapData={mapData()} dispatch={noop} onSelectBarrier={noop}
          wanderLocationPlacement={{unitIndex: 0}}
        />
      );
      expect(screen.getByText("Placing Points")).toBeInTheDocument();
    });

    it("clicking the map sets a wander unit's location, then exits placement", () => {
      const onPlaceWanderLocation = vi.fn();
      render(
        <MapCanvas
          image={IMAGE} imageError="" onImageFile={noop} mapData={mapData({feetDimensions: FEET_DIMENSIONS})} dispatch={noop} onSelectBarrier={noop}
          wanderLocationPlacement={{unitIndex: 0}} onPlaceWanderLocation={onPlaceWanderLocation} onCancelWanderLocationPlacement={noop}
        />
      );
      fitToImageSize();
      const wrapper = document.querySelector(".map-canvas-wrapper");

      fireEvent.pointerDown(wrapper, {clientX: 50, clientY: 0});

      expect(onPlaceWanderLocation).toHaveBeenCalledWith({x: 10, y: 120});
    });

    it("previews a patrol unit's route with the pending point inserted at the hovered position", () => {
      const units = [{
        unitType: "goblin-raider", identifier: "a", position: {x: 0, y: 0, angle: 0}, hostility: "hostile", currentHpFraction: 1,
        movement: {
          type: "patrol", choose: "loop",
          steps: [
            {position: {x: 0, y: 0, angle: 0}, movementRate: 0.5, waitTime: 1},
            {position: {x: 10, y: 0, angle: 0}, movementRate: 0.5, waitTime: 1},
          ],
        },
      }];
      render(
        <MapCanvas
          image={IMAGE} imageError="" onImageFile={noop} mapData={mapData({feetDimensions: FEET_DIMENSIONS, units})} dispatch={noop} onSelectBarrier={noop}
          patrolStepPlacement={{unitIndex: 0, stepIndex: 1, mode: "insert"}} onPlacePatrolStep={noop} onCancelPatrolStepPlacement={noop}
        />
      );
      fitToImageSize();
      const wrapper = document.querySelector(".map-canvas-wrapper");

      fireEvent.pointerMove(wrapper, {clientX: 50, clientY: 300}); // (50,300)px -> (10,60)ft

      // Existing steps at (0,0)ft and (10,0)ft -> (0,600)px and (50,600)px;
      // the pending point inserted between them at the hovered (10,60)ft -> (50,300)px.
      const preview = document.querySelector(".map-canvas-placement-preview");
      expect(preview.querySelector("polyline")).toHaveAttribute("points", "0,600 50,300 50,600");
      const marker = preview.querySelector("circle");
      expect(marker).toHaveAttribute("cx", "50");
      expect(marker).toHaveAttribute("cy", "300");
    });

    it("previews just the pending marker (no polyline) for a route with no steps yet", () => {
      const units = [{
        unitType: "goblin-raider", identifier: "a", position: {x: 0, y: 0, angle: 0}, hostility: "hostile", currentHpFraction: 1,
        movement: {type: "patrol", choose: "loop", steps: []},
      }];
      render(
        <MapCanvas
          image={IMAGE} imageError="" onImageFile={noop} mapData={mapData({feetDimensions: FEET_DIMENSIONS, units})} dispatch={noop} onSelectBarrier={noop}
          patrolStepPlacement={{unitIndex: 0, stepIndex: 0, mode: "insert"}} onPlacePatrolStep={noop} onCancelPatrolStepPlacement={noop}
        />
      );
      fitToImageSize();
      const wrapper = document.querySelector(".map-canvas-wrapper");

      fireEvent.pointerMove(wrapper, {clientX: 50, clientY: 300});

      const preview = document.querySelector(".map-canvas-placement-preview");
      expect(preview.querySelector("polyline")).not.toBeInTheDocument();
      expect(preview.querySelectorAll("circle")).toHaveLength(1);
    });

    it("previews an edit-mode re-place by moving just that one step's position", () => {
      const units = [{
        unitType: "goblin-raider", identifier: "a", position: {x: 0, y: 0, angle: 0}, hostility: "hostile", currentHpFraction: 1,
        movement: {
          type: "patrol", choose: "loop",
          steps: [
            {position: {x: 0, y: 0, angle: 0}, movementRate: 0.5, waitTime: 1},
            {position: {x: 10, y: 0, angle: 0}, movementRate: 0.5, waitTime: 1},
          ],
        },
      }];
      render(
        <MapCanvas
          image={IMAGE} imageError="" onImageFile={noop} mapData={mapData({feetDimensions: FEET_DIMENSIONS, units})} dispatch={noop} onSelectBarrier={noop}
          patrolStepPlacement={{unitIndex: 0, stepIndex: 1, mode: "edit"}} onPlacePatrolStep={noop} onCancelPatrolStepPlacement={noop}
        />
      );
      fitToImageSize();
      const wrapper = document.querySelector(".map-canvas-wrapper");

      fireEvent.pointerMove(wrapper, {clientX: 50, clientY: 300}); // -> (10,60)ft

      // Still 2 points total (step 0 unchanged, step 1 replaced by the hover position).
      const preview = document.querySelector(".map-canvas-placement-preview");
      expect(preview.querySelector("polyline")).toHaveAttribute("points", "0,600 50,300");
    });

    it("shows no preview before the cursor has hovered the map, or once placement ends", () => {
      const units = [{
        unitType: "goblin-raider", identifier: "a", position: {x: 0, y: 0, angle: 0}, hostility: "hostile", currentHpFraction: 1,
        movement: {type: "patrol", choose: "loop", steps: [{position: {x: 0, y: 0, angle: 0}, movementRate: 0.5, waitTime: 1}]},
      }];
      const {rerender} = render(
        <MapCanvas
          image={IMAGE} imageError="" onImageFile={noop} mapData={mapData({feetDimensions: FEET_DIMENSIONS, units})} dispatch={noop} onSelectBarrier={noop}
          patrolStepPlacement={{unitIndex: 0, stepIndex: 1, mode: "insert"}} onPlacePatrolStep={noop} onCancelPatrolStepPlacement={noop}
        />
      );
      expect(document.querySelector(".map-canvas-placement-preview")).not.toBeInTheDocument();

      rerender(
        <MapCanvas
          image={IMAGE} imageError="" onImageFile={noop} mapData={mapData({feetDimensions: FEET_DIMENSIONS, units})} dispatch={noop} onSelectBarrier={noop}
          patrolStepPlacement={null} onPlacePatrolStep={noop} onCancelPatrolStepPlacement={noop}
        />
      );
      expect(document.querySelector(".map-canvas-placement-preview")).not.toBeInTheDocument();
    });
  });

  describe("simulate units (slice 9)", () => {
    const FEET_DIMENSIONS = {width: 160, height: 120};
    const units = [{unitType: "goblin-raider", identifier: "a", position: {x: 0, y: 0, angle: 0}, hostility: "hostile", currentHpFraction: 1, movement: {type: "still"}}];

    it("shows the toggle only once there's at least one unit", () => {
      render(<MapCanvas image={IMAGE} imageError="" onImageFile={noop} mapData={mapData({feetDimensions: FEET_DIMENSIONS})} dispatch={noop} onSelectBarrier={noop} />);
      expect(screen.queryByRole("button", {name: "Simulate Units"})).not.toBeInTheDocument();
    });

    it("calls onToggleSimulate when clicked, and shows 'Stop Simulating' + a speed slider once active", () => {
      const onToggleSimulate = vi.fn();
      const {rerender} = render(
        <MapCanvas
          image={IMAGE} imageError="" onImageFile={noop} mapData={mapData({feetDimensions: FEET_DIMENSIONS, units})} dispatch={noop} onSelectBarrier={noop}
          onToggleSimulate={onToggleSimulate}
        />
      );

      fireEvent.click(screen.getByRole("button", {name: "Simulate Units"}));
      expect(onToggleSimulate).toHaveBeenCalled();
      expect(screen.queryByRole("slider")).not.toBeInTheDocument();

      rerender(
        <MapCanvas
          image={IMAGE} imageError="" onImageFile={noop} mapData={mapData({feetDimensions: FEET_DIMENSIONS, units})} dispatch={noop} onSelectBarrier={noop}
          onToggleSimulate={onToggleSimulate} simulating simSpeed={3}
        />
      );
      expect(screen.getByRole("button", {name: "Stop Simulating"})).toBeInTheDocument();
      expect(screen.getByRole("slider")).toHaveValue("3");
      expect(screen.getByText("3x")).toBeInTheDocument();
    });

    it("calls onSimSpeedChange when the slider moves", () => {
      const onSimSpeedChange = vi.fn();
      render(
        <MapCanvas
          image={IMAGE} imageError="" onImageFile={noop} mapData={mapData({feetDimensions: FEET_DIMENSIONS, units})} dispatch={noop} onSelectBarrier={noop}
          simulating simSpeed={1} onSimSpeedChange={onSimSpeedChange}
        />
      );

      fireEvent.change(screen.getByRole("slider"), {target: {value: "7"}});
      expect(onSimSpeedChange).toHaveBeenCalledWith(7);
    });

    it("ignores dragging a unit's marker while simulating (read-only)", () => {
      const dispatch = vi.fn();
      const onSelectUnit = vi.fn();
      render(
        <MapCanvas
          image={IMAGE} imageError="" onImageFile={noop}
          mapData={mapData({feetDimensions: FEET_DIMENSIONS, units})}
          dispatch={dispatch} onSelectBarrier={noop} onSelectUnit={onSelectUnit}
          simulating
        />
      );
      const marker = document.querySelector(".map-canvas-shapes g");

      fireEvent.pointerDown(marker, {pointerId: 1});

      expect(onSelectUnit).not.toHaveBeenCalled();
      expect(dispatch).not.toHaveBeenCalled();
    });

    it("ignores dragging a barrier's wall point while simulating", () => {
      const dispatch = vi.fn();
      const onSelectBarrier = vi.fn();
      const barriers = [{type: "wall", locations: [{x: 0, y: 0}, {x: 10, y: 0}]}];
      render(
        <MapCanvas
          image={IMAGE} imageError="" onImageFile={noop}
          mapData={mapData({feetDimensions: FEET_DIMENSIONS, barriers})}
          dispatch={dispatch} onSelectBarrier={onSelectBarrier}
          selectedBarrierIndex={0}
          simulating
        />
      );
      const handle = document.querySelector(".map-canvas-shapes circle");

      fireEvent.pointerDown(handle, {pointerId: 1});

      expect(onSelectBarrier).not.toHaveBeenCalled();
      expect(dispatch).not.toHaveBeenCalled();
    });

    it("still allows panning the map while simulating", () => {
      render(
        <MapCanvas
          image={IMAGE} imageError="" onImageFile={noop}
          mapData={mapData({feetDimensions: FEET_DIMENSIONS, units})}
          dispatch={noop} onSelectBarrier={noop}
          simulating
        />
      );
      const wrapper = document.querySelector(".map-canvas-wrapper");
      const base = transformParts();

      fireEvent.pointerDown(wrapper, {clientX: 0, clientY: 0, pointerId: 1});
      fireEvent.pointerMove(wrapper, {clientX: 20, clientY: 10, pointerId: 1});
      fireEvent.pointerUp(wrapper, {clientX: 20, clientY: 10, pointerId: 1});

      const after = transformParts();
      expect(after.x - base.x).toBeCloseTo(20, 5);
      expect(after.y - base.y).toBeCloseTo(10, 5);
    });
  });

  // MapPreviewCanvas mounts a real THREE.WebGLRenderer on an actual canvas,
  // which jsdom can't provide a WebGL context for - so, matching this
  // codebase's existing convention for such components (editor/
  // AbilityPreviewCanvas.jsx and previewScene.js have no test coverage
  // either), these only exercise the toggle button itself, never actually
  // rendering with `previewing` true.
  describe("walk preview (phase 2)", () => {
    const FEET_DIMENSIONS = {width: 160, height: 120};

    it("shows the toggle only once feetDimensions is set", () => {
      render(<MapCanvas image={IMAGE} imageError="" onImageFile={noop} mapData={mapData()} dispatch={noop} onSelectBarrier={noop} />);
      expect(screen.queryByRole("button", {name: "Walk Preview"})).not.toBeInTheDocument();
    });

    it("calls onTogglePreview when clicked", () => {
      const onTogglePreview = vi.fn();
      render(
        <MapCanvas
          image={IMAGE} imageError="" onImageFile={noop} mapData={mapData({feetDimensions: FEET_DIMENSIONS})} dispatch={noop} onSelectBarrier={noop}
          onTogglePreview={onTogglePreview}
        />
      );

      fireEvent.click(screen.getByRole("button", {name: "Walk Preview"}));
      expect(onTogglePreview).toHaveBeenCalled();
    });

    it("disables Walk Preview while simulating", () => {
      const units = [{unitType: "goblin-raider", identifier: "a", position: {x: 0, y: 0, angle: 0}, hostility: "hostile", currentHpFraction: 1, movement: {type: "still"}}];
      render(
        <MapCanvas
          image={IMAGE} imageError="" onImageFile={noop} mapData={mapData({feetDimensions: FEET_DIMENSIONS, units})} dispatch={noop} onSelectBarrier={noop}
          simulating
        />
      );
      expect(screen.getByRole("button", {name: "Walk Preview"})).toBeDisabled();
    });
  });

  describe("unit position re-placement (from UnitsPanel's PositionButton)", () => {
    const FEET_DIMENSIONS = {width: 160, height: 120}; // 5px/ft both axes

    function fitToImageSize() {
      const wrapper = document.querySelector(".map-canvas-wrapper");
      Object.defineProperty(wrapper, "clientWidth", {value: 800, configurable: true});
      Object.defineProperty(wrapper, "clientHeight", {value: 600, configurable: true});
      fireEvent.click(screen.getByRole("button", {name: "Fit"}));
    }

    it("shows the 'Placing Points' status and crosshair cursor while a unit's position is being placed", () => {
      render(
        <MapCanvas
          image={IMAGE} imageError="" onImageFile={noop} mapData={mapData()} dispatch={noop} onSelectBarrier={noop}
          unitPlacement={{unitIndex: 0}} onPlaceUnitPosition={noop} onCancelUnitPlacement={noop}
        />
      );

      expect(screen.getByText("Placing Points")).toBeInTheDocument();
      expect(document.querySelector(".map-canvas-wrapper")).toHaveClass("map-canvas-wrapper-placing");
    });

    it("clicking the map updates a unit's position, keeping its facing angle, then exits placement", () => {
      const dispatch = vi.fn();
      const units = [{unitType: "goblin-raider", identifier: "a", position: {x: 0, y: 0, angle: 45}, hostility: "hostile", currentHpFraction: 1, movement: {type: "still"}}];
      render(
        <MapCanvas
          image={IMAGE} imageError="" onImageFile={noop} mapData={mapData({feetDimensions: FEET_DIMENSIONS, units})} dispatch={dispatch} onSelectBarrier={noop}
          unitPlacement={{unitIndex: 0}}
          onPlaceUnitPosition={(feet) => dispatch({type: "UPDATE_ENTRY_FIELD", section: "units", index: 0, field: "position", value: {...units[0].position, ...feet}})}
          onCancelUnitPlacement={noop}
        />
      );
      fitToImageSize();
      const wrapper = document.querySelector(".map-canvas-wrapper");

      fireEvent.pointerDown(wrapper, {clientX: 50, clientY: 0}); // (50, 0)px -> (10, 120)ft at 5px/ft

      expect(dispatch).toHaveBeenCalledWith({
        type: "UPDATE_ENTRY_FIELD", section: "units", index: 0, field: "position", value: {x: 10, y: 120, angle: 45},
      });
    });

    it("does not snap unit re-placement, takes priority over the current tool, and does not pan", () => {
      const onPlaceUnitPosition = vi.fn();
      const dispatch = vi.fn();
      const barriers = [{type: "wall", locations: [{x: 10, y: 120}, {x: 20, y: 120}]}];
      render(
        <MapCanvas
          image={IMAGE} imageError="" onImageFile={noop} mapData={mapData({feetDimensions: FEET_DIMENSIONS, barriers})} dispatch={dispatch} onSelectBarrier={noop}
          tool="add-circle" onToolChange={noop}
          unitPlacement={{unitIndex: 0}} onPlaceUnitPosition={onPlaceUnitPosition} onCancelUnitPlacement={noop}
        />
      );
      fitToImageSize();
      const wrapper = document.querySelector(".map-canvas-wrapper");
      const contentBefore = document.querySelector(".map-canvas-content").style.transform;

      // 1ft from the barrier point (10,120) - would snap for a barrier, but not a unit.
      fireEvent.pointerDown(wrapper, {clientX: 55, clientY: 0});
      fireEvent.pointerMove(wrapper, {clientX: 100, clientY: 100});

      expect(onPlaceUnitPosition).toHaveBeenCalledWith({x: 11, y: 120});
      expect(dispatch).not.toHaveBeenCalled();
      expect(document.querySelector(".map-canvas-content").style.transform).toBe(contentBefore);
    });

    it("cancels on Escape, and on a click outside the map but not on the position pill", () => {
      const onCancelUnitPlacement = vi.fn();
      render(
        <MapCanvas
          image={IMAGE} imageError="" onImageFile={noop} mapData={mapData({feetDimensions: FEET_DIMENSIONS})} dispatch={noop} onSelectBarrier={noop}
          unitPlacement={{unitIndex: 0}} onPlaceUnitPosition={noop} onCancelUnitPlacement={onCancelUnitPlacement}
        />
      );

      fireEvent.keyDown(document, {key: "Escape"});
      expect(onCancelUnitPlacement).toHaveBeenCalledTimes(1);

      const pillButton = document.createElement("button");
      pillButton.className = "map-unit-position-btn";
      document.body.appendChild(pillButton);
      fireEvent.pointerDown(pillButton);
      expect(onCancelUnitPlacement).toHaveBeenCalledTimes(1);

      fireEvent.pointerDown(document.body);
      expect(onCancelUnitPlacement).toHaveBeenCalledTimes(2);

      document.body.removeChild(pillButton);
    });
  });

  describe("connection field re-placement (from ConnectionsPanel's coordinate pills)", () => {
    const FEET_DIMENSIONS = {width: 160, height: 120}; // 5px/ft both axes

    function fitToImageSize() {
      const wrapper = document.querySelector(".map-canvas-wrapper");
      Object.defineProperty(wrapper, "clientWidth", {value: 800, configurable: true});
      Object.defineProperty(wrapper, "clientHeight", {value: 600, configurable: true});
      fireEvent.click(screen.getByRole("button", {name: "Fit"}));
    }

    it("shows the 'Placing Points' status and crosshair cursor while a connection field is being placed", () => {
      render(
        <MapCanvas
          image={IMAGE} imageError="" onImageFile={noop} mapData={mapData()} dispatch={noop} onSelectBarrier={noop}
          connectionPlacement={{connectionIndex: 0, field: "position"}} onPlaceConnectionField={noop} onCancelConnectionPlacement={noop}
        />
      );

      expect(screen.getByText("Placing Points")).toBeInTheDocument();
      expect(document.querySelector(".map-canvas-wrapper")).toHaveClass("map-canvas-wrapper-placing");
    });

    it("clicking the map updates a point connection's position, keeping its facing angle, then exits placement", () => {
      const dispatch = vi.fn();
      const onCancelConnectionPlacement = vi.fn();
      const connections = [{identifier: "a", type: "point", position: {x: 0, y: 0, angle: 45}, fuzzRadius: 2, fuzzAngle: 90}];
      render(
        <MapCanvas
          image={IMAGE} imageError="" onImageFile={noop} mapData={mapData({feetDimensions: FEET_DIMENSIONS, connections})} dispatch={dispatch} onSelectBarrier={noop}
          connectionPlacement={{connectionIndex: 0, field: "position"}}
          onPlaceConnectionField={(feet) => dispatch({type: "UPDATE_ENTRY_FIELD", section: "connections", index: 0, field: "position", value: {...connections[0].position, ...feet}})}
          onCancelConnectionPlacement={onCancelConnectionPlacement}
        />
      );
      fitToImageSize();
      const wrapper = document.querySelector(".map-canvas-wrapper");

      fireEvent.pointerDown(wrapper, {clientX: 50, clientY: 0}); // (50, 0)px -> (10, 120)ft at 5px/ft

      expect(dispatch).toHaveBeenCalledWith({
        type: "UPDATE_ENTRY_FIELD", section: "connections", index: 0, field: "position", value: {x: 10, y: 120, angle: 45},
      });
    });

    it("takes priority over the current tool, and does not pan", () => {
      const onPlaceConnectionField = vi.fn();
      const dispatch = vi.fn();
      render(
        <MapCanvas
          image={IMAGE} imageError="" onImageFile={noop} mapData={mapData({feetDimensions: FEET_DIMENSIONS})} dispatch={dispatch} onSelectBarrier={noop}
          tool="add-circle" onToolChange={noop}
          connectionPlacement={{connectionIndex: 0, field: "start"}} onPlaceConnectionField={onPlaceConnectionField} onCancelConnectionPlacement={noop}
        />
      );
      fitToImageSize();
      const wrapper = document.querySelector(".map-canvas-wrapper");
      const contentBefore = document.querySelector(".map-canvas-content").style.transform;

      fireEvent.pointerDown(wrapper, {clientX: 0, clientY: 0});
      fireEvent.pointerMove(wrapper, {clientX: 100, clientY: 100});

      expect(onPlaceConnectionField).toHaveBeenCalledTimes(1);
      expect(dispatch).not.toHaveBeenCalled();
      expect(document.querySelector(".map-canvas-content").style.transform).toBe(contentBefore);
    });

    it("cancels on Escape", () => {
      const onCancelConnectionPlacement = vi.fn();
      render(
        <MapCanvas
          image={IMAGE} imageError="" onImageFile={noop} mapData={mapData({feetDimensions: FEET_DIMENSIONS})} dispatch={noop} onSelectBarrier={noop}
          connectionPlacement={{connectionIndex: 0, field: "position"}} onPlaceConnectionField={noop} onCancelConnectionPlacement={onCancelConnectionPlacement}
        />
      );

      fireEvent.keyDown(document, {key: "Escape"});

      expect(onCancelConnectionPlacement).toHaveBeenCalled();
    });

    it("cancels on a click outside the map, but not on a click on another coordinate pill", () => {
      const onCancelConnectionPlacement = vi.fn();
      render(
        <MapCanvas
          image={IMAGE} imageError="" onImageFile={noop} mapData={mapData({feetDimensions: FEET_DIMENSIONS})} dispatch={noop} onSelectBarrier={noop}
          connectionPlacement={{connectionIndex: 0, field: "position"}} onPlaceConnectionField={noop} onCancelConnectionPlacement={onCancelConnectionPlacement}
        />
      );
      const pillButton = document.createElement("button");
      pillButton.className = "map-connection-field-btn";
      document.body.appendChild(pillButton);

      fireEvent.pointerDown(pillButton);
      expect(onCancelConnectionPlacement).not.toHaveBeenCalled();

      fireEvent.pointerDown(document.body);
      expect(onCancelConnectionPlacement).toHaveBeenCalled();

      document.body.removeChild(pillButton);
    });
  });

  describe("point placement (from BarriersPanel's '+' buttons)", () => {
    const FEET_DIMENSIONS = {width: 160, height: 120}; // 5px/ft both axes

    function fitToImageSize() {
      const wrapper = document.querySelector(".map-canvas-wrapper");
      Object.defineProperty(wrapper, "clientWidth", {value: 800, configurable: true});
      Object.defineProperty(wrapper, "clientHeight", {value: 600, configurable: true});
      fireEvent.click(screen.getByRole("button", {name: "Fit"}));
    }

    it("shows the yellow 'Placing Points' status while placement is active, not otherwise", () => {
      render(<MapCanvas image={IMAGE} imageError="" onImageFile={noop} mapData={mapData()} dispatch={noop} onSelectBarrier={noop} />);
      expect(screen.queryByText("Placing Points")).not.toBeInTheDocument();

      render(
        <MapCanvas
          image={IMAGE} imageError="" onImageFile={noop} mapData={mapData()} dispatch={noop} onSelectBarrier={noop}
          placement={{barrierIndex: 0, pointIndex: 0}} onPlacePoint={noop} onCancelPlacement={noop}
        />
      );
      expect(screen.getByText("Placing Points")).toBeInTheDocument();
    });

    it("clicking the map calls onPlacePoint with the clicked feet position", () => {
      const onPlacePoint = vi.fn();
      render(
        <MapCanvas
          image={IMAGE} imageError="" onImageFile={noop} mapData={mapData({feetDimensions: FEET_DIMENSIONS})} dispatch={noop} onSelectBarrier={noop}
          placement={{barrierIndex: 0, pointIndex: 0}} onPlacePoint={onPlacePoint} onCancelPlacement={noop}
        />
      );
      fitToImageSize();
      const wrapper = document.querySelector(".map-canvas-wrapper");

      fireEvent.pointerDown(wrapper, {clientX: 50, clientY: 0});

      // (50, 0)px -> (10, 120)ft at 5px/ft (zoom=1/offset=0 after Fit).
      expect(onPlacePoint).toHaveBeenCalledWith({x: 10, y: 120});
    });

    it("previews the wall's boundary with the pending point at the hovered position", () => {
      const barriers = [{type: "wall", locations: [{x: 0, y: 0}, {x: 10, y: 0}]}];
      render(
        <MapCanvas
          image={IMAGE} imageError="" onImageFile={noop} mapData={mapData({feetDimensions: FEET_DIMENSIONS, barriers})} dispatch={noop} onSelectBarrier={noop}
          placement={{barrierIndex: 0, pointIndex: 1}} onPlacePoint={noop} onCancelPlacement={noop}
        />
      );
      fitToImageSize();
      const wrapper = document.querySelector(".map-canvas-wrapper");

      fireEvent.pointerMove(wrapper, {clientX: 50, clientY: 300}); // (50, 300)px -> (10, 60)ft

      // The preview polyline includes the two existing points plus the
      // pending one inserted at index 1, at the hovered feet position.
      const preview = document.querySelector(".map-canvas-placement-preview");
      expect(preview.querySelector("polyline")).toHaveAttribute("points", "0,600 50,300 50,600");
      // A marker circle sits exactly on the pending point.
      const marker = preview.querySelector("circle");
      expect(marker).toHaveAttribute("cx", "50");
      expect(marker).toHaveAttribute("cy", "300");
    });

    it("shows only the pending-point marker (no polyline) for a wall with no points yet", () => {
      const barriers = [{type: "wall", locations: []}];
      render(
        <MapCanvas
          image={IMAGE} imageError="" onImageFile={noop} mapData={mapData({feetDimensions: FEET_DIMENSIONS, barriers})} dispatch={noop} onSelectBarrier={noop}
          placement={{barrierIndex: 0, pointIndex: 0}} onPlacePoint={noop} onCancelPlacement={noop}
        />
      );
      fitToImageSize();
      const wrapper = document.querySelector(".map-canvas-wrapper");

      fireEvent.pointerMove(wrapper, {clientX: 50, clientY: 300});

      const preview = document.querySelector(".map-canvas-placement-preview");
      expect(preview.querySelector("polyline")).not.toBeInTheDocument();
      expect(preview.querySelector("circle")).toBeInTheDocument();
    });

    it("shows no preview before the cursor has hovered the map, or once placement ends", () => {
      const barriers = [{type: "wall", locations: [{x: 0, y: 0}, {x: 10, y: 0}]}];
      const {rerender} = render(
        <MapCanvas
          image={IMAGE} imageError="" onImageFile={noop} mapData={mapData({feetDimensions: FEET_DIMENSIONS, barriers})} dispatch={noop} onSelectBarrier={noop}
          placement={{barrierIndex: 0, pointIndex: 1}} onPlacePoint={noop} onCancelPlacement={noop}
        />
      );
      expect(document.querySelector(".map-canvas-placement-preview")).not.toBeInTheDocument();

      fitToImageSize();
      const wrapper = document.querySelector(".map-canvas-wrapper");
      fireEvent.pointerMove(wrapper, {clientX: 50, clientY: 300});
      expect(document.querySelector(".map-canvas-placement-preview")).toBeInTheDocument();

      rerender(
        <MapCanvas
          image={IMAGE} imageError="" onImageFile={noop} mapData={mapData({feetDimensions: FEET_DIMENSIONS, barriers})} dispatch={noop} onSelectBarrier={noop}
          placement={null} onPlacePoint={noop} onCancelPlacement={noop}
        />
      );
      expect(document.querySelector(".map-canvas-placement-preview")).not.toBeInTheDocument();
    });

    it("edit mode: clicking the map replaces just that point, in place, without advancing", () => {
      const onPlacePoint = vi.fn();
      const barriers = [{type: "wall", locations: [{x: 0, y: 0}, {x: 10, y: 0}]}];
      render(
        <MapCanvas
          image={IMAGE} imageError="" onImageFile={noop} mapData={mapData({feetDimensions: FEET_DIMENSIONS, barriers})} dispatch={noop} onSelectBarrier={noop}
          placement={{barrierIndex: 0, pointIndex: 1, mode: "edit"}} onPlacePoint={onPlacePoint} onCancelPlacement={noop}
        />
      );
      fitToImageSize();
      const wrapper = document.querySelector(".map-canvas-wrapper");

      fireEvent.pointerDown(wrapper, {clientX: 50, clientY: 300}); // (50, 300)px -> (10, 60)ft

      expect(onPlacePoint).toHaveBeenCalledWith({x: 10, y: 60});
    });

    it("edit mode: the preview replaces the edited point in place (array length unchanged), snapping to a different existing point", () => {
      const barriers = [{type: "wall", locations: [{x: 0, y: 0}, {x: 10, y: 0}, {x: 10, y: 10}]}];
      render(
        <MapCanvas
          image={IMAGE} imageError="" onImageFile={noop} mapData={mapData({feetDimensions: FEET_DIMENSIONS, barriers})} dispatch={noop} onSelectBarrier={noop}
          placement={{barrierIndex: 0, pointIndex: 2, mode: "edit"}} onPlacePoint={noop} onCancelPlacement={noop}
        />
      );
      fitToImageSize();
      const wrapper = document.querySelector(".map-canvas-wrapper");

      // Hover 1ft from point 0 (0,0)ft - within the snap radius - while
      // editing point 2 (10,10)ft.
      fireEvent.pointerMove(wrapper, {clientX: 5, clientY: 600});

      const preview = document.querySelector(".map-canvas-placement-preview");
      // Still 3 points (replaced in place, not inserted) - point 2 now
      // reads as (0,0), snapped onto point 0.
      expect(preview.querySelector("polyline")).toHaveAttribute("points", "0,600 50,600 0,600");
      const marker = preview.querySelector("circle");
      expect(marker).toHaveAttribute("cx", "0");
      expect(marker).toHaveAttribute("cy", "600");
    });

    it("placement takes priority over the current tool (e.g. add-wall doesn't also start a draft wall)", () => {
      const onPlacePoint = vi.fn();
      const dispatch = vi.fn();
      render(
        <MapCanvas
          image={IMAGE} imageError="" onImageFile={noop} mapData={mapData({feetDimensions: FEET_DIMENSIONS})} dispatch={dispatch} onSelectBarrier={noop}
          placement={{barrierIndex: 0, pointIndex: 0}} onPlacePoint={onPlacePoint} onCancelPlacement={noop}
        />
      );
      const wrapper = document.querySelector(".map-canvas-wrapper");

      fireEvent.pointerDown(wrapper, {clientX: 0, clientY: 0});

      expect(onPlacePoint).toHaveBeenCalledTimes(1);
      expect(dispatch).not.toHaveBeenCalled();
    });

    it("cancels on Escape", () => {
      const onCancelPlacement = vi.fn();
      render(
        <MapCanvas
          image={IMAGE} imageError="" onImageFile={noop} mapData={mapData({feetDimensions: FEET_DIMENSIONS})} dispatch={noop} onSelectBarrier={noop}
          placement={{barrierIndex: 0, pointIndex: 0}} onPlacePoint={noop} onCancelPlacement={onCancelPlacement}
        />
      );

      fireEvent.keyDown(document, {key: "Escape"});

      expect(onCancelPlacement).toHaveBeenCalled();
    });

    it("cancels on a click outside the map", () => {
      const onCancelPlacement = vi.fn();
      render(
        <MapCanvas
          image={IMAGE} imageError="" onImageFile={noop} mapData={mapData({feetDimensions: FEET_DIMENSIONS})} dispatch={noop} onSelectBarrier={noop}
          placement={{barrierIndex: 0, pointIndex: 0}} onPlacePoint={noop} onCancelPlacement={onCancelPlacement}
        />
      );

      fireEvent.pointerDown(document.body);

      expect(onCancelPlacement).toHaveBeenCalled();
    });

    it("uses a crosshair cursor while placement is active, not otherwise", () => {
      render(<MapCanvas image={IMAGE} imageError="" onImageFile={noop} mapData={mapData()} dispatch={noop} onSelectBarrier={noop} />);
      expect(document.querySelector(".map-canvas-wrapper")).not.toHaveClass("map-canvas-wrapper-placing");

      render(
        <MapCanvas
          image={IMAGE} imageError="" onImageFile={noop} mapData={mapData()} dispatch={noop} onSelectBarrier={noop}
          placement={{barrierIndex: 0, pointIndex: 0}} onPlacePoint={noop} onCancelPlacement={noop}
        />
      );
      expect(document.querySelectorAll(".map-canvas-wrapper")[1]).toHaveClass("map-canvas-wrapper-placing");
    });

    it("shows a status and crosshair cursor for every single-shot add-tool too, not just wall/field placement", () => {
      for (const [tool, expectedText] of [
        ["add-circle", "Placing Circle - drag on the map"],
        ["add-point-connection", "Placing Point Connection - click the map"],
        ["add-line-connection", "Placing Line Connection - drag on the map"],
      ]) {
        render(<MapCanvas image={IMAGE} imageError="" onImageFile={noop} mapData={mapData()} dispatch={noop} onSelectBarrier={noop} tool={tool} onToolChange={noop} />);
        expect(screen.getByText(expectedText)).toBeInTheDocument();
        expect(document.querySelectorAll(".map-canvas-wrapper-placing").length).toBeGreaterThan(0);
      }
    });

    it("shows no placing status while the tool is 'select'", () => {
      render(<MapCanvas image={IMAGE} imageError="" onImageFile={noop} mapData={mapData()} dispatch={noop} onSelectBarrier={noop} tool="select" onToolChange={noop} />);
      expect(document.querySelector(".map-canvas-placing-status")).not.toBeInTheDocument();
    });

    it("does not pan the map on a pointerdown+move while placement is active", () => {
      render(
        <MapCanvas
          image={IMAGE} imageError="" onImageFile={noop} mapData={mapData({feetDimensions: FEET_DIMENSIONS})} dispatch={noop} onSelectBarrier={noop}
          placement={{barrierIndex: 0, pointIndex: 0}} onPlacePoint={vi.fn()} onCancelPlacement={noop}
        />
      );
      fitToImageSize();
      const wrapper = document.querySelector(".map-canvas-wrapper");
      const contentBefore = document.querySelector(".map-canvas-content").style.transform;

      fireEvent.pointerDown(wrapper, {clientX: 0, clientY: 0});
      fireEvent.pointerMove(wrapper, {clientX: 100, clientY: 100});

      expect(document.querySelector(".map-canvas-content").style.transform).toBe(contentBefore);
    });

    it("does not cancel on a click on a '+' button (starting a new placement supersedes this one instead)", () => {
      const onCancelPlacement = vi.fn();
      render(
        <MapCanvas
          image={IMAGE} imageError="" onImageFile={noop} mapData={mapData({feetDimensions: FEET_DIMENSIONS})} dispatch={noop} onSelectBarrier={noop}
          placement={{barrierIndex: 0, pointIndex: 0}} onPlacePoint={noop} onCancelPlacement={onCancelPlacement}
        />
      );
      const plusButton = document.createElement("button");
      plusButton.className = "map-point-plus";
      document.body.appendChild(plusButton);

      fireEvent.pointerDown(plusButton);

      expect(onCancelPlacement).not.toHaveBeenCalled();
      document.body.removeChild(plusButton);
    });
  });

  describe("snap-to-point", () => {
    const FEET_DIMENSIONS = {width: 160, height: 120}; // 5px/ft both axes

    function fitToImageSize() {
      const wrapper = document.querySelector(".map-canvas-wrapper");
      Object.defineProperty(wrapper, "clientWidth", {value: 800, configurable: true});
      Object.defineProperty(wrapper, "clientHeight", {value: 600, configurable: true});
      fireEvent.click(screen.getByRole("button", {name: "Fit"}));
    }

    it("placing a wall point snaps to an existing point within 2ft", () => {
      const onPlacePoint = vi.fn();
      const barriers = [{type: "wall", locations: [{x: 10, y: 120}, {x: 20, y: 120}]}];
      render(
        <MapCanvas
          image={IMAGE} imageError="" onImageFile={noop} mapData={mapData({feetDimensions: FEET_DIMENSIONS, barriers})} dispatch={noop} onSelectBarrier={noop}
          placement={{barrierIndex: 1, pointIndex: 0}} onPlacePoint={onPlacePoint} onCancelPlacement={noop}
        />
      );
      fitToImageSize();
      const wrapper = document.querySelector(".map-canvas-wrapper");

      // (10,120)ft is pixel (50,0); clicking 1ft off at (55,0)px -> (11,120)ft is within the 2ft snap radius.
      fireEvent.pointerDown(wrapper, {clientX: 55, clientY: 0});

      expect(onPlacePoint).toHaveBeenCalledWith({x: 10, y: 120});
    });

    it("does not snap while Shift is held", () => {
      const onPlacePoint = vi.fn();
      const barriers = [{type: "wall", locations: [{x: 10, y: 120}, {x: 20, y: 120}]}];
      render(
        <MapCanvas
          image={IMAGE} imageError="" onImageFile={noop} mapData={mapData({feetDimensions: FEET_DIMENSIONS, barriers})} dispatch={noop} onSelectBarrier={noop}
          placement={{barrierIndex: 1, pointIndex: 0}} onPlacePoint={onPlacePoint} onCancelPlacement={noop}
        />
      );
      fitToImageSize();
      const wrapper = document.querySelector(".map-canvas-wrapper");

      fireEvent.pointerDown(wrapper, {clientX: 55, clientY: 0, shiftKey: true});

      expect(onPlacePoint).toHaveBeenCalledWith({x: 11, y: 120});
    });

    it("does not snap to a point more than 2ft away", () => {
      const onPlacePoint = vi.fn();
      const barriers = [{type: "wall", locations: [{x: 10, y: 120}, {x: 20, y: 120}]}];
      render(
        <MapCanvas
          image={IMAGE} imageError="" onImageFile={noop} mapData={mapData({feetDimensions: FEET_DIMENSIONS, barriers})} dispatch={noop} onSelectBarrier={noop}
          placement={{barrierIndex: 1, pointIndex: 0}} onPlacePoint={onPlacePoint} onCancelPlacement={noop}
        />
      );
      fitToImageSize();
      const wrapper = document.querySelector(".map-canvas-wrapper");

      // (25,0)px -> (5,120)ft - 5ft from (10,120), outside the snap radius.
      fireEvent.pointerDown(wrapper, {clientX: 25, clientY: 0});

      expect(onPlacePoint).toHaveBeenCalledWith({x: 5, y: 120});
    });

    it("dragging a wall point snaps onto another barrier's nearby point", () => {
      const dispatch = vi.fn();
      const barriers = [
        {type: "wall", locations: [{x: 0, y: 0}, {x: 10, y: 0}]},
        {type: "wall", locations: [{x: 30, y: 60}, {x: 40, y: 60}]},
      ];
      render(
        <MapCanvas
          image={IMAGE} imageError="" onImageFile={noop}
          mapData={mapData({feetDimensions: FEET_DIMENSIONS, barriers})}
          dispatch={dispatch} selectedBarrierIndex={0} onSelectBarrier={noop}
        />
      );
      fitToImageSize();
      const wrapper = document.querySelector(".map-canvas-wrapper");
      const handle = document.querySelectorAll(".map-canvas-shapes circle")[0]; // barrier 0's first point handle

      // (30,60)ft is pixel (150,300); dragging 1ft off at (155,300)px -> (31,60)ft, within the snap radius.
      fireEvent.pointerDown(handle, {pointerId: 1});
      fireEvent.pointerMove(wrapper, {clientX: 155, clientY: 300, pointerId: 1});

      expect(dispatch).toHaveBeenCalledWith({
        type: "UPDATE_ENTRY_FIELD", section: "barriers", index: 0, field: "locations",
        value: [{x: 30, y: 60}, {x: 10, y: 0}],
      });
    });

    it("re-placing a connection field snaps to a nearby barrier point", () => {
      const onPlaceConnectionField = vi.fn();
      const barriers = [{type: "wall", locations: [{x: 10, y: 120}, {x: 20, y: 120}]}];
      const connections = [{identifier: "a", type: "point", position: {x: 0, y: 0, angle: 30}, fuzzRadius: 2, fuzzAngle: 90}];
      render(
        <MapCanvas
          image={IMAGE} imageError="" onImageFile={noop}
          mapData={mapData({feetDimensions: FEET_DIMENSIONS, barriers, connections})}
          dispatch={noop} onSelectBarrier={noop}
          connectionPlacement={{connectionIndex: 0, field: "position"}} onPlaceConnectionField={onPlaceConnectionField} onCancelConnectionPlacement={noop}
        />
      );
      fitToImageSize();
      const wrapper = document.querySelector(".map-canvas-wrapper");

      fireEvent.pointerDown(wrapper, {clientX: 55, clientY: 0});

      expect(onPlaceConnectionField).toHaveBeenCalledWith({x: 10, y: 120});
    });

    it("add-circle's center snaps to a nearby point on pointerdown", () => {
      const dispatch = vi.fn();
      const barriers = [{type: "wall", locations: [{x: 10, y: 120}, {x: 20, y: 120}]}];
      render(
        <MapCanvas
          image={IMAGE} imageError="" onImageFile={noop} mapData={mapData({feetDimensions: FEET_DIMENSIONS, barriers})} dispatch={dispatch} onSelectBarrier={noop}
          tool="add-circle" onToolChange={noop}
        />
      );
      fitToImageSize();
      const wrapper = document.querySelector(".map-canvas-wrapper");

      fireEvent.pointerDown(wrapper, {clientX: 55, clientY: 0, pointerId: 1});
      fireEvent.pointerMove(wrapper, {clientX: 55, clientY: 25, pointerId: 1});
      fireEvent.pointerUp(wrapper, {clientX: 55, clientY: 25, pointerId: 1});

      expect(dispatch).toHaveBeenCalledWith(expect.objectContaining({
        type: "ADD_ENTRY", section: "barriers",
        entry: expect.objectContaining({type: "circle", location: {x: 10, y: 120}}),
      }));
    });
  });
});
