import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import GearRestrictionPrompt from "../GearRestrictionPrompt";

describe("GearRestrictionPrompt", () => {
  it("renders nothing when no gear is disallowed", () => {
    const { container } = render(<GearRestrictionPrompt items={[]} onSwitch={() => {}} onDismiss={() => {}} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("lists the disallowed items and offers to switch or dismiss", () => {
    const onSwitch = vi.fn();
    const onDismiss = vi.fn();
    render(<GearRestrictionPrompt items={[{ id: 1, name: "Foreign Helm" }]} onSwitch={onSwitch} onDismiss={onDismiss} />);

    expect(screen.getByText("Foreign Helm")).toBeInTheDocument();
    fireEvent.click(screen.getByText("Switch"));
    fireEvent.click(screen.getByText("Not now"));
    expect(onSwitch).toHaveBeenCalled();
    expect(onDismiss).toHaveBeenCalled();
  });

  it("shows an error", () => {
    render(<GearRestrictionPrompt items={[{ id: 1, name: "X" }]} error="Failed to switch gear." onSwitch={() => {}} onDismiss={() => {}} />);
    expect(screen.getByText("Failed to switch gear.")).toBeInTheDocument();
  });
});
