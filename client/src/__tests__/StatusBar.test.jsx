import { describe, expect, it } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { StatusBar, formatRemaining, formatRemainingCompact } from "../App";

describe("formatRemaining", () => {
  it("formats minutes unpadded and seconds zero-padded", () => {
    expect(formatRemaining(185_000)).toEqual("3:05");
    expect(formatRemaining(8_000)).toEqual("0:08");
  });

  it("rounds up to the next second", () => {
    expect(formatRemaining(500)).toEqual("0:01");
  });

  it("clamps negative remaining time to 0:00", () => {
    expect(formatRemaining(-500)).toEqual("0:00");
  });
});

describe("formatRemainingCompact", () => {
  it("shows seconds under a minute", () => {
    expect(formatRemainingCompact(22_000)).toEqual("22s");
    expect(formatRemainingCompact(8_000)).toEqual("8s");
  });

  it("switches to rounded minutes at and above a minute", () => {
    expect(formatRemainingCompact(60_000)).toEqual("1m");
    expect(formatRemainingCompact(939_000)).toEqual("16m"); // 15:39 -> 16m
  });

  it("never exceeds 3 characters for realistic buff durations", () => {
    for (const ms of [500, 8_000, 59_000, 60_000, 185_000, 3_599_000]) {
      expect(formatRemainingCompact(ms).length).toBeLessThanOrEqual(3);
    }
  });

  it("clamps negative remaining time to 0s", () => {
    expect(formatRemainingCompact(-500)).toEqual("0s");
  });
});

describe("StatusBar", () => {
  const NOW = 1_000_000;

  it("renders nothing when there are no statuses", () => {
    render(<StatusBar statuses={[]} now={NOW} />);
    expect(document.body.textContent).toBe("");
  });

  it("shows a buff's remaining time and short name", () => {
    render(<StatusBar statuses={[{ key: "a", shortName: "2ndWnd", treatAs: "buff", expiresAt: NOW + 65_000 }]} now={NOW} />);
    expect(screen.getByText("1:05 2ndWnd")).toBeInTheDocument();
  });

  it("colors a buff green and a debuff red", () => {
    render(
      <StatusBar
        statuses={[
          { key: "b", shortName: "Buffed", treatAs: "buff", expiresAt: NOW + 10_000 },
          { key: "d", shortName: "Debuffed", treatAs: "debuff", expiresAt: NOW + 10_000 },
        ]}
        now={NOW}
      />
    );
    expect(screen.getByText(/Buffed/)).toHaveStyle({ color: "#5ec95e" });
    expect(screen.getByText(/Debuffed/)).toHaveStyle({ color: "#ff5c5c" });
  });

  it("puts buffs and debuffs in separate columns, buffs first", () => {
    render(
      <StatusBar
        statuses={[
          { key: "d", shortName: "Debuffed", treatAs: "debuff", expiresAt: NOW + 10_000 },
          { key: "b", shortName: "Buffed", treatAs: "buff", expiresAt: NOW + 10_000 },
        ]}
        now={NOW}
      />
    );
    const columns = document.querySelectorAll("[style*='column']");
    expect(columns[0].textContent).toContain("Buffed");
    expect(columns[1].textContent).toContain("Debuffed");
  });

  it("sorts ascending by time remaining, longest last", () => {
    render(
      <StatusBar
        statuses={[
          { key: "long", shortName: "Long", treatAs: "buff", expiresAt: NOW + 60_000 },
          { key: "short", shortName: "Short", treatAs: "buff", expiresAt: NOW + 5_000 },
        ]}
        now={NOW}
      />
    );
    const rows = screen.getAllByText(/Long|Short/);
    expect(rows[0]).toHaveTextContent("Short");
    expect(rows[1]).toHaveTextContent("Long");
  });

  it("omits an already-expired status", () => {
    render(<StatusBar statuses={[{ key: "gone", shortName: "Gone", treatAs: "buff", expiresAt: NOW - 1000 }]} now={NOW} />);
    expect(screen.queryByText(/Gone/)).not.toBeInTheDocument();
  });

  it("anchors to the left edge by default", () => {
    render(<StatusBar statuses={[{ key: "a", shortName: "Buffed", treatAs: "buff", expiresAt: NOW + 10_000 }]} now={NOW} />);
    expect(screen.getByText(/Buffed/).closest("[style*='position: absolute']")).toHaveStyle({ left: "8px" });
  });

  it("anchors to the right edge when side is 'right'", () => {
    render(<StatusBar statuses={[{ key: "a", shortName: "Buffed", treatAs: "buff", expiresAt: NOW + 10_000 }]} now={NOW} side="right" />);
    expect(screen.getByText(/Buffed/).closest("[style*='position: absolute']")).toHaveStyle({ right: "8px" });
  });

  describe("landscape mode", () => {
    it("uses the compact duration format instead of mm:ss", () => {
      render(<StatusBar statuses={[{ key: "a", shortName: "2ndWnd", treatAs: "buff", expiresAt: NOW + 65_000 }]} now={NOW} landscape />);
      expect(screen.getByText("1m 2ndWnd")).toBeInTheDocument();
    });

    it("stacks the buff/debuff columns vertically instead of side by side", () => {
      render(
        <StatusBar
          statuses={[
            { key: "b", shortName: "Buffed", treatAs: "buff", expiresAt: NOW + 10_000 },
            { key: "d", shortName: "Debuffed", treatAs: "debuff", expiresAt: NOW + 10_000 },
          ]}
          now={NOW}
          landscape
        />
      );
      const container = screen.getByText(/Buffed/).closest("[style*='position: absolute']");
      expect(container).toHaveStyle({ flexDirection: "column" });
    });

    it("anchors to the top corner instead of the bottom", () => {
      render(<StatusBar statuses={[{ key: "a", shortName: "Buffed", treatAs: "buff", expiresAt: NOW + 10_000 }]} now={NOW} landscape />);
      const container = screen.getByText(/Buffed/).closest("[style*='position: absolute']");
      expect(container).toHaveStyle({ top: "8px" });
      expect(container.style.bottom).toBe("");
    });

    it("text-aligns rows to the left side's outer (left) edge", () => {
      render(<StatusBar statuses={[{ key: "a", shortName: "Buffed", treatAs: "buff", expiresAt: NOW + 10_000 }]} now={NOW} landscape />);
      expect(screen.getByText(/Buffed/)).toHaveStyle({ textAlign: "left" });
    });

    it("text-aligns rows to the right side's outer (right) edge", () => {
      render(<StatusBar statuses={[{ key: "a", shortName: "Buffed", treatAs: "buff", expiresAt: NOW + 10_000 }]} now={NOW} side="right" landscape />);
      expect(screen.getByText(/Buffed/)).toHaveStyle({ textAlign: "right" });
    });

    it("doesn't set textAlign outside landscape mode", () => {
      render(<StatusBar statuses={[{ key: "a", shortName: "Buffed", treatAs: "buff", expiresAt: NOW + 10_000 }]} now={NOW} side="right" />);
      expect(screen.getByText(/Buffed/).style.textAlign).toBe("");
    });
  });

  describe("hover tooltip", () => {
    const status = {
      key: "a",
      shortName: "2ndWnd",
      treatAs: "buff",
      expiresAt: NOW + 65_000,
      name: "Second Wind",
      description: "A burst of energy from catching your breath.",
      appliedByName: "Bob",
    };

    it("shows nothing before hovering", () => {
      render(<StatusBar statuses={[status]} now={NOW} />);
      expect(screen.queryByText("Second Wind")).not.toBeInTheDocument();
    });

    it("shows the full name, description, and applier on hover", () => {
      render(<StatusBar statuses={[status]} now={NOW} />);
      fireEvent.mouseEnter(screen.getByText("1:05 2ndWnd"));

      expect(screen.getByText("Second Wind")).toBeInTheDocument();
      expect(screen.getByText("A burst of energy from catching your breath.")).toBeInTheDocument();
      expect(screen.getByText("Applied by Bob")).toBeInTheDocument();
    });

    it("hides the tooltip again on mouse leave", () => {
      render(<StatusBar statuses={[status]} now={NOW} />);
      const row = screen.getByText("1:05 2ndWnd");
      fireEvent.mouseEnter(row);
      fireEvent.mouseLeave(row);

      expect(screen.queryByText("Second Wind")).not.toBeInTheDocument();
    });

    it("omits the description line when the status has none", () => {
      render(<StatusBar statuses={[{ ...status, description: undefined }]} now={NOW} />);
      fireEvent.mouseEnter(screen.getByText("1:05 2ndWnd"));

      expect(screen.getByText("Second Wind")).toBeInTheDocument();
      expect(screen.queryByText("A burst of energy from catching your breath.")).not.toBeInTheDocument();
    });

    it("omits the applied-by line when the applier can't be resolved", () => {
      render(<StatusBar statuses={[{ ...status, appliedByName: null }]} now={NOW} />);
      fireEvent.mouseEnter(screen.getByText("1:05 2ndWnd"));

      expect(screen.getByText("Second Wind")).toBeInTheDocument();
      expect(screen.queryByText(/Applied by/)).not.toBeInTheDocument();
    });
  });
});
