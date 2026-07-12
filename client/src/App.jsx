import { useCallback, useEffect, useRef, useState } from "react";

const RESPAWN_DELAY_S = 10;
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
    position: "relative",
    background: "#0d2b0d",
    border: "1px solid #2a6a2a",
    padding: 8,
  },
  targetFrame: {
    flex: 1,
    position: "relative",
    background: "#2b0d0d",
    border: "1px solid #6a2a2a",
    padding: 8,
  },
  deadBadge: {
    position: "absolute",
    top: 6,
    right: 8,
    fontSize: 22,
    fontWeight: "bold",
    color: "#cc2222",
    letterSpacing: 2,
    textShadow: "0 0 6px #000, 0 1px 4px #000",
    pointerEvents: "none",
  },
  actionBar: {
    flexShrink: 0,
    display: "flex",
    justifyContent: "center",
    alignItems: "center",
    gap: 4,
    padding: "4px 8px",
    background: "#111",
    borderTop: "1px solid #333",
  },
  actionButton: {
    position: "relative",
    width: 52,
    height: 52,
    background: "#1c1c1c",
    border: "1px solid #444",
    borderRadius: 4,
    cursor: "default",
    flexShrink: 0,
    overflow: "hidden",
  },
  actionIcon: {
    position: "absolute",
    inset: 4,
    objectFit: "contain",
  },
  actionButtonFlash: {
    borderColor: "#cc0",
    boxShadow: "inset 0 0 10px rgba(255, 220, 50, 0.5)",
    background: "#2a2a0a",
  },
  actionCooldownOverlay: {
    position: "absolute",
    inset: 0,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    pointerEvents: "none",
  },
  actionCooldownText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "bold",
    textShadow: "0 0 4px #000, 0 1px 3px #000",
    lineHeight: 1,
  },
  actionKeybind: {
    position: "absolute",
    bottom: 2,
    right: 4,
    fontSize: 10,
    color: "#666",
    lineHeight: 1,
    pointerEvents: "none",
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
  canvasWrapper: {
    flex: 1,
    position: "relative",
    overflow: "hidden",
  },
  respawnOverlay: {
    position: "absolute",
    top: 12,
    left: "50%",
    transform: "translateX(-50%)",
    zIndex: 10,
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: 6,
    background: "rgba(0,0,0,0.7)",
    border: "1px solid #555",
    borderRadius: 6,
    padding: "8px 18px",
    pointerEvents: "auto",
  },
  respawnCountdown: {
    fontSize: 20,
    fontWeight: "bold",
    color: "#cc2222",
    letterSpacing: 1,
  },
  respawnButton: {
    fontSize: 16,
    fontWeight: "bold",
    padding: "6px 20px",
    background: "#2a5a2a",
    color: "#cfc",
    border: "1px solid #4a9a4a",
    borderRadius: 4,
    cursor: "pointer",
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

function HealthBar({ current, max }) {
  const pct = max > 0 ? Math.max(0, Math.min(1, current / max)) : 0;
  return (
    <div style={{
      position: "absolute",
      bottom: 6,
      left: 6,
      right: 6,
      height: 9,
      border: "1px solid #3a8a3a",
      borderRadius: 2,
      background: "#5a1010",
    }}>
      <div style={{
        width: `${pct * 100}%`,
        height: "100%",
        background: "#2a7a2a",
        borderRadius: 1,
      }} />
    </div>
  );
}

// Returns the maximum range in feet for a power, or null for self-only powers.
// The JSON range field may be a number (e.g. 5.0) or a [min, max] array.
function powerMaxRange(power) {
  for (const effect of power.effects ?? []) {
    const r = effect.range;
    if (r == null) continue;
    return Array.isArray(r) ? r[1] : r;
  }
  return null;
}

function formatUnitName(zoneUnitIdentifier) {
  if (!zoneUnitIdentifier) return "Unknown";
  return zoneUnitIdentifier
    .replace(/^player:/, "")
    .split("_")
    .map(w => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

function RespawnOverlay({ deathTime, onRespawn }) {
  const [remaining, setRemaining] = useState(RESPAWN_DELAY_S);

  useEffect(() => {
    if (!deathTime) return;
    const update = () => setRemaining(Math.max(0, RESPAWN_DELAY_S - (Date.now() - deathTime) / 1000));
    update();
    const id = setInterval(update, 100);
    return () => clearInterval(id);
  }, [deathTime]);

  if (!deathTime) return null;

  return (
    <div style={styles.respawnOverlay}>
      {remaining > 0
        ? <span style={styles.respawnCountdown}>Respawn in {Math.ceil(remaining)}s</span>
        : <button style={styles.respawnButton} onClick={onRespawn}>Respawn</button>
      }
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
  classConfigUrl,
}) {
  const connRef = useRef(null);
  const canvasRef = useRef(null);
  const movementKeysRef = useRef(new Set());
  const turnKeysRef = useRef(new Set());
  const facingRef = useRef(0); // degrees
  const selfPosRef = useRef(null); // latest client-predicted position {x, y}
  const selfIdentifierRef = useRef(`player:${characterName}`);
  selfIdentifierRef.current = `player:${characterName}`;
  const [units, setUnits] = useState({});
  const [targetId, setTargetId] = useState(null);
  const unitsRef = useRef({});
  const targetIdRef = useRef(null);
  const [disconnected, setDisconnected] = useState(false);
  const [log, setLog] = useState(["Connecting…"]);
  const [powers, setPowers] = useState([]);
  const [flashSlot, setFlashSlot] = useState(null);
  const [gcdEndsAt, setGcdEndsAt] = useState(0);   // epoch ms; drives cooldown display
  const gcdEndsAtRef = useRef(0);                   // same value, safe to read in callbacks
  const gcdTotalMsRef = useRef(0);                  // duration of the current GCD window
  const npcPowersByZoneIdRef = useRef({});          // { [zoneUnitId]: { [powerName]: power } }

  const setGcd = useCallback((ms) => {
    gcdEndsAtRef.current = ms;
    setGcdEndsAt(ms);
  }, []);

  // Tick re-renders at 50ms while GCD is active for smooth sweep animation.
  const [, setTick] = useState(0);
  useEffect(() => {
    if (gcdEndsAt <= Date.now()) return;
    const id = setInterval(() => {
      setTick(t => t + 1);
      if (Date.now() >= gcdEndsAt) clearInterval(id);
    }, 50);
    return () => clearInterval(id);
  }, [gcdEndsAt]);


  useEffect(() => {
    if (!classConfigUrl) return;
    fetch(classConfigUrl)
      .then(r => r.json())
      .then(cfg => setPowers(cfg.powers ?? []))
      .catch(() => {});
  }, [classConfigUrl]);

  useEffect(() => {
    if (!zoneSourceUrl) return;
    fetch(zoneSourceUrl)
      .then(r => r.json())
      .then(zone => {
        const byId = {};
        for (const map of zone.maps ?? []) {
          for (const unit of map.units ?? []) {
            const ut = zone.unitTypes?.[unit.unitType];
            if (!ut) continue;
            const byName = {};
            for (const p of ut.powers ?? []) {
              byName[p.name] = p;
            }
            byId[unit.identifier] = byName;
          }
        }
        npcPowersByZoneIdRef.current = byId;
      })
      .catch(() => {});
  }, [zoneSourceUrl]);

  const addLog = (msg) => setLog((prev) => [...prev.slice(-99), msg]);

  const usePower = useCallback((slot) => {
    const selfUnit = Object.values(unitsRef.current).find(u => u.zone_unit_identifier === selfIdentifierRef.current);
    if (selfUnit?.status === "dead") return;
    if (Date.now() < gcdEndsAtRef.current) return;
    const power = powers[slot];
    if (!power) return;
    if (power.cooldown > 0) {
      const cdEndsAt = selfUnit?.power_cooldowns?.[power.name] ?? 0;
      if (Date.now() < cdEndsAt) return;
    }
    // Mirror server-side rejection checks so we don't set GCD on commands that
    // will certainly be rejected (target missing, dead, or out of range).
    const range = powerMaxRange(power);
    if (range != null) {
      const target = targetIdRef.current ? unitsRef.current[targetIdRef.current] : null;
      if (!target || target.status === "dead") return;
      const self = selfPosRef.current;
      if (self) {
        const selfRadius = Object.values(unitsRef.current).find(u => u.zone_unit_identifier === selfIdentifierRef.current)?.radius ?? 0;
        const dx = target.position.x - self.x;
        const dy = target.position.y - self.y;
        if (Math.sqrt(dx * dx + dy * dy) > range + selfRadius + (target.radius ?? 0)) return;
        if (power.frontal !== false) {
          const toTarget = Math.atan2(dx, dy) * 180 / Math.PI;
          let diff = toTarget - facingRef.current;
          while (diff > 180) diff -= 360;
          while (diff < -180) diff += 360;
          if (Math.abs(diff) > 75) return;
        }
      }
    }
    const totalMs = power.globalCooldown * 1000;
    gcdTotalMsRef.current = totalMs;
    setGcd(Date.now() + totalMs);
    connRef.current?.send({ direction: "up", type: "use_power", slot });
    setFlashSlot(slot);
    setTimeout(() => setFlashSlot(null), 150);
    if (power.graphicEffects?.length) {
      const targetUnit = targetIdRef.current ? unitsRef.current[targetIdRef.current] : null;
      canvasRef.current?.playGraphicEffects(
        power.graphicEffects,
        { self: selfPosRef.current, target: targetUnit?.position },
        classConfigUrl,
      );
    }
  }, [powers, setGcd, classConfigUrl]);

  const sendMove = useCallback(() => {
    const pos = selfPosRef.current;
    connRef.current?.send({
      direction: "up",
      type: "move",
      facing: facingRef.current,
      keys: [...movementKeysRef.current],
      ...(pos !== null ? { x: pos.x, y: pos.y } : {}),
    });
  }, []);

  const handleSelfPosition = useCallback((pos) => {
    selfPosRef.current = pos;
    sendMove();
  }, [sendMove]);

  const handleTargetUnit = useCallback((id) => {
    if (id != null) {
      const self = Object.values(unitsRef.current).find(u => u.zone_unit_identifier === selfIdentifierRef.current);
      const tgt = unitsRef.current[id];
      if (self && tgt) {
        const dx = tgt.position.x - self.position.x;
        const dy = tgt.position.y - self.position.y;
        if (Math.sqrt(dx * dx + dy * dy) > 60) return;
      }
    }
    targetIdRef.current = id;
    setTargetId(id);
    connRef.current?.send({
      direction: "up",
      type: "target",
      target_id: id ?? null,
    });
  }, []);

  // Called by SceneManager when continuous turning updates the facing angle
  const handleFacingChange = useCallback((degrees) => {
    facingRef.current = ((degrees % 360) + 360) % 360;
    sendMove();
  }, [sendMove]);

  const handleTabTarget = useCallback((unitsSnapshot, currentTargetId, selfId) => {
    const selfUnit = Object.values(unitsSnapshot).find(u => u.zone_unit_identifier === selfId);
    if (!selfUnit) return;

    const hostiles = Object.entries(unitsSnapshot)
      .filter(([, u]) =>
        u.hostility === "hostile" &&
        u.map_identifier === selfUnit.map_identifier &&
        u.status !== "dead" &&
        (canvasRef.current?.isInView(u.position.x, u.position.y) ?? true)
      )
      .map(([id, u]) => {
        const dx = u.position.x - selfUnit.position.x;
        const dy = u.position.y - selfUnit.position.y;
        return { id, dist: Math.sqrt(dx * dx + dy * dy) };
      })
      .filter(h => h.dist <= 60)
      .sort((a, b) => a.dist - b.dist);

    if (hostiles.length === 0) return;
    const currentIdx = hostiles.findIndex(h => h.id === currentTargetId);
    const nextIdx = (currentIdx + 1) % hostiles.length;
    handleTargetUnit(hostiles[nextIdx].id);
  }, [handleTargetUnit]);

  useEffect(() => {
    const onKeyDown = (e) => {
      if (e.repeat) return;
      if (e.code === "Tab") {
        e.preventDefault();
        handleTabTarget(
          // capture current values via refs to avoid stale closure
          unitsRef.current,
          targetIdRef.current,
          selfIdentifier,
        );
        return;
      }
      const slotKey = e.code.match(/^Digit(\d)$/)?.[1];
      if (slotKey !== undefined) {
        const slot = slotKey === "0" ? 9 : parseInt(slotKey, 10) - 1;
        usePower(slot);
        return;
      }
      const action = KEY_MAP[e.code];
      if (!action) return;
      const selfForInput = Object.values(unitsRef.current).find(u => u.zone_unit_identifier === selfIdentifierRef.current);
      if (selfForInput?.status === "dead") return;
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
  }, [sendMove, usePower, handleTabTarget]);

  useEffect(() => {
    const conn = new GameConnection({
      gameServerUrl,
      instanceId,
      slotId,
      slotToken,
      onOpen: () => { setDisconnected(false); addLog("Connected to game server."); },
      onClose: () => { setDisconnected(true); addLog("Disconnected."); },
      onStateChange: ({ units: u, combatEvents = [] }) => {
        unitsRef.current = u;
        setUnits(u);
        const tgt = targetIdRef.current ? u[targetIdRef.current] : null;
        if (tgt) {
          const self = Object.values(u).find(un => un.zone_unit_identifier === selfIdentifierRef.current);
          if (self) {
            const dx = tgt.position.x - self.position.x;
            const dy = tgt.position.y - self.position.y;
            if (Math.sqrt(dx * dx + dy * dy) > 60) {
              targetIdRef.current = null;
              setTargetId(null);
              connRef.current?.send({ direction: "up", type: "target", target_id: null });
            }
          }
        }
        for (const ev of combatEvents) {
          const attacker = u[ev.attacker_id];
          const target = u[ev.target_id];
          if (!attacker || !target) continue;
          const powersByName = npcPowersByZoneIdRef.current[attacker.zone_unit_identifier];
          if (!powersByName) continue;
          const power = powersByName[ev.power_name];
          if (!power?.graphicEffects?.length) continue;
          canvasRef.current?.playGraphicEffects(
            power.graphicEffects,
            { self: attacker.position, target: target.position },
            zoneSourceUrl,
          );
        }
      },
    });
    conn.connect();
    connRef.current = conn;
    return () => conn.close();
  }, []);

  const selfIdentifier = `player:${characterName}`;
  const selfUnit = Object.values(units).find(
    (u) => u.zone_unit_identifier === selfIdentifier
  );

  const initialFacingSetRef = useRef(false);
  useEffect(() => {
    if (selfUnit && !initialFacingSetRef.current) {
      facingRef.current = ((selfUnit.position.angle % 360) + 360) % 360;
      initialFacingSetRef.current = true;
    }
  }, [selfUnit?.zone_unit_identifier]);

  // Reconcile local GCD to the server's authoritative value when a power
  // actually fires. The server's epoch ms is ~100ms later than our optimistic
  // estimate (network latency) so this also corrects the timing slightly.
  // If the server rejected the command (no delta update), local GCD expires
  // naturally — client-side checks in usePower prevent most false-positive sets.
  useEffect(() => {
    const serverMs = selfUnit?.global_cooldown_ends_at;
    if (serverMs) setGcd(serverMs);
  }, [selfUnit?.global_cooldown_ends_at]);

  const [deathTime, setDeathTime] = useState(null);
  const prevSelfStatusRef = useRef(null);
  useEffect(() => {
    const status = selfUnit?.status ?? null;
    if (status === "dead" && prevSelfStatusRef.current !== "dead") setDeathTime(Date.now());
    if (status !== "dead" && prevSelfStatusRef.current === "dead") setDeathTime(null);
    prevSelfStatusRef.current = status;
  }, [selfUnit?.status]);

  const handleRespawn = useCallback(() => {
    connRef.current?.send({ type: "respawn" });
  }, []);

  const targetUnit = targetId ? units[targetId] : null;

  return (
    <div style={styles.root}>
      <div style={styles.frames}>
        <div style={styles.selfFrame}>
          <strong>{characterName ?? "—"}</strong>
          {selfUnit && (
            <>
              <UnitBar label="MP" current={selfUnit.resource} max={selfUnit.max_resource} />
              <HealthBar current={selfUnit.health} max={selfUnit.max_health} />
            </>
          )}
          {selfUnit?.status === "dead" && <span style={styles.deadBadge}>DEAD</span>}
        </div>
        <div style={styles.targetFrame}>
          {targetUnit ? (
            <>
              <strong>{formatUnitName(targetUnit.zone_unit_identifier)}</strong>
              <HealthBar current={targetUnit.health} max={targetUnit.max_health} />
              {targetUnit.status === "dead" && <span style={styles.deadBadge}>DEAD</span>}
            </>
          ) : (
            <span style={{ color: "#666" }}>No target</span>
          )}
        </div>
      </div>
      <div style={styles.canvasWrapper}>
        <Canvas
          ref={canvasRef}
          zoneSourceUrl={zoneSourceUrl}
          units={units}
          selfIdentifier={selfIdentifier}
          characterTokenUrl={characterTokenUrl}
          movementKeysRef={movementKeysRef}
          turnKeysRef={turnKeysRef}
          onFacingChange={handleFacingChange}
          onSelfPosition={handleSelfPosition}
          onUnitClick={handleTargetUnit}
          targetId={targetId}
        />
        <RespawnOverlay deathTime={deathTime} onRespawn={handleRespawn} />
      </div>
      <div style={styles.actionBar}>
        {Array.from({ length: 10 }, (_, i) => {
          const slot = i + 1;
          const key = slot === 10 ? "0" : String(slot);
          const power = powers[i];
          const iconUrl = power?.iconURL
            ? new URL(power.iconURL, classConfigUrl).href
            : null;
          let inRange = true;
          let isFacing = true;
          if (power && targetUnit && selfUnit) {
            const range = powerMaxRange(power);
            if (range != null) {
              const dx = targetUnit.position.x - selfUnit.position.x;
              const dy = targetUnit.position.y - selfUnit.position.y;
              inRange = Math.sqrt(dx * dx + dy * dy) <= range + (selfUnit.radius ?? 0) + (targetUnit.radius ?? 0);
              if (power.frontal !== false) {
                const toTarget = Math.atan2(dx, dy) * 180 / Math.PI;
                let diff = toTarget - selfUnit.position.angle;
                while (diff > 180) diff -= 360;
                while (diff < -180) diff += 360;
                isFacing = Math.abs(diff) <= 75;
              }
            }
          }
          const now = Date.now();
          const pcEndsAt = power?.name ? (selfUnit?.power_cooldowns?.[power.name] ?? 0) : 0;
          // Show whichever cooldown ends later; GCD total is used when GCD is dominant.
          const cdEndsAt = Math.max(gcdEndsAt, pcEndsAt);
          const onCooldown = power && cdEndsAt > now;
          const remainingMs = onCooldown ? cdEndsAt - now : 0;
          const usingGcd = gcdEndsAt >= pcEndsAt;
          const totalMs = usingGcd ? (gcdTotalMsRef.current || 1) : (power?.cooldown ?? 1) * 1000;
          const fraction = onCooldown ? remainingMs / totalMs : 0;
          const revealedDeg = (1 - fraction) * 360;
          const cdSecs = (onCooldown && totalMs > 2000) ? Math.ceil(remainingMs / 1000) : null;

          return (
            <div
              key={slot}
              style={{...styles.actionButton, ...(flashSlot === i ? styles.actionButtonFlash : {}), cursor: power ? "pointer" : "default", opacity: (inRange && isFacing) ? 1 : 0.3}}
              title={power?.name}
              onClick={power ? () => usePower(i) : undefined}
            >
              {iconUrl && <img src={iconUrl} alt={power.name} style={styles.actionIcon}/>}
              {onCooldown && (
                <div style={{
                  position: "absolute", inset: 0, borderRadius: 4, pointerEvents: "none",
                  background: `conic-gradient(from -90deg, transparent ${revealedDeg}deg, rgba(0,0,0,0.65) ${revealedDeg}deg)`,
                }}/>
              )}
              {cdSecs && (
                <div style={styles.actionCooldownOverlay}>
                  <span style={styles.actionCooldownText}>{cdSecs}</span>
                </div>
              )}
              <span style={styles.actionKeybind}>{key}</span>
            </div>
          );
        })}
      </div>
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
