import { useState } from "react";
import { hasDialogue, pickEntryNodeId } from "./game/dialogue";

// Walks a branching dialogue tree (docs/schema/ncu.md#dialogue) node by
// node. Keyed by the speaking unit's id by the caller (see App.jsx's
// key={dialogueNcuId}), so talking to someone new remounts this component -
// the lazy useState initializer below re-picks a random entry node each time.
//
// The quests the NCU offers ({identifier, name, offerText}) and the active
// quests it takes turned in ({identifier, name, ready, text}) are top-level
// options, listed under the opening line (or alone, for an NCU with no
// dialogue). Picking an offer shows its offerText, to accept or put off;
// picking a turn-in shows its text, to complete when it's ready.
export function DialogueWindow({ name, dialogue, offers = [], turnIns = [], onAcceptQuest, onTurnInQuest, onClose }) {
  const [entryNodeId] = useState(() => (hasDialogue(dialogue) ? pickEntryNodeId(dialogue) : null));
  const [currentNodeId, setCurrentNodeId] = useState(entryNodeId);
  const [questId, setQuestId] = useState(null);
  const node = dialogue?.nodes?.[currentNodeId];
  const quest = offers.find((offer) => offer.identifier === questId);
  const turnIn = turnIns.find((t) => t.identifier === questId);
  const atTop = currentNodeId === entryNodeId;
  if (!node && !quest && !turnIn && !(atTop && (offers.length || turnIns.length))) return null;

  return (
    <div style={styles.window} role="dialog" aria-label={name}>
      <div style={styles.header}>
        <span style={styles.title}>{name}</span>
        <button style={styles.close} onClick={onClose} aria-label="Close">✕</button>
      </div>
      {quest ? (
        <QuestOffer quest={quest} onAccept={() => { onAcceptQuest?.(quest.identifier); onClose(); }} onBack={() => setQuestId(null)} />
      ) : turnIn ? (
        <QuestTurnIn quest={turnIn} onComplete={() => { onTurnInQuest?.(turnIn.identifier); onClose(); }} onBack={() => setQuestId(null)} />
      ) : (
        <>
          {node && <p style={styles.line}>{node.text}</p>}
          <div style={styles.footer}>
            {atTop && offers.map((offer) => (
              <button key={offer.identifier} style={styles.quest} onClick={() => setQuestId(offer.identifier)}>
                ◆ {offer.name}
              </button>
            ))}
            {atTop && turnIns.map((t) => (
              <button key={t.identifier} style={styles.quest} onClick={() => setQuestId(t.identifier)}>
                {t.ready ? "✔" : "…"} {t.name}
              </button>
            ))}
            {node && <NodeButtons node={node} onNext={setCurrentNodeId} onClose={onClose} />}
            {!node && <button style={styles.next} onClick={onClose}>Goodbye</button>}
          </div>
        </>
      )}
    </div>
  );
}

function NodeButtons({ node, onNext, onClose }) {
  if (node.choices?.length) {
    return node.choices.map((choice, i) => (
      <button key={i} style={styles.next} onClick={choice.next ? () => onNext(choice.next) : onClose}>
        {choice.text}
      </button>
    ));
  }
  return (
    <button style={styles.next} onClick={node.next ? () => onNext(node.next) : onClose}>
      {node.next ? "Next" : "Goodbye"}
    </button>
  );
}

function QuestOffer({ quest, onAccept, onBack }) {
  return (
    <>
      <p style={styles.questName}>{quest.name}</p>
      <p style={styles.line}>{quest.offerText}</p>
      <div style={styles.footer}>
        <button style={styles.quest} onClick={onAccept}>Accept</button>
        <button style={styles.next} onClick={onBack}>Not now</button>
      </div>
    </>
  );
}

function QuestTurnIn({ quest, onComplete, onBack }) {
  return (
    <>
      <p style={styles.questName}>{quest.name}</p>
      {quest.text && <p style={styles.line}>{quest.text}</p>}
      <div style={styles.footer}>
        {quest.ready && <button style={styles.quest} onClick={onComplete}>Complete</button>}
        <button style={styles.next} onClick={onBack}>{quest.ready ? "Not now" : "Back"}</button>
      </div>
    </>
  );
}

const styles = {
  window: {
    position: "absolute",
    zIndex: 20,
    left: "50%",
    bottom: "22%",
    transform: "translateX(-50%)",
    width: "min(420px, calc(100% - 32px))",
    boxSizing: "border-box",
    background: "rgba(20,16,12,0.95)",
    border: "1px solid #7a5a2a",
    borderRadius: 6,
    padding: "10px 16px 12px",
    pointerEvents: "auto",
  },
  header: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 6,
  },
  title: {
    fontSize: 15,
    fontWeight: "bold",
    color: "#d4a84b",
    letterSpacing: 1,
    textTransform: "uppercase",
  },
  close: {
    background: "none",
    border: "none",
    color: "#888",
    fontSize: 16,
    cursor: "pointer",
    lineHeight: 1,
    padding: "0 2px",
  },
  line: {
    color: "#e8e0d0",
    fontSize: 15,
    lineHeight: 1.4,
    margin: "4px 0 10px",
    whiteSpace: "pre-wrap",
  },
  footer: {
    display: "flex",
    flexDirection: "column",
    alignItems: "flex-end",
    gap: 6,
  },
  questName: {
    color: "#7fe0ff",
    fontSize: 14,
    fontWeight: "bold",
    margin: "4px 0 0",
  },
  quest: {
    background: "#14303a",
    color: "#bfefff",
    border: "1px solid #3f8fa8",
    borderRadius: 4,
    padding: "4px 14px",
    cursor: "pointer",
    fontSize: 14,
  },
  next: {
    background: "#3a2a14",
    color: "#e8d0a0",
    border: "1px solid #7a5a2a",
    borderRadius: 4,
    padding: "4px 14px",
    cursor: "pointer",
    fontSize: 14,
  },
};
