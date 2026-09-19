import { describe, expect, it } from "vitest";
import { escapeAction } from "../App";

describe("escapeAction", () => {
  it("closes an open overlay first, even with a target", () => {
    expect(escapeAction({ overlayOpen: true, hasTarget: true })).toBe("close");
    expect(escapeAction({ overlayOpen: true, hasTarget: false })).toBe("close");
  });

  it("drops the target when nothing is open", () => {
    expect(escapeAction({ overlayOpen: false, hasTarget: true })).toBe("detarget");
  });

  it("opens settings when nothing is open or targeted", () => {
    expect(escapeAction({ overlayOpen: false, hasTarget: false })).toBe("settings");
  });
});
