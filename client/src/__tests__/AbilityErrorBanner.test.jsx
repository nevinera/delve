import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { render, screen, act } from "@testing-library/react";
import { AbilityErrorBanner } from "../App";

describe("AbilityErrorBanner", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("shows the message immediately, fully opaque", () => {
    render(<AbilityErrorBanner message="Not enough Energy" onDone={() => {}} />);
    expect(screen.getByText("Not enough Energy")).toBeInTheDocument();
    expect(screen.getByTestId("ability-error-banner")).toHaveStyle({ opacity: 1 });
  });

  it("fades (opacity drops to 0) after the hold period", () => {
    render(<AbilityErrorBanner message="Not enough Mana" onDone={() => {}} />);
    act(() => vi.advanceTimersByTime(2200));
    expect(screen.getByTestId("ability-error-banner")).toHaveStyle({ opacity: 0 });
  });

  it("does not fade before the hold period elapses", () => {
    render(<AbilityErrorBanner message="Not enough Mana" onDone={() => {}} />);
    act(() => vi.advanceTimersByTime(1000));
    expect(screen.getByTestId("ability-error-banner")).toHaveStyle({ opacity: 1 });
  });

  it("calls onDone once the hold+fade duration has fully elapsed", () => {
    const onDone = vi.fn();
    render(<AbilityErrorBanner message="Not enough Energy" onDone={onDone} />);
    act(() => vi.advanceTimersByTime(2200));
    expect(onDone).not.toHaveBeenCalled();
    act(() => vi.advanceTimersByTime(800));
    expect(onDone).toHaveBeenCalledTimes(1);
  });
});
