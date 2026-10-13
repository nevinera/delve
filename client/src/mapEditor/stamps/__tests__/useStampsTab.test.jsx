import {describe, expect, it} from "vitest";
import {act, renderHook} from "@testing-library/react";
import {useState} from "react";
import {useStampsTab} from "../useStampsTab";
import {MapDraft} from "../../MapDraft";

const sets = {camp: {imageUrl: "c.png", stamps: {log: {feetWidth: 8, frames: [{x: 0, y: 0, width: 40, height: 20}]}}}};
const sheets = {camp: {naturalWidth: 40, naturalHeight: 20}};

// Canvas pixels are half-feet: 200x100 pixels over 100x50 feet.
function setup(stamps = []) {
  return renderHook(() => {
    const [data, setData] = useState({stamps});
    const tab = useStampsTab({
      active: true, stamps: data.stamps, stampLayer: {sets, sheets},
      onMapChange: (fn) => setData((d) => fn(new MapDraft(d)).data),
      pixelDimensions: {width: 200, height: 100}, feetDimensions: {width: 100, height: 50},
    });
    return {...tab, data};
  });
}
const px = (x, y) => ({x: x * 2, y: y * 2});
const pointer = (result, phase, at, event = {}) => act(() => result.current.editing.onPointer(phase, at, event));

describe("useStampsTab", () => {
  it("places the armed stamp where the map is clicked", () => {
    const {result} = setup();
    act(() => result.current.panel.props.onArm("camp/log"));
    pointer(result, "down", px(10, 20));
    expect(result.current.data.stamps).toEqual([{stamp: "camp/log", x: 10, y: 20}]);
    expect(result.current.panel.props.selected).toBe(0);
  });

  it("selects and drags a stamp, and lets a click on empty ground pan", () => {
    const {result} = setup([{stamp: "camp/log", x: 10, y: 10}]);
    pointer(result, "down", px(12, 11));
    pointer(result, "drag", px(22, 21));
    pointer(result, "up", null);
    expect(result.current.data.stamps[0]).toEqual({stamp: "camp/log", x: 20, y: 20});
    let handled;
    act(() => {
      handled = result.current.editing.onPointer("down", px(80, 40), {});
    });
    expect(handled).toBe(false);
    expect(result.current.panel.props.selected).toBeNull();
  });

  it("turns a stamp with its rotate handle, snapping with Shift", () => {
    const {result} = setup([{stamp: "camp/log", x: 10, y: 10}]);
    pointer(result, "down", px(10, 10));
    pointer(result, "up", null);
    // Overlay renders at zoom 1: the handle is 22 pixels (11 feet) past the top edge.
    act(() => result.current.editing.overlay({zoom: 1}));
    pointer(result, "down", px(10, 10 - 2 - 11));
    pointer(result, "drag", px(30, 9), {shiftKey: true});
    expect(result.current.data.stamps[0].rotation).toBe(90);
  });

  it("removes the selected stamp with Delete and turns it with ]", () => {
    const {result} = setup([{stamp: "camp/log", x: 10, y: 10}, {stamp: "camp/log", x: 40, y: 40}]);
    pointer(result, "down", px(40, 40));
    act(() => window.dispatchEvent(new KeyboardEvent("keydown", {key: "]"})));
    expect(result.current.data.stamps[1].rotation).toBe(15);
    act(() => window.dispatchEvent(new KeyboardEvent("keydown", {key: "Delete"})));
    expect(result.current.data.stamps).toEqual([{stamp: "camp/log", x: 10, y: 10}]);
  });
});
