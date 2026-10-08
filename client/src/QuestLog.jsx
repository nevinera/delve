import { useEffect, useRef, useState } from "react";
import { timerRemaining } from "./game/quests";

const wrapperBase = {
  position: "fixed",
  zIndex: 25,
  background: "rgba(20,16,12,0.97)",
  border: "1px solid #7a5a2a",
  borderRadius: 6,
  display: "flex",
  flexDirection: "column",
  overflow: "hidden",
};

const styles = {
  wrapper: {position: "absolute", zIndex: 25, left: 20, top: "50%", transform: "translateY(-50%)", display: "flex", alignItems: "flex-start"},
  wrapperPortrait: {...wrapperBase, left: 8, right: 8, top: 100, bottom: 110 + 34},
  wrapperLandscape: {...wrapperBase, top: 16, left: 16, right: 16, bottom: 16},
  panel: {background: "rgba(20,16,12,0.97)", border: "1px solid #7a5a2a", borderRadius: 6, padding: "10px 16px 14px", width: 420, maxHeight: "70vh", overflowY: "auto", pointerEvents: "auto"},
  scrollArea: {flex: 1, minHeight: 0, overflowY: "auto", padding: "10px 16px 14px"},
  header: {display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10},
  title: {fontSize: 15, fontWeight: "bold", color: "#d4a84b", letterSpacing: 1, textTransform: "uppercase"},
  close: {background: "none", border: "none", color: "#aaa", cursor: "pointer", fontSize: 14},
  zone: {display: "flex", justifyContent: "space-between", width: "100%", background: "none", border: "none", borderBottom: "1px solid #3a2a14", color: "#d4a84b", fontSize: 12, fontWeight: "bold", letterSpacing: 1, textTransform: "uppercase", padding: "6px 0", cursor: "pointer", textAlign: "left"},
  zoneBody: {padding: "8px 0 4px"},
  map: {color: "#889", fontSize: 11},
  quest: {marginBottom: 14},
  name: {color: "#bfefff", fontWeight: "bold", fontSize: 14},
  description: {color: "#aaa", fontSize: 12, margin: "2px 0 6px", whiteSpace: "pre-wrap"},
  objectives: {listStyle: "none", margin: 0, padding: 0, fontSize: 13},
  objective: {color: "#e8e0d0"},
  objectiveDone: {color: "#7fbf7f"},
  timer: {color: "#c9b98a", fontSize: 12, marginTop: 4},
  actions: {display: "flex", gap: 6, marginTop: 6},
  button: {background: "#3a2a14", color: "#e8d0a0", border: "1px solid #7a5a2a", borderRadius: 4, padding: "2px 10px", cursor: "pointer", fontSize: 12},
  empty: {color: "#889", fontStyle: "italic"},
};

// The player's quest log, by zone (see game/quests.js's questLogZones):
// each zone with something to do and its count. The current zone starts
// open; opening another fetches its name and map names from
// zonesUrl/<identifier>. Stays mounted while closed, so opened zones last
// until the page (or instance) changes.
export function QuestLog({open, zones = [], currentZone, currentNames, zonesUrl, onAbandon, onClose, portrait = false, landscape = false}) {
  const [opened, setOpened] = useState(() => new Set());
  const [names, setNames] = useState({});
  const requested = useRef(new Set());

  const toggle = (identifier) => {
    setOpened((current) => {
      const next = new Set(current);
      if (next.has(identifier)) next.delete(identifier);
      else next.add(identifier);
      return next;
    });
    if (identifier === currentZone || !zonesUrl || requested.current.has(identifier)) return;
    requested.current.add(identifier);
    fetch(`${zonesUrl}/${encodeURIComponent(identifier)}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(r)))
      .then((zone) => setNames((current) => ({...current, [identifier]: {maps: zone.map_names ?? {}}})))
      .catch(() => requested.current.delete(identifier));
  };

  if (!open) return null;
  const isOpen = (identifier) => (identifier === currentZone) !== opened.has(identifier);
  const namesFor = (identifier) => (identifier === currentZone ? currentNames : names[identifier]);
  return (
    <div style={portrait ? styles.wrapperPortrait : landscape ? styles.wrapperLandscape : styles.wrapper}>
      <div style={(portrait || landscape) ? styles.scrollArea : styles.panel}>
        <div style={styles.header}>
          <span style={styles.title}>Quests</span>
          <button style={styles.close} aria-label="Close quests" onClick={onClose}>✕</button>
        </div>
        {zones.length === 0 ? (
          <div style={styles.empty}>No active quests.</div>
        ) : (
          zones.map((zone) => (
            <section key={zone.identifier}>
              <button style={styles.zone} aria-expanded={isOpen(zone.identifier)} onClick={() => toggle(zone.identifier)}>
                <span>{isOpen(zone.identifier) ? "▾" : "▸"} {zone.name}</span>
                <span>{zone.count}</span>
              </button>
              {isOpen(zone.identifier) && (
                <div style={styles.zoneBody}>
                  {zone.quests.map((quest) => (
                    <QuestEntry key={quest.identifier} quest={quest} names={namesFor(zone.identifier)} onAbandon={onAbandon} />
                  ))}
                </div>
              )}
            </section>
          ))
        )}
      </div>
    </div>
  );
}

// Counts down a timed quest's remaining time, as m:ss.
function QuestTimer({seconds, startedAt}) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  const left = timerRemaining(seconds, startedAt ?? now, now);
  return <div style={styles.timer}>Time left: {Math.floor(left / 60)}:{String(left % 60).padStart(2, "0")}</div>;
}

// One quest's entries in a zone: its unfinished objectives there, or that
// it's ready to turn in there. names ({maps, ncus}) names things in the
// zone, when known.
function QuestEntry({quest, names, onAbandon}) {
  const [confirming, setConfirming] = useState(false);
  return (
    <div style={styles.quest}>
      <div style={styles.name}>{quest.name}</div>
      {quest.description && <div style={styles.description}>{quest.description}</div>}
      <ul style={styles.objectives}>
        {quest.objectives.map((objective) => (
          <li key={objective.hash} style={styles.objective}>
            {objective.text}{objective.required > 1 ? `: ${objective.count}/${objective.required}` : ""}
            {objective.map && <span style={styles.map}> ({names?.maps?.[objective.map] ?? objective.map})</span>}
          </li>
        ))}
        {quest.turnIn && (
          <li style={styles.objectiveDone}>
            Ready to turn in{names?.ncus?.[quest.turnIn] ? ` to ${names.ncus[quest.turnIn]}` : ""}
          </li>
        )}
      </ul>
      {quest.timerSeconds && <QuestTimer seconds={quest.timerSeconds} startedAt={quest.timerStartedAt} />}
      <div style={styles.actions}>
        {confirming ? (
          <>
            <button style={styles.button} onClick={() => onAbandon?.(quest.identifier)}>Abandon {quest.name}</button>
            <button style={styles.button} onClick={() => setConfirming(false)}>Keep it</button>
          </>
        ) : (
          <button style={styles.button} onClick={() => setConfirming(true)}>Abandon</button>
        )}
      </div>
    </div>
  );
}
