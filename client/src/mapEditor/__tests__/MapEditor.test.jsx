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
});
