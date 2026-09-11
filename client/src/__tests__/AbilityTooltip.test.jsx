import {describe, expect, it, vi, afterEach} from "vitest";
import {render, screen, fireEvent, cleanup, act} from "@testing-library/react";
import {AbilityTooltip} from "../AbilityTooltip";

const FIREBOLT = {name: "Firebolt", description: "Hurls a bolt of fire."};

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("AbilityTooltip", () => {
  it("renders only the children's text when no ability is given", () => {
    render(
      <AbilityTooltip ability={null}>
        <button>slot</button>
      </AbilityTooltip>
    );
    expect(screen.getByText("slot")).toBeInTheDocument();
    expect(document.body.textContent).toBe("slot");
  });

  // Regression: an ability-less slot used to skip the wrapping span
  // entirely, so a caller sizing the wrapper via flex (e.g. the portrait
  // action grid) got wildly different sizes for filled vs. empty slots.
  it("still wraps children in the same span when no ability is given", () => {
    render(
      <AbilityTooltip ability={null} style={{flex: 1}}>
        <button>slot</button>
      </AbilityTooltip>
    );
    const wrapper = screen.getByText("slot").closest("span");
    expect(wrapper).toBeInTheDocument();
    expect(wrapper).toHaveStyle({ flex: "1" });
  });

  it("hovering an ability-less slot does not show a tooltip or throw", () => {
    vi.useFakeTimers();
    render(
      <AbilityTooltip ability={null}>
        <button>slot</button>
      </AbilityTooltip>
    );
    const target = screen.getByText("slot");
    expect(() => {
      fireEvent.mouseEnter(target, {clientX: 10, clientY: 10});
      act(() => vi.advanceTimersByTime(500));
    }).not.toThrow();
    expect(document.body.textContent).toBe("slot");
  });

  it("does not show the tooltip immediately on hover", () => {
    vi.useFakeTimers();
    render(
      <AbilityTooltip ability={FIREBOLT}>
        <button>slot</button>
      </AbilityTooltip>
    );
    fireEvent.mouseEnter(screen.getByText("slot"), {clientX: 10, clientY: 10});
    expect(screen.queryByText("Firebolt")).not.toBeInTheDocument();
  });

  it("shows the ability name and description after the hover delay", () => {
    vi.useFakeTimers();
    render(
      <AbilityTooltip ability={FIREBOLT}>
        <button>slot</button>
      </AbilityTooltip>
    );
    fireEvent.mouseEnter(screen.getByText("slot"), {clientX: 10, clientY: 10});
    act(() => vi.advanceTimersByTime(500));
    expect(screen.getByText("Firebolt")).toBeInTheDocument();
    expect(screen.getByText("Hurls a bolt of fire.")).toBeInTheDocument();
  });

  it("hides again on mouse leave, even before the delay elapses", () => {
    vi.useFakeTimers();
    render(
      <AbilityTooltip ability={FIREBOLT}>
        <button>slot</button>
      </AbilityTooltip>
    );
    const target = screen.getByText("slot");
    fireEvent.mouseEnter(target, {clientX: 10, clientY: 10});
    fireEvent.mouseLeave(target);
    act(() => vi.advanceTimersByTime(500));
    expect(screen.queryByText("Firebolt")).not.toBeInTheDocument();
  });

  it("omits the description line when the ability has none", () => {
    vi.useFakeTimers();
    render(
      <AbilityTooltip ability={{name: "Punch"}}>
        <button>slot</button>
      </AbilityTooltip>
    );
    fireEvent.mouseEnter(screen.getByText("slot"), {clientX: 10, clientY: 10});
    act(() => vi.advanceTimersByTime(500));
    expect(screen.getByText("Punch")).toBeInTheDocument();
  });

  it("shows the given hint alongside the tooltip", () => {
    vi.useFakeTimers();
    render(
      <AbilityTooltip ability={FIREBOLT} hint="Use Ability (space)">
        <button>slot</button>
      </AbilityTooltip>
    );
    fireEvent.mouseEnter(screen.getByText("slot"), {clientX: 10, clientY: 10});
    act(() => vi.advanceTimersByTime(500));
    expect(screen.getByText("Use Ability (space)")).toBeInTheDocument();
  });
});
