import {describe, it, expect} from "vitest";
import {render, screen, fireEvent} from "@testing-library/react";
import ItemPreviewPane from "../ItemPreviewPane";

describe("ItemPreviewPane", () => {
  it("shows relative elevation as +0 when previewing at the item's own elevation", () => {
    render(<ItemPreviewPane itemData={{name: "Sword of Doom", slot: "main_hand", elvl: 100}} />);
    expect(screen.getByText("Relative Elevation: +0")).toBeInTheDocument();
  });

  it("updates relative elevation as the preview elevation control changes", () => {
    render(<ItemPreviewPane itemData={{name: "Sword of Doom", slot: "main_hand", elvl: 100}} />);

    fireEvent.change(screen.getByLabelText("Preview at elevation"), {target: {value: "90"}});
    expect(screen.getByText("Relative Elevation: +10")).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Preview at elevation"), {target: {value: "110"}});
    expect(screen.getByText("Relative Elevation: -10")).toBeInTheDocument();
  });
});
