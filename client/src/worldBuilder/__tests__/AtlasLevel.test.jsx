import {describe, it, expect, vi, afterEach} from "vitest";
import {useState} from "react";
import {render, screen, fireEvent} from "@testing-library/react";
import AtlasLevel from "../levels/AtlasLevel";
import {fixtureDraft} from "../state/__tests__/fixtureWorld";
import {atlasData, resetAtlas, setAtlas} from "../state/atlasOps";

afterEach(() => vi.restoreAllMocks());

function renderLevel(start = fixtureDraft()) {
  const result = {draft: null};
  const navigate = vi.fn();
  function Harness() {
    const [current, setCurrent] = useState(start);
    result.draft = current;
    return <AtlasLevel draft={current} onChange={setCurrent} navigate={navigate} repo={null} />;
  }
  render(<Harness />);
  return {result, navigate};
}

// jsdom has no layout, so the canvas fits to an empty box: zoom 0.2, the
// origin at the wrapper's top-left. 20 pixels is 100 feet.
function drag(element, dx, dy) {
  fireEvent.pointerDown(element, {clientX: 0, clientY: 0, pointerId: 1});
  fireEvent.pointerMove(element, {clientX: dx, clientY: dy, pointerId: 1});
  fireEvent.pointerUp(element, {clientX: dx, clientY: dy, pointerId: 1});
}

describe("AtlasLevel", () => {
  it("guesses an atlas when there's none, listing what isn't laid out", () => {
    const {result} = renderLevel();
    expect(screen.getByText("Forest (the whole zone)")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", {name: "Guess atlas"}));
    expect(atlasData(result.draft).zones.forest.maps).toEqual({hub: {x: 0, y: 0}});
    expect(screen.queryByText("Not laid out")).toBeNull();
    expect(screen.getByLabelText("Map hub")).toBeInTheDocument();
    expect(screen.getByRole("button", {name: "Reset atlas"})).toBeInTheDocument();
  });

  it("asks before replacing an atlas", () => {
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    const {result} = renderLevel(setAtlas(fixtureDraft(), {zones: {}}));
    fireEvent.click(screen.getByRole("button", {name: "Reset atlas"}));
    expect(confirm).toHaveBeenCalled();
    expect(atlasData(result.draft)).toEqual({zones: {}});
  });

  it("drags a corner outward, north up", () => {
    const {result} = renderLevel(resetAtlas(fixtureDraft()));
    drag(screen.getByLabelText("Corner 4 of forest"), -20, -20);
    expect(atlasData(result.draft).zones.forest.outline[3]).toEqual({x: -100, y: 200});
  });

  it("stops a corner at another zone", () => {
    // The empty cave zone is a 1 ft square just east of the forest.
    const {result} = renderLevel(resetAtlas(fixtureDraft()));
    drag(screen.getByLabelText("Corner 3 of forest"), 20, -20);
    expect(atlasData(result.draft).zones.forest.outline[2].x).toBeLessThanOrEqual(100);
  });

  it("won't drag a corner into a map", () => {
    const {result} = renderLevel(resetAtlas(fixtureDraft()));
    const before = atlasData(result.draft).zones.forest.outline[2];
    drag(screen.getByLabelText("Corner 3 of forest"), -10, 10);
    expect(atlasData(result.draft).zones.forest.outline[2]).toEqual(before);
  });

  it("drags a zone with its maps", () => {
    const {result} = renderLevel(resetAtlas(fixtureDraft()));
    drag(screen.getByLabelText("Zone forest"), -20, 0);
    const forest = atlasData(result.draft).zones.forest;
    expect(forest.outline[0]).toEqual({x: -100, y: 0});
    expect(forest.maps.hub).toEqual({x: -100, y: 0});
  });

  it("opens a map on double-click", () => {
    const {navigate} = renderLevel(resetAtlas(fixtureDraft()));
    fireEvent.doubleClick(screen.getByLabelText("Map hub"));
    expect(navigate).toHaveBeenCalledWith({zone: "forest", map: "hub"});
  });

  it("names a map when it's tapped", () => {
    renderLevel(resetAtlas(fixtureDraft()));
    const map = screen.getByLabelText("Map hub");
    fireEvent.pointerDown(map, {clientX: 5, clientY: 5, pointerId: 1});
    fireEvent.pointerUp(map, {clientX: 5, clientY: 5, pointerId: 1});
    expect(document.querySelector(".atlas-label").textContent).toBe("Hub");
  });

  it("lists what the server would refuse", () => {
    const atlas = {zones: {forest: {outline: [{x: 0, y: 0}, {x: 50, y: 0}, {x: 50, y: 50}, {x: 0, y: 50}], maps: {hub: {x: 0, y: 0}}}}};
    renderLevel(setAtlas(fixtureDraft(), atlas));
    expect(screen.getByText('map "forest/hub" isn\'t inside its zone\'s outline')).toBeInTheDocument();
  });
});
