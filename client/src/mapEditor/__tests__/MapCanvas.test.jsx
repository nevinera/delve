import {describe, it, expect, vi, beforeEach, afterEach} from "vitest";
import {render, screen, fireEvent, act} from "@testing-library/react";
import MapCanvas from "../MapCanvas";

const IMAGE = {url: "blob:fake", pixelDimensions: {width: 800, height: 600}};

function mapData(overrides = {}) {
  return {barriers: [], feetDimensions: null, ...overrides};
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
          placement={{barrierIndex: 0, insertIndex: 0}} onPlacePoint={noop} onCancelPlacement={noop}
        />
      );
      expect(screen.getByText("Placing Points")).toBeInTheDocument();
    });

    it("clicking the map calls onPlacePoint with the clicked feet position", () => {
      const onPlacePoint = vi.fn();
      render(
        <MapCanvas
          image={IMAGE} imageError="" onImageFile={noop} mapData={mapData({feetDimensions: FEET_DIMENSIONS})} dispatch={noop} onSelectBarrier={noop}
          placement={{barrierIndex: 0, insertIndex: 0}} onPlacePoint={onPlacePoint} onCancelPlacement={noop}
        />
      );
      fitToImageSize();
      const wrapper = document.querySelector(".map-canvas-wrapper");

      fireEvent.pointerDown(wrapper, {clientX: 50, clientY: 0});

      // (50, 0)px -> (10, 120)ft at 5px/ft (zoom=1/offset=0 after Fit).
      expect(onPlacePoint).toHaveBeenCalledWith({x: 10, y: 120});
    });

    it("placement takes priority over the current tool (e.g. add-wall doesn't also start a draft wall)", () => {
      const onPlacePoint = vi.fn();
      const dispatch = vi.fn();
      render(
        <MapCanvas
          image={IMAGE} imageError="" onImageFile={noop} mapData={mapData({feetDimensions: FEET_DIMENSIONS})} dispatch={dispatch} onSelectBarrier={noop}
          placement={{barrierIndex: 0, insertIndex: 0}} onPlacePoint={onPlacePoint} onCancelPlacement={noop}
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
          placement={{barrierIndex: 0, insertIndex: 0}} onPlacePoint={noop} onCancelPlacement={onCancelPlacement}
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
          placement={{barrierIndex: 0, insertIndex: 0}} onPlacePoint={noop} onCancelPlacement={onCancelPlacement}
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
          placement={{barrierIndex: 0, insertIndex: 0}} onPlacePoint={noop} onCancelPlacement={noop}
        />
      );
      expect(document.querySelectorAll(".map-canvas-wrapper")[1]).toHaveClass("map-canvas-wrapper-placing");
    });

    it("does not pan the map on a pointerdown+move while placement is active", () => {
      render(
        <MapCanvas
          image={IMAGE} imageError="" onImageFile={noop} mapData={mapData({feetDimensions: FEET_DIMENSIONS})} dispatch={noop} onSelectBarrier={noop}
          placement={{barrierIndex: 0, insertIndex: 0}} onPlacePoint={vi.fn()} onCancelPlacement={noop}
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
          placement={{barrierIndex: 0, insertIndex: 0}} onPlacePoint={noop} onCancelPlacement={onCancelPlacement}
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
});
