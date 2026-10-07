import { useEffect, useState } from "react";
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
  chain: {color: "#d4a84b", fontSize: 12, fontWeight: "bold", letterSpacing: 1, textTransform: "uppercase", margin: "4px 0 8px"},
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

// The player's active quests, grouped by chain (see game/quests.js's
// questLogChains), with each objective's progress, and a way to abandon.
export function QuestLog({open, chains = [], onAbandon, onClose, portrait = false, landscape = false}) {
  if (!open) return null;
  return (
    <div style={portrait ? styles.wrapperPortrait : landscape ? styles.wrapperLandscape : styles.wrapper}>
      <div style={(portrait || landscape) ? styles.scrollArea : styles.panel}>
        <div style={styles.header}>
          <span style={styles.title}>Quests</span>
          <button style={styles.close} aria-label="Close quests" onClick={onClose}>✕</button>
        </div>
        {chains.length === 0 ? (
          <div style={styles.empty}>No active quests.</div>
        ) : (
          chains.map((chain) => (
            <section key={chain.identifier}>
              <div style={styles.chain}>{chain.name}</div>
              {chain.quests.map((quest) => <QuestEntry key={quest.identifier} quest={quest} onAbandon={onAbandon} />)}
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

function QuestEntry({quest, onAbandon}) {
  const [confirming, setConfirming] = useState(false);
  return (
    <div style={styles.quest}>
      <div style={styles.name}>{quest.name}</div>
      <div style={styles.description}>{quest.description}</div>
      {quest.objectives.length > 0 && (
        <ul style={styles.objectives}>
          {quest.objectives.map((objective, i) => (
            <li key={i} style={objective.count >= objective.required ? styles.objectiveDone : styles.objective}>
              {objective.text}{objective.required > 1 || objective.count >= objective.required ? `: ${objective.count}/${objective.required}` : ""}
            </li>
          ))}
        </ul>
      )}
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
