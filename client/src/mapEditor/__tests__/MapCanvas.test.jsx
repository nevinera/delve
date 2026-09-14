import {describe, it, expect, vi, beforeEach, afterEach} from "vitest";
import {render, screen, fireEvent, act} from "@testing-library/react";
import MapCanvas from "../MapCanvas";

const IMAGE = {url: "blob:fake", pixelDimensions: {width: 800, height: 600}};

function content() {
  return document.querySelector(".map-canvas-content");
}

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
    render(<MapCanvas image={null} imageError="" onImageFile={() => {}} backUrl="/build/maps" />);
    let backLink = screen.getByRole("link", {name: "← Back"});
    expect(backLink).toHaveAttribute("href", "/build/maps");
    expect(backLink.closest(".map-canvas-toolbar-row")).toBeInTheDocument();

    render(<MapCanvas image={IMAGE} imageError="" onImageFile={() => {}} backUrl="/build/maps" />);
    backLink = screen.getAllByRole("link", {name: "← Back"})[1];
    expect(backLink).toHaveAttribute("href", "/build/maps");
  });

  it("keeps the zoom buttons together in their own button-group, separate from Back", () => {
    render(<MapCanvas image={IMAGE} imageError="" onImageFile={() => {}} backUrl="/build/maps" />);

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
    render(<MapCanvas image={null} imageError="" onImageFile={() => {}} backUrl="/build/maps" />);
    expect(screen.queryByRole("button", {name: "Fit"})).not.toBeInTheDocument();
    expect(screen.queryByText("Replace image")).not.toBeInTheDocument();
  });

  it("shows the dropzone and forwards a dropped file", () => {
    const onImageFile = vi.fn();
    render(<MapCanvas image={null} imageError="" onImageFile={onImageFile} />);

    const dropzone = screen.getByText(/Choose a map image/).closest(".map-canvas-dropzone");
    const droppedFile = new File(["x"], "map.png", {type: "image/png"});
    fireEvent.drop(dropzone, {dataTransfer: {files: [droppedFile]}});

    expect(onImageFile).toHaveBeenCalledWith(droppedFile);
  });

  it("shows the image error message even before an image is loaded", () => {
    render(<MapCanvas image={null} imageError="Please choose an image file." onImageFile={() => {}} />);
    expect(screen.getByText("Please choose an image file.")).toBeInTheDocument();
  });

  it("pans by dragging on the canvas", () => {
    render(<MapCanvas image={IMAGE} imageError="" onImageFile={() => {}} />);
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

    render(<MapCanvas image={IMAGE} imageError="" onImageFile={() => {}} />);
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
    render(<MapCanvas image={IMAGE} imageError="" onImageFile={() => {}} />);
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
    render(<MapCanvas image={IMAGE} imageError="" onImageFile={() => {}} />);
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
    render(<MapCanvas image={tallImage} imageError="" onImageFile={() => {}} />);
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
    render(<MapCanvas image={IMAGE} imageError="" onImageFile={() => {}} />);
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
    render(<MapCanvas image={IMAGE} imageError="" onImageFile={() => {}} />);
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

    render(<MapCanvas image={IMAGE} imageError="" onImageFile={() => {}} />);
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
    render(<MapCanvas image={IMAGE} imageError="" onImageFile={() => {}} />);
    const wrapper = document.querySelector(".map-canvas-wrapper");
    const before = transformParts();

    fireEvent.wheel(wrapper, {clientX: 100, clientY: 50, deltaY: -100000});

    expect(transformParts().scale).toBeCloseTo(before.scale * 1.25, 5);
  });

  it("does not scroll the page on wheel (preventDefault called)", () => {
    render(<MapCanvas image={IMAGE} imageError="" onImageFile={() => {}} />);
    const wrapper = document.querySelector(".map-canvas-wrapper");
    const event = new WheelEvent("wheel", {clientX: 0, clientY: 0, deltaY: -100, cancelable: true, bubbles: true});

    wrapper.dispatchEvent(event);

    expect(event.defaultPrevented).toBe(true);
  });
});
