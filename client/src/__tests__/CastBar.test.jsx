import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { CastBar } from "../App";

describe("CastBar", () => {
  it("renders nothing when the unit isn't casting", () => {
    render(<CastBar unit={{}} />);
    expect(document.body.textContent).toBe("");
  });

  it("renders nothing when unit is null", () => {
    render(<CastBar unit={null} />);
    expect(document.body.textContent).toBe("");
  });

  it("shows the power's name while casting", () => {
    const now = Date.now();
    render(<CastBar unit={{ casting_power: "Fireball", cast_started_at: now, cast_ends_at: now + 2000 }} />);
    expect(screen.getByText("Fireball")).toBeInTheDocument();
  });

  it('anchors to the top by default', () => {
    const now = Date.now();
    render(<CastBar unit={{ casting_power: "Fireball", cast_started_at: now, cast_ends_at: now + 2000 }} />);
    const container = screen.getByText("Fireball").closest("[style*='position: absolute']");
    expect(container).toHaveStyle({ top: "8px" });
    expect(container.style.bottom).toBe("");
  });

  it("anchors to the bottom when position is 'bottom'", () => {
    const now = Date.now();
    render(<CastBar unit={{ casting_power: "Fireball", cast_started_at: now, cast_ends_at: now + 2000 }} position="bottom" />);
    const container = screen.getByText("Fireball").closest("[style*='position: absolute']");
    expect(container).toHaveStyle({ bottom: "90px" });
    expect(container.style.top).toBe("");
  });

  it("renders a fill bar with a testid for layout tests to target", () => {
    const now = Date.now();
    render(<CastBar unit={{ casting_power: "Fireball", cast_started_at: now, cast_ends_at: now + 2000 }} />);
    expect(screen.getByTestId("cast-bar")).toBeInTheDocument();
  });

  it("does not render when only casting_power is present (partial/stale data)", () => {
    render(<CastBar unit={{ casting_power: "Fireball" }} />);
    expect(document.body.textContent).toBe("");
  });

  describe("inline mode (embedded in a unit frame)", () => {
    it("does not position itself absolutely", () => {
      const now = Date.now();
      render(<CastBar unit={{ casting_power: "Fireball", cast_started_at: now, cast_ends_at: now + 2000 }} inline />);
      expect(screen.getByTestId("cast-bar").style.position).toBe("");
    });

    it("still shows the power's name", () => {
      const now = Date.now();
      render(<CastBar unit={{ casting_power: "Fireball", cast_started_at: now, cast_ends_at: now + 2000 }} inline />);
      expect(screen.getByText("Fireball")).toBeInTheDocument();
    });

    it("stays mounted (reserving its layout space) when the unit isn't casting", () => {
      render(<CastBar unit={{}} inline />);
      expect(screen.getByTestId("cast-bar")).toBeInTheDocument();
    });

    it("is fully transparent when the unit isn't casting", () => {
      render(<CastBar unit={{}} inline />);
      expect(screen.getByTestId("cast-bar")).toHaveStyle({ opacity: 0 });
    });

    it("is fully opaque while casting", () => {
      const now = Date.now();
      render(<CastBar unit={{ casting_power: "Fireball", cast_started_at: now, cast_ends_at: now + 2000 }} inline />);
      expect(screen.getByTestId("cast-bar")).toHaveStyle({ opacity: 1 });
    });
  });
});
