import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import ZoneExitPrompt from "../ZoneExitPrompt";

describe("ZoneExitPrompt", () => {
  it("renders nothing while closed", () => {
    const { container } = render(<ZoneExitPrompt open={false} onStay={() => {}} onLeave={() => {}} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("offers to stay or leave", () => {
    const onStay = vi.fn();
    const onLeave = vi.fn();
    render(<ZoneExitPrompt open onStay={onStay} onLeave={onLeave} />);

    fireEvent.click(screen.getByText("Stay"));
    fireEvent.click(screen.getByText("Leave"));

    expect(onStay).toHaveBeenCalled();
    expect(onLeave).toHaveBeenCalled();
  });
});
