import {describe, it, expect, vi} from "vitest";
import {render, screen, fireEvent} from "@testing-library/react";
import {AtlasWindow, canvasProps} from "../AtlasWindow";

const payload = {
  zones: {forest: {name: "The Forest", outline: [{x: 0, y: 0}, {x: 300, y: 0}, {x: 300, y: 200}, {x: 0, y: 200}]}},
  maps: [
    {zone: "forest", map: "camp", name: "Camp", x: 60, y: 60, width: 100, height: 100, thumbnail_url: "https://example.test/camp.png"},
    {zone: "nowhere", map: "lost", name: "Lost", x: 0, y: 0, width: 10, height: 10, thumbnail_url: null},
  ],
  links: [{kind: "zone", key: "a|b", from: {x: 100, y: 160}, to: {x: 200, y: 160}, through: null, ends: [{zone: "forest", map: "camp"}, {zone: "forest", map: "camp"}]}],
};

describe("canvasProps", () => {
  it("turns the published atlas into what the canvas takes", () => {
    const props = canvasProps(payload);
    expect(props.atlas).toEqual({zones: {forest: {outline: payload.zones.forest.outline, maps: {camp: {x: 60, y: 60}}}}});
    expect(props.sizes).toEqual({forest: {camp: {width: 100, height: 100}}});
    expect(props.zoneNames).toEqual({forest: "The Forest"});
    expect(props.mapNames).toEqual({forest: {camp: "Camp"}});
    expect(props.thumbnails).toEqual({forest: {camp: "https://example.test/camp.png"}});
    expect(props.links).toEqual(payload.links);
  });

  it("is empty without an atlas", () => {
    expect(canvasProps(null).atlas).toEqual({zones: {}});
  });
});

describe("AtlasWindow", () => {
  it("renders nothing while closed", () => {
    const {container} = render(<AtlasWindow open={false} atlas={payload} zone="forest" />);
    expect(container).toBeEmptyDOMElement();
  });

  it("shows the atlas read-only, with the player's arrow on their map", () => {
    const {container} = render(<AtlasWindow open atlas={payload} zone="forest" map="camp" position={{x: 10, y: 20, angle: 90}} />);
    expect(screen.getByLabelText("Map camp")).toBeInTheDocument();
    expect(container.querySelectorAll(".atlas-link")).toHaveLength(1);
    expect(container.querySelector(".atlas-corner")).toBeNull();
    expect(screen.getByLabelText("You are here").getAttribute("transform")).toContain("rotate(90)");
  });

  it("opens fitted to the player's map", () => {
    const rect = vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue({left: 0, top: 0, width: 400, height: 400});
    const {container} = render(<AtlasWindow open atlas={payload} zone="forest" map="camp" />);
    rect.mockRestore();
    // camp (60..160 both ways) fills 90% of the 400px square, centered.
    expect(container.querySelector("svg g").getAttribute("transform")).toBe("translate(-196 596) scale(3.6 -3.6)");
  });

  it("has no arrow off the atlas", () => {
    render(<AtlasWindow open atlas={payload} zone="forest" map="elsewhere" position={{x: 10, y: 20, angle: 0}} />);
    expect(screen.queryByLabelText("You are here")).toBeNull();
  });

  it("says when there's nothing laid out", () => {
    render(<AtlasWindow open atlas={null} zone="forest" />);
    expect(screen.getByText("This world has no map yet.")).toBeInTheDocument();
  });

  it("closes", () => {
    const onClose = vi.fn();
    render(<AtlasWindow open atlas={payload} zone="forest" onClose={onClose} />);
    fireEvent.click(screen.getByLabelText("Close map"));
    expect(onClose).toHaveBeenCalled();
  });
});
