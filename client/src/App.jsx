import { useEffect, useRef, useState } from "react";
import Canvas from "./Canvas";
import { GameConnection } from "./game/connection";

const styles = {
  root: {
    display: "flex",
    flexDirection: "column",
    width: "100vw",
    height: "100vh",
    background: "#111",
    color: "#ddd",
    fontFamily: "monospace",
    fontSize: 13,
    overflow: "hidden",
  },
  frames: {
    display: "flex",
    flexShrink: 0,
    height: 90,
  },
  selfFrame: {
    flex: 1,
    background: "#0d2b0d",
    border: "1px solid #2a6a2a",
    padding: 8,
  },
  targetFrame: {
    flex: 1,
    background: "#2b0d0d",
    border: "1px solid #6a2a2a",
    padding: 8,
  },
  log: {
    flexShrink: 0,
    height: 110,
    background: "#1a1a1a",
    borderTop: "1px solid #333",
    padding: "6px 8px",
    overflowY: "auto",
    lineHeight: 1.5,
  },
};

function UnitBar({ label, current, max }) {
  const pct = max > 0 ? Math.round((current / max) * 100) : 0;
  return (
    <div style={{ fontSize: 11, marginTop: 4, color: "#aaa" }}>
      {label} {current?.toFixed(0)}/{max?.toFixed(0)} ({pct}%)
    </div>
  );
}

export default function App({
  slotToken,
  gameServerUrl,
  instanceId,
  slotId,
  zoneSourceUrl,
  characterName,
  characterTokenUrl,
}) {
  const connRef = useRef(null);
  const [units, setUnits] = useState({});
  const [log, setLog] = useState(["Connecting…"]);

  const addLog = (msg) => setLog((prev) => [...prev.slice(-99), msg]);

  useEffect(() => {
    const conn = new GameConnection({
      gameServerUrl,
      instanceId,
      slotId,
      slotToken,
      onOpen: () => addLog("Connected to game server."),
      onClose: () => addLog("Disconnected."),
      onStateChange: ({ units: u }) => setUnits(u),
    });
    conn.connect();
    connRef.current = conn;
    return () => conn.close();
  }, []);

  const selfIdentifier = `player:${characterName}`;
  const selfUnit = Object.values(units).find(
    (u) => u.zone_unit_identifier === selfIdentifier
  );

  return (
    <div style={styles.root}>
      <div style={styles.frames}>
        <div style={styles.selfFrame}>
          <strong>{characterName ?? "—"}</strong>
          {selfUnit && (
            <>
              <UnitBar label="HP" current={selfUnit.health} max={selfUnit.max_health} />
              <UnitBar label="MP" current={selfUnit.resource} max={selfUnit.max_resource} />
            </>
          )}
        </div>
        <div style={styles.targetFrame}>No target</div>
      </div>
      <Canvas
        zoneSourceUrl={zoneSourceUrl}
        units={units}
        selfIdentifier={selfIdentifier}
        characterTokenUrl={characterTokenUrl}
      />
      <div style={styles.log}>
        {log.map((line, i) => (
          <div key={i}>{line}</div>
        ))}
      </div>
    </div>
  );
}
