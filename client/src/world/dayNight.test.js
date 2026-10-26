import { describe, it, expect } from "vitest";
import { CYCLE_MINUTES, CYCLE_MS, LUNAR_DAYS, cyclesAt, darkness, moonAge, phaseAt, skyAt, sunAngle } from "./dayNight.js";

const minute = (m) => m / CYCLE_MINUTES;

describe("the day/night cycle", () => {
  it("runs 3h15m: 10m of dawn, 1h55m of day, 10m of dusk and an hour of night", () => {
    expect(CYCLE_MS).toBe(195 * 60 * 1000);
    expect(phaseAt(minute(5))).toEqual({ name: "dawn", through: 0.5 });
    expect(phaseAt(minute(100)).name).toBe("day");
    expect(phaseAt(minute(130)).name).toBe("dusk");
    expect(phaseAt(minute(190)).name).toBe("night");
    expect(phaseAt(3 + minute(100)).name).toBe("day");
    expect(cyclesAt(Date.UTC(2026, 0, 1) + CYCLE_MS * 2.5)).toBeCloseTo(2.5);
  });

  it("darkens through dusk and lightens through dawn", () => {
    expect(darkness(minute(60))).toBe(0);
    expect(darkness(minute(130))).toBeCloseTo(0.5);
    expect(darkness(minute(160))).toBe(1);
    expect(darkness(minute(2.5))).toBeCloseTo(0.75);
  });

  it("raises the sun in the east halfway through dawn and sets it in the west halfway through dusk", () => {
    expect(sunAngle(minute(5))).toBeCloseTo(0);
    expect(sunAngle(minute(130))).toBeCloseTo(Math.PI);
    const noon = skyAt(minute(67.5)).sunDir;
    expect(noon[1]).toBeGreaterThan(0.8);
    expect(noon[2]).toBeGreaterThan(0.3); // in the south
    expect(skyAt(minute(30)).sunDir[0]).toBeGreaterThan(0); // morning: east
    expect(skyAt(minute(160)).sunDir[1]).toBeLessThan(-0.5); // night: well below
  });

  it("puts the full moon opposite the sun and the new one beside it", () => {
    expect(moonAge(LUNAR_DAYS / 2)).toBeCloseTo(0.5);
    const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
    const full = skyAt(LUNAR_DAYS / 2);
    expect(dot(full.sunDir, full.moonDir)).toBeCloseTo(-1);
    expect(skyAt(LUNAR_DAYS / 2 - 1 + minute(160)).moonDir[1]).toBeGreaterThan(0.6); // high the night before
    const fresh = skyAt(LUNAR_DAYS + minute(60));
    expect(dot(fresh.sunDir, fresh.moonDir)).toBeGreaterThan(0.95);
  });
});
