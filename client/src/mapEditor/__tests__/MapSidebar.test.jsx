import {describe, it, expect} from "vitest";
import {render, screen, fireEvent} from "@testing-library/react";
import MapSidebar from "../MapSidebar";

describe("MapSidebar", () => {
  it("shows its content by default", () => {
    render(<MapSidebar><p>Panel content</p></MapSidebar>);
    expect(screen.getByText("Panel content")).toBeInTheDocument();
    expect(document.querySelector(".map-editor-sidebar")).not.toHaveClass("collapsed");
  });

  it("hides its content and adds the collapsed class when toggled, and restores on toggle again", () => {
    render(<MapSidebar><p>Panel content</p></MapSidebar>);

    fireEvent.click(screen.getByRole("button", {name: "Collapse panel"}));
    expect(screen.queryByText("Panel content")).not.toBeInTheDocument();
    expect(document.querySelector(".map-editor-sidebar")).toHaveClass("collapsed");

    fireEvent.click(screen.getByRole("button", {name: "Expand panel"}));
    expect(screen.getByText("Panel content")).toBeInTheDocument();
    expect(document.querySelector(".map-editor-sidebar")).not.toHaveClass("collapsed");
  });
});
