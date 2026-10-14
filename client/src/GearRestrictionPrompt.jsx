// Shown on entering a zone while wearing gear its world/zone doesn't allow
// (the game server treats such items as not worn): offers to switch to the
// best available gear instead.
export default function GearRestrictionPrompt({ items, busy, error, onSwitch, onDismiss }) {
  if (!items || items.length === 0) return null;
  return (
    <div role="dialog" aria-label="Disallowed gear" className="game-gear-prompt-backdrop">
      <div className="game-gear-prompt">
        <p>
          You're wearing gear this zone doesn't allow. It won't count here:
        </p>
        <ul>
          {items.map(item => <li key={item.id}>{item.name}</li>)}
        </ul>
        {error && <p className="game-gear-prompt-error">{error}</p>}
        <p>Switch to the best available gear?</p>
        <div className="game-gear-prompt-actions">
          <button disabled={busy} onClick={onDismiss}>Not now</button>
          <button disabled={busy} onClick={onSwitch}>{busy ? "Switching…" : "Switch"}</button>
        </div>
      </div>
    </div>
  );
}
