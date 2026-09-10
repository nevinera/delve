import { describe, expect, it } from "vitest";
import { angleToMovementKeys } from "../joystickAngle";

describe("angleToMovementKeys", () => {
  it("maps pure north to forward only", () => {
    expect(angleToMovementKeys(90)).toEqual(["forward"]);
  });

  it("maps pure south to backward only", () => {
    expect(angleToMovementKeys(270)).toEqual(["backward"]);
  });

  it("maps pure west to strafe_left only", () => {
    expect(angleToMovementKeys(180)).toEqual(["strafe_left"]);
  });

  it("maps pure east to strafe_right only", () => {
    expect(angleToMovementKeys(0)).toEqual(["strafe_right"]);
  });

  it("maps northeast to forward + strafe_right", () => {
    expect(angleToMovementKeys(45)).toEqual(["forward", "strafe_right"]);
  });

  it("maps northwest to forward + strafe_left", () => {
    expect(angleToMovementKeys(135)).toEqual(["forward", "strafe_left"]);
  });

  it("maps southwest to backward + strafe_left", () => {
    expect(angleToMovementKeys(225)).toEqual(["backward", "strafe_left"]);
  });

  it("maps southeast to backward + strafe_right", () => {
    expect(angleToMovementKeys(315)).toEqual(["backward", "strafe_right"]);
  });

  it("normalizes angles outside [0, 360)", () => {
    expect(angleToMovementKeys(-270)).toEqual(["forward"]); // -270 == 90
    expect(angleToMovementKeys(450)).toEqual(["forward"]); // 450 == 90
  });
});
