// Shown when a player walks back onto a zone exit just after entering the
// zone: leaving is a one-way trip to another zone, so it asks first.
export default function ZoneExitPrompt({ open, onStay, onLeave }) {
  if (!open) return null;
  return (
    <div role="dialog" aria-label="Leave zone" className="game-gear-prompt-backdrop">
      <div className="game-gear-prompt">
        <p>You just got here. Leave the zone already?</p>
        <div className="game-gear-prompt-actions">
          <button onClick={onStay}>Stay</button>
          <button onClick={onLeave}>Leave</button>
        </div>
      </div>
    </div>
  );
}
