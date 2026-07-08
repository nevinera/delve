import { useCallback, useEffect, useRef, useState } from "react";
import Canvas from "./Canvas";
import { GameConnection } from "./game/connection";

// W/S/Q/E → movement keys sent to server; A/D → turning handled by SceneManager
const KEY_MAP = {
  KeyW: "forward",
  KeyS: "backward",
  KeyQ: "strafe_left",
  KeyE: "strafe_right",
  KeyA: "turn_left",
  KeyD: "turn_right",
};
const MOVEMENT_KEYS = new Set(["forward", "backward", "strafe_left", "strafe_right"]);
const TURN_KEYS = new Set(["turn_left", "turn_right"]);

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
  const movementKeysRef = useRef(new Set());
  const turnKeysRef = useRef(new Set());
  const facingRef = useRef(0); // degrees
  const [units, setUnits] = useState({});
  const [disconnected, setDisconnected] = useState(false);
  const [log, setLog] = useState(["Connecting…"]);

  const addLog = (msg) => setLog((prev) => [...prev.slice(-99), msg]);

  const sendMove = useCallback(() => {
    connRef.current?.send({
      direction: "up",
      type: "move",
      facing: facingRef.current,
      keys: [...movementKeysRef.current],
    });
  }, []);

  // Called by SceneManager when continuous turning updates the facing angle
  const handleFacingChange = useCallback((degrees) => {
    facingRef.current = ((degrees % 360) + 360) % 360;
    sendMove();
  }, [sendMove]);

  useEffect(() => {
    const onKeyDown = (e) => {
      if (e.repeat) return;
      const action = KEY_MAP[e.code];
      if (!action) return;
      if (MOVEMENT_KEYS.has(action)) {
        movementKeysRef.current.add(action);
        sendMove();
      } else if (TURN_KEYS.has(action)) {
        turnKeysRef.current.add(action);
      }
    };
    const onKeyUp = (e) => {
      const action = KEY_MAP[e.code];
      if (!action) return;
      if (MOVEMENT_KEYS.has(action)) {
        movementKeysRef.current.delete(action);
        sendMove();
      } else if (TURN_KEYS.has(action)) {
        turnKeysRef.current.delete(action);
      }
    };
    const onBlur = () => {
      movementKeysRef.current.clear();
      turnKeysRef.current.clear();
      sendMove();
    };
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    window.addEventListener("blur", onBlur);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("blur", onBlur);
    };
  }, [sendMove]);

  useEffect(() => {
    const conn = new GameConnection({
      gameServerUrl,
      instanceId,
      slotId,
      slotToken,
      onOpen: () => { setDisconnected(false); addLog("Connected to game server."); },
      onClose: () => { setDisconnected(true); addLog("Disconnected."); },
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
        turnKeysRef={turnKeysRef}
        onFacingChange={handleFacingChange}
      />
      <div style={styles.log}>
        {log.map((line, i) => (
          <div key={i}>{line}</div>
        ))}
      </div>
      {disconnected && (
        <div style={{
          position: "fixed", inset: 0, display: "flex",
          alignItems: "center", justifyContent: "center",
          pointerEvents: "none",
        }}>
          <div style={{
            color: "#ff2222", fontSize: 48, fontWeight: "bold",
            textShadow: "0 0 20px #ff0000, 0 2px 4px #000",
            letterSpacing: 4,
          }}>
            DISCONNECTED
          </div>
        </div>
      )}
    </div>
  );
}
