import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { StatusBar, formatRemaining } from "../App";

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
});
