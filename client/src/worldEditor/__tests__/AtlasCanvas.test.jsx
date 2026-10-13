import {describe, it, expect, vi} from "vitest";
import {render, screen, fireEvent} from "@testing-library/react";
import AtlasCanvas from "../AtlasCanvas";
import {atlasLinks} from "../atlasLayout";

const line = (identifier, x1, y1, x2, y2) => ({identifier, type: "line", start: {x: x1, y: y1}, end: {x: x2, y: y2}});
const input = {zones: {forest: {
  maps: [
    {identifier: "camp", feetDimensions: {width: 100, height: 100}, connections: [line("north", 40, 100, 60, 100)]},
    {identifier: "road", feetDimensions: {width: 100, height: 50}, connections: [line("south", 20, 0, 40, 0)]},
  ],
  zoneLinks: [{connectionA: {map: "camp", connection: "north"}, connectionB: {map: "road", connection: "south"}}],
}}};
const sizes = {forest: {camp: {width: 100, height: 100}, road: {width: 100, height: 50}}};
const atlas = {zones: {forest: {
  outline: [{x: -60, y: -60}, {x: 220, y: -60}, {x: 220, y: 270}, {x: -60, y: 270}],
  maps: {camp: {x: 0, y: 0}, road: {x: 20, y: 160}},
}}};
const key = "forest/camp/north|forest/road/south";

function renderCanvas(start = atlas) {
  const onChange = vi.fn();
  render(<AtlasCanvas atlas={start} sizes={sizes} zoneNames={{forest: "Forest"}} mapNames={{forest: {camp: "Camp", road: "Road"}}}
    thumbnails={{}} linksFor={(a) => atlasLinks(a, input)} onChange={onChange} />);
  return onChange;
}

// jsdom has no layout: zoom 0.2, so 20 pixels is 100 feet.
function drag(element, dx, dy) {
  fireEvent.pointerDown(element, {clientX: 0, clientY: 0, pointerId: 1});
  fireEvent.pointerMove(element, {clientX: dx, clientY: dy, pointerId: 1});
  fireEvent.pointerUp(element, {clientX: dx, clientY: dy, pointerId: 1});
}

describe("AtlasCanvas", () => {
  it("draws an unbent link straight", () => {
    renderCanvas();
    expect(document.querySelector(".atlas-link").getAttribute("d")).toBe("M 50 100 L 50 160");
  });

  it("draws a link over its own maps, masked out of any other", () => {
    const withShed = {zones: {forest: {...atlas.zones.forest, maps: {...atlas.zones.forest.maps, shed: {x: 120, y: 0}}}}};
    render(<AtlasCanvas atlas={withShed} sizes={{forest: {...sizes.forest, shed: {width: 40, height: 40}}}} zoneNames={{}} mapNames={{}}
      thumbnails={{}} linksFor={(a) => atlasLinks(a, input)} onChange={vi.fn()} />);
    const path = document.querySelector(".atlas-link");
    const svg = path.closest("svg");
    expect([...svg.children[0].children].indexOf(path)).toBeGreaterThan([...svg.children[0].children].indexOf(screen.getByLabelText("Map road")));
    const mask = document.querySelector(path.getAttribute("mask").match(/#[^)]+/)[0]);
    expect([...mask.querySelectorAll('rect[fill="black"]')].map((r) => r.getAttribute("x"))).toEqual(["120"]);
  });

  it("bends a link by dragging its dot", () => {
    const onChange = renderCanvas();
    drag(screen.getByLabelText(`Bend ${key}`), 20, 0);
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({bends: {[key]: {x: 100, y: 0}}}));
  });

  it("curves a bent link through its dot", () => {
    renderCanvas({...atlas, bends: {[key]: {x: 100, y: 0}}});
    expect(document.querySelector(".atlas-link").getAttribute("d")).toBe("M 50 100 Q 250 130 50 160");
  });

  it("straightens a link on double-click", () => {
    const onChange = renderCanvas({...atlas, bends: {[key]: {x: 100, y: 0}}});
    fireEvent.doubleClick(screen.getByLabelText(`Bend ${key}`));
    expect(onChange).toHaveBeenCalledWith(atlas);
  });

  it("splits an outline's edge by dragging its middle", () => {
    const onChange = renderCanvas();
    drag(screen.getByLabelText("Edge 2 of forest"), 20, 0); // the east edge, 100 ft further east
    const outline = onChange.mock.calls[0][0].zones.forest.outline;
    expect(outline).toHaveLength(5);
    expect(outline[2]).toEqual({x: 320, y: 105});
  });

  it("doesn't split an edge on a plain click", () => {
    const onChange = renderCanvas();
    const edge = screen.getByLabelText("Edge 2 of forest");
    fireEvent.pointerDown(edge, {clientX: 0, clientY: 0, pointerId: 1});
    fireEvent.pointerUp(edge, {clientX: 0, clientY: 0, pointerId: 1});
    expect(onChange).not.toHaveBeenCalled();
  });

  it("removes a vertex on double-click, when the outline can do without it", () => {
    const five = {zones: {forest: {...atlas.zones.forest, outline: [...atlas.zones.forest.outline.slice(0, 2), {x: 320, y: 105}, ...atlas.zones.forest.outline.slice(2)]}}};
    const onChange = renderCanvas(five);
    fireEvent.doubleClick(screen.getByLabelText("Corner 3 of forest"));
    expect(onChange).toHaveBeenCalledWith(atlas);
    fireEvent.doubleClick(screen.getByLabelText("Corner 1 of forest")); // would leave a triangle cutting the maps
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it("removes a vertex dropped on a neighbor, when the outline can do without it", () => {
    const five = {zones: {forest: {...atlas.zones.forest, outline: [...atlas.zones.forest.outline.slice(0, 2), {x: 320, y: 105}, ...atlas.zones.forest.outline.slice(2)]}}};
    const onChange = renderCanvas(five);
    // Corner 3 (320, 105) onto corner 2 (220, -60): 100 ft west, 165 ft south.
    drag(screen.getByLabelText("Corner 3 of forest"), -20, 33);
    expect(onChange).toHaveBeenCalledWith(atlas);
  });

  it("doesn't remove a vertex the maps need, dropped on a neighbor", () => {
    const onChange = renderCanvas();
    // Corner 1 (-60, -60) onto corner 2 (220, -60) would leave a triangle cutting the maps.
    drag(screen.getByLabelText("Corner 1 of forest"), 56, 0);
    const outline = onChange.mock.calls[0]?.[0].zones.forest.outline ?? atlas.zones.forest.outline;
    expect(outline).toHaveLength(4);
  });

  it("moves a link with the map it's on, mid-drag", () => {
    renderCanvas();
    const camp = screen.getByLabelText("Map camp");
    fireEvent.pointerDown(camp, {clientX: 0, clientY: 0, pointerId: 1});
    fireEvent.pointerMove(camp, {clientX: -6, clientY: 0, pointerId: 1}); // 30 ft west
    expect(document.querySelector(".atlas-link").getAttribute("d")).toBe("M 20 100 L 50 160");
  });
});

describe("AtlasCanvas, not editable", () => {
  function renderLocked() {
    const onChange = vi.fn();
    render(<AtlasCanvas atlas={atlas} sizes={sizes} zoneNames={{forest: "Forest"}} mapNames={{forest: {camp: "Camp", road: "Road"}}}
      thumbnails={{}} linksFor={(a) => atlasLinks(a, input)} onChange={onChange} editable={false} />);
    return onChange;
  }

  it("has no handles, still drawing the links", () => {
    renderLocked();
    expect(screen.queryByLabelText(`Bend ${key}`)).toBeNull();
    expect(screen.queryByLabelText("Corner 1 of forest")).toBeNull();
    expect(screen.queryByLabelText("Edge 1 of forest")).toBeNull();
    expect(document.querySelectorAll(".atlas-link")).toHaveLength(1);
  });

  it("pans instead of moving maps or zones, and still names a tapped map", () => {
    const onChange = renderLocked();
    drag(screen.getByLabelText("Map camp"), 20, 0);
    drag(screen.getByLabelText("Zone forest"), 20, 0);
    expect(onChange).not.toHaveBeenCalled();
    const camp = screen.getByLabelText("Map camp");
    fireEvent.pointerDown(camp, {clientX: 5, clientY: 5, pointerId: 1});
    fireEvent.pointerUp(camp, {clientX: 5, clientY: 5, pointerId: 1});
    expect(document.querySelector(".atlas-label").textContent).toBe("Camp");
  });
});

describe("AtlasCanvas, fog and stubs", () => {
  it("grays out fogged rects but for their clear polygons, and draws stubs pointing their way", () => {
    const fog = [{key: "forest/camp", x: 0, y: 0, width: 100, height: 100, clear: [[{x: 0, y: 0}, {x: 50, y: 0}, {x: 50, y: 50}]]}];
    const stubs = [{key: "s", at: {x: 10, y: 10}, angle: 90}];
    render(<AtlasCanvas atlas={atlas} sizes={sizes} zoneNames={{}} mapNames={{}} thumbnails={{}} linksFor={() => []} onChange={() => {}} editable={false} fog={fog} stubs={stubs} />);
    const rect = document.querySelector(".atlas-fog");
    expect(rect.getAttribute("mask")).toBe("url(#atlas-fog-mask-0)");
    expect(document.querySelector("#atlas-fog-mask-0 polygon").getAttribute("points")).toBe("0,0 50,0 50,50");
    expect(screen.getByLabelText("Unexplored way").getAttribute("transform")).toContain("rotate(90)");
  });
});
