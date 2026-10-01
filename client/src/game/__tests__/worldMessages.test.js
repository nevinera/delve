import {describe, it, expect} from "vitest";
import {worldMessageAction, expiryCountdown} from "../worldMessages";

describe("worldMessageAction", () => {
  it("leaves on a zone exit", () => {
    expect(worldMessageAction({type: "zone-exit", connection: "m/door"})).toEqual({type: "leave"});
  });

  it("leaves with a note when the version expires", () => {
    expect(worldMessageAction({type: "version-expired"})).toMatchObject({type: "leave", log: expect.stringContaining("expired")});
  });

  it("logs a failed exit", () => {
    expect(worldMessageAction({type: "zone-exit-failed", error: "nope"})).toEqual({type: "log", log: "Couldn't leave the zone: nope"});
  });

  it("tracks and announces an upcoming expiry", () => {
    expect(worldMessageAction({type: "version-expiring", expires_at: 5000, minutes_remaining: 1})).toEqual({
      type: "expiring",
      expiresAt: 5000,
      log: "This world version expires in 1 minute.",
    });
    expect(worldMessageAction({type: "version-expiring", expires_at: 5000, minutes_remaining: 7}).log).toBe("This world version expires in 7 minutes.");
  });

  it("ignores anything else", () => {
    expect(worldMessageAction({type: "something-new"})).toBeNull();
  });
});

describe("expiryCountdown", () => {
  const now = 1_000_000;

  it("formats the time left as m:ss within the last ten minutes", () => {
    expect(expiryCountdown(now + 9 * 60_000 + 5_000, now)).toBe("9:05");
    expect(expiryCountdown(now + 1, now)).toBe("0:01");
  });

  it("is null when there's no expiry, it's further out, or it's past", () => {
    expect(expiryCountdown(null, now)).toBeNull();
    expect(expiryCountdown(now + 11 * 60_000, now)).toBeNull();
    expect(expiryCountdown(now, now)).toBeNull();
  });
});
