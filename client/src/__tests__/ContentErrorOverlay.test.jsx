import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { ContentErrorOverlay } from "../App";

describe("ContentErrorOverlay", () => {
  it("blocks the game with the reason and what to do", () => {
    render(<ContentErrorOverlay message="This zone's file has changed since it was checked." />);
    expect(screen.getByRole("alert")).toHaveTextContent("This zone's file has changed since it was checked.");
    expect(screen.getByRole("alert")).toHaveTextContent("Reload the page");
  });
});
