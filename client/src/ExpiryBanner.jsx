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
    <div role="status" className="game-expiry-banner">
      This world version expires in {countdown}
    </div>
  );
}
