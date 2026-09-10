// Maps a nipplejs stick angle (standard math convention: 0deg = east/right,
// 90deg = north/up, increasing counterclockwise) to the same movement-key
// vocabulary WASD produces (see KEY_MAP in App.jsx), so the joystick can
// drive movementKeysRef exactly like keyboard input does. Each key is "on"
// for a 135deg-wide arc (3 octants) centered on its direction, matching how
// two keys held together already produce diagonal movement.
export function angleToMovementKeys(degree) {
  const deg = ((degree % 360) + 360) % 360;
  const keys = [];
  if (deg >= 22.5 && deg <= 157.5) keys.push("forward");
  if (deg >= 202.5 && deg <= 337.5) keys.push("backward");
  if (deg >= 112.5 && deg <= 247.5) keys.push("strafe_left");
  if (deg <= 67.5 || deg >= 292.5) keys.push("strafe_right");
  return keys;
}
