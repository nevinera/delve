import {describe, it, expect, vi} from "vitest";
import {render, screen, fireEvent} from "@testing-library/react";
import MapFieldsPanel from "../MapFieldsPanel";

const MAP_DATA = {
  identifier: "gc1-entrance", name: "Gc1 Entrance", elvl: 200,
  feetDimensions: {width: 60, height: 45},
};

describe("MapFieldsPanel", () => {
  it("dispatches SET_FIELD for identifier/name/elvl edits", () => {
    const dispatch = vi.fn();
    render(<MapFieldsPanel mapData={MAP_DATA} pixelDimensions={null} dispatch={dispatch} />);

    fireEvent.change(screen.getByDisplayValue("Gc1 Entrance"), {target: {value: "Cave Mouth"}});
    expect(dispatch).toHaveBeenCalledWith({type: "SET_FIELD", field: "name", value: "Cave Mouth"});

    fireEvent.change(screen.getByDisplayValue("200"), {target: {value: "250"}});
    expect(dispatch).toHaveBeenCalledWith({type: "SET_FIELD", field: "elvl", value: 250});
  });

  it("shows pixelDimensions read-only, with a placeholder when there's no image yet", () => {
    render(<MapFieldsPanel mapData={MAP_DATA} pixelDimensions={null} dispatch={() => {}} />);
    expect(screen.getByText("(choose an image first)")).toBeInTheDocument();
    expect(document.querySelectorAll('input[type="number"]').length).toBe(3); // elvl + feet width/height, not pixel dims

    render(<MapFieldsPanel mapData={MAP_DATA} pixelDimensions={{width: 2048, height: 1536}} dispatch={() => {}} />);
    expect(screen.getByText("2048 × 1536")).toBeInTheDocument();
  });

  it("edits feetDimensions width/height independently, merging into the existing object", () => {
    const dispatch = vi.fn();
    render(<MapFieldsPanel mapData={MAP_DATA} pixelDimensions={null} dispatch={dispatch} />);

    fireEvent.change(screen.getByDisplayValue("60"), {target: {value: "80"}});
    expect(dispatch).toHaveBeenCalledWith({type: "SET_FIELD", field: "feetDimensions", value: {width: 80, height: 45}});

    fireEvent.change(screen.getByDisplayValue("45"), {target: {value: "50"}});
    expect(dispatch).toHaveBeenCalledWith({type: "SET_FIELD", field: "feetDimensions", value: {width: 60, height: 50}});
  });

  it("starts feetDimensions from an empty object when the map has none yet", () => {
    const dispatch = vi.fn();
    render(<MapFieldsPanel mapData={{...MAP_DATA, feetDimensions: null}} pixelDimensions={null} dispatch={dispatch} />);

    const [widthInput] = document.querySelectorAll(".map-fields-dimension-pair input");
    fireEvent.change(widthInput, {target: {value: "60"}});

    expect(dispatch).toHaveBeenCalledWith({type: "SET_FIELD", field: "feetDimensions", value: {width: 60}});
  });
});
