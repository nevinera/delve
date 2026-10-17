import {beforeEach, describe, expect, it, vi} from "vitest";
import {fireEvent, render, screen, waitFor} from "@testing-library/react";

vi.mock("../packSheet", async (original) => ({
  ...(await original()),
  loadFileImage: vi.fn(async () => ({width: 8, height: 8})),
  composeSheet: vi.fn(async () => new Blob(["png"])),
}));
import StampSetBuilder from "../StampSetBuilder";

const file = (name) => new File(["x"], name, {type: "image/png"});
const pick = async (...names) => {
  fireEvent.change(screen.getByLabelText("Pick images"), {target: {files: names.map(file)}});
  await screen.findByLabelText("Key 1");
};

describe("StampSetBuilder", () => {
  let onBuild;
  beforeEach(() => {
    onBuild = vi.fn();
  });

  it("builds a new set, one stamp per file, packed on a sheet", async () => {
    render(<StampSetBuilder sets={{}} sheets={{}} onBuild={onBuild} onCancel={vi.fn()} />);
    fireEvent.change(screen.getByLabelText("Set key"), {target: {value: "rocks"}});
    fireEvent.change(screen.getByLabelText("License"), {target: {value: "CC0-1.0"}});
    await pick("Big Rock.png", "small.png");
    fireEvent.change(screen.getByLabelText("Feet wide 1"), {target: {value: "3"}});
    fireEvent.click(screen.getByRole("button", {name: "Make set"}));

    await waitFor(() => expect(onBuild).toHaveBeenCalled());
    const result = onBuild.mock.calls[0][0];
    expect(result).toMatchObject({setKey: "rocks", license: "CC0-1.0"});
    expect(result.stamps["big-rock"]).toEqual({feetWidth: 3, frames: [{x: 0, y: 0, width: 8, height: 8}]});
    expect(result.stamps.small.frames).toEqual([{x: 10, y: 0, width: 8, height: 8}]);
  });

  it("makes several files variants of one stamp", async () => {
    render(<StampSetBuilder sets={{}} sheets={{}} onBuild={onBuild} onCancel={vi.fn()} />);
    fireEvent.click(screen.getByLabelText("Files are variants of one stamp"));
    fireEvent.change(screen.getByLabelText("Set key"), {target: {value: "rocks"}});
    fireEvent.change(screen.getByLabelText("License"), {target: {value: "MIT"}});
    await pick("a.png", "b.png");
    fireEvent.click(screen.getByRole("button", {name: "Make set"}));

    await waitFor(() => expect(onBuild).toHaveBeenCalled());
    expect(Object.keys(onBuild.mock.calls[0][0].stamps)).toEqual(["a"]);
    expect(onBuild.mock.calls[0][0].stamps.a.frames).toHaveLength(2);
  });

  it("insists on a license, and attribution for BY ones", async () => {
    render(<StampSetBuilder sets={{}} sheets={{}} onBuild={onBuild} onCancel={vi.fn()} />);
    fireEvent.change(screen.getByLabelText("Set key"), {target: {value: "rocks"}});
    await pick("a.png");
    fireEvent.click(screen.getByRole("button", {name: "Make set"}));
    expect(await screen.findByText("Pick a license")).toBeTruthy();

    fireEvent.change(screen.getByLabelText("License"), {target: {value: "CC-BY-4.0"}});
    fireEvent.click(screen.getByRole("button", {name: "Make set"}));
    expect(await screen.findByText("CC-BY-4.0 needs an attribution")).toBeTruthy();
    expect(onBuild).not.toHaveBeenCalled();
  });

  it("adds below an existing sheet, keeping its frames where they are", async () => {
    const sets = {camp: {name: "Camp", stamps: {tent: {feetWidth: 8}}}};
    render(<StampSetBuilder sets={sets} sheets={{camp: {width: 64, height: 32}}} onBuild={onBuild} onCancel={vi.fn()} />);
    fireEvent.change(screen.getByLabelText("Set"), {target: {value: "camp"}});
    await pick("log.png");
    fireEvent.click(screen.getByRole("button", {name: "Add to set"}));

    await waitFor(() => expect(onBuild).toHaveBeenCalled());
    expect(onBuild.mock.calls[0][0].setKey).toBe("camp");
    expect(onBuild.mock.calls[0][0].stamps.log.frames).toEqual([{x: 0, y: 32, width: 8, height: 8}]);
  });
});
