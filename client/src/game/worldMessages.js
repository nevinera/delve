// What the game client should do with a world-related server message (see
// game-server/README.md): leave for the world's play page (which joins
// whichever zone the character is now in, or upgrades them off an expired
// version), log something, or track the version's expiry. null for
// anything else.
export function worldMessageAction(msg) {
  switch (msg.type) {
    case "zone-exit":
      return { type: "leave" };
    case "version-expired":
      return { type: "leave", log: "This world version has expired. Moving you to the latest version…" };
    case "zone-exit-failed":
      return { type: "log", log: `Couldn't leave the zone: ${msg.error}` };
    case "version-expiring": {
      const minutes = msg.minutes_remaining;
      return {
        type: "expiring",
        expiresAt: msg.expires_at,
        log: `This world version expires in ${minutes} minute${minutes === 1 ? "" : "s"}.`,
      };
    }
    default:
      return null;
  }
}

// "m:ss" until expiresAt (epoch ms), or null when it's more than
// showWithinMs away (or past).
export function expiryCountdown(expiresAt, now, showWithinMs = 10 * 60 * 1000) {
  if (expiresAt == null) return null;
  const remaining = expiresAt - now;
  if (remaining <= 0 || remaining > showWithinMs) return null;
  const totalSeconds = Math.ceil(remaining / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = String(totalSeconds % 60).padStart(2, "0");
  return `${minutes}:${seconds}`;
}
