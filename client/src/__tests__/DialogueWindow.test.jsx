import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { DialogueWindow } from "../DialogueWindow";

describe("DialogueWindow", () => {
  it("renders nothing without lines", () => {
    render(<DialogueWindow name="Scout" lines={[]} onClose={() => {}} />);
    expect(document.body.textContent).toBe("");
  });

  it("steps through lines, then closes from the last one", () => {
    const onClose = vi.fn();
    render(<DialogueWindow name="Scout" lines={["First.", "Second."]} onClose={onClose} />);
    expect(screen.getByText("First.")).toBeInTheDocument();

    fireEvent.click(screen.getByText("Next"));
    expect(screen.getByText("Second.")).toBeInTheDocument();

    fireEvent.click(screen.getByText("Goodbye"));
    expect(onClose).toHaveBeenCalled();
  });

  it("closes from the X at any point", () => {
    const onClose = vi.fn();
    render(<DialogueWindow name="Scout" lines={["First.", "Second."]} onClose={onClose} />);
    fireEvent.click(screen.getByLabelText("Close"));
    expect(onClose).toHaveBeenCalled();
  });
});
