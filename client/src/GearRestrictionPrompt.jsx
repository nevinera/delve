// Shown on entering a zone while wearing gear its world/zone doesn't allow
// (the game server treats such items as not worn): offers to switch to the
// best available gear instead.
export default function GearRestrictionPrompt({ items, busy, error, onSwitch, onDismiss }) {
  if (!items || items.length === 0) return null;
  return (
    <div
      role="dialog"
      aria-label="Disallowed gear"
      style={{
        position: "fixed", inset: 0, display: "flex", alignItems: "center", justifyContent: "center",
        background: "rgba(0, 0, 0, 0.6)", zIndex: 1000,
      }}
    >
      <div style={{ background: "#1c1c22", border: "1px solid #666", borderRadius: 6, color: "#ddd", padding: 16, maxWidth: 360, margin: 16 }}>
        <p style={{ marginTop: 0 }}>
          You're wearing gear this zone doesn't allow. It won't count here:
        </p>
        <ul style={{ paddingLeft: 20 }}>
          {items.map(item => <li key={item.id}>{item.name}</li>)}
        </ul>
        {error && <p style={{ color: "#e88" }}>{error}</p>}
        <p>Switch to the best available gear?</p>
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
          <button disabled={busy} onClick={onDismiss}>Not now</button>
          <button disabled={busy} onClick={onSwitch}>{busy ? "Switching…" : "Switch"}</button>
        </div>
      </div>
    </div>
  );
}
