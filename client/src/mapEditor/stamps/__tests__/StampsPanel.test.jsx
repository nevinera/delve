import {describe, expect, it, vi} from "vitest";
import {fireEvent, render, screen} from "@testing-library/react";
import StampsPanel from "../StampsPanel";

const sets = {camp: {name: "Camp", imageUrl: "c.png", stamps: {log: {name: "Log", feetWidth: 8, frames: [{x: 0, y: 0, width: 4, height: 2}, {x: 4, y: 0, width: 4, height: 2}]}}}};
const props = (overrides = {}) => ({
  sets, sheets: {}, stamps: [{stamp: "camp/log", x: 1, y: 2}], armed: null, onArm: vi.fn(), varyRotation: false, onVaryRotation: vi.fn(),
  selected: null, onUpdate: vi.fn(), onRemove: vi.fn(), onMove: vi.fn(), renderSetAdder: null, ...overrides,
});

describe("StampsPanel", () => {
  it("lists each set's stamps to pick from", () => {
    const p = props();
    render(<StampsPanel {...p} />);
    fireEvent.click(screen.getByRole("button", {name: "Log"}));
    expect(p.onArm).toHaveBeenCalledWith("camp/log");
    expect(screen.getByText("1 stamp on this map")).toBeTruthy();
  });

  it("edits the selected stamp, leaving defaults out", () => {
    const p = props({selected: 0, stamps: [{stamp: "camp/log", x: 1, y: 2, scale: 2}]});
    render(<StampsPanel {...p} />);
    fireEvent.change(screen.getByLabelText("Rotation"), {target: {value: "45"}});
    expect(p.onUpdate).toHaveBeenCalledWith(0, {rotation: 45});
    fireEvent.change(screen.getByLabelText("Scale"), {target: {value: "1"}});
    expect(p.onUpdate).toHaveBeenCalledWith(0, {scale: undefined});
    fireEvent.change(screen.getByLabelText("Variant"), {target: {value: "1"}});
    expect(p.onUpdate).toHaveBeenCalledWith(0, {variant: 1});
    fireEvent.click(screen.getByRole("button", {name: "Remove stamp"}));
    expect(p.onRemove).toHaveBeenCalledWith(0);
  });

  it("shows each set's license, and notes when the map uses share-alike art", () => {
    const shared = {wilds: {name: "Wilds", license: "CC-BY-SA-4.0", attribution: "By Someone", imageUrl: "w.png", stamps: {rock: {feetWidth: 3}}}};
    render(<StampsPanel {...props({sets: {...sets, ...shared}, stamps: [{stamp: "wilds/rock", x: 0, y: 0}]})} />);
    expect(screen.getByText("CC-BY-SA-4.0")).toBeTruthy();
    expect(screen.getByText("By Someone")).toBeTruthy();
    expect(screen.getByText(/Uses share-alike art \(Wilds\)/)).toBeTruthy();
  });

  it("says so when the zone has no sets, and offers to add one", () => {
    render(<StampsPanel {...props({sets: {}, stamps: [], renderSetAdder: () => <p>adder</p>})} />);
    expect(screen.getByText("This zone has no stamp sets yet.")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", {name: "Add a stamp set…"}));
    expect(screen.getByText("adder")).toBeTruthy();
  });
});
