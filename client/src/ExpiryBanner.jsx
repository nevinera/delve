import { useEffect, useState } from "react";
import { expiryCountdown } from "./game/worldMessages";

// A small banner counting down the last ten minutes before the world
// version the player is in expires (they're moved to the latest version
// when it does).
export default function ExpiryBanner({ expiresAt }) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (expiresAt == null) return undefined;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [expiresAt]);

  const countdown = expiryCountdown(expiresAt, now);
  if (!countdown) return null;
  return (
    <div
      role="status"
      style={{
        position: "fixed", top: 8, left: "50%", transform: "translateX(-50%)",
        background: "rgba(40, 20, 0, 0.85)", border: "1px solid #c84", borderRadius: 4,
        color: "#fc8", padding: "4px 12px", fontSize: 14, pointerEvents: "none",
      }}
    >
      This world version expires in {countdown}
    </div>
  );
}
