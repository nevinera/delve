import { useState } from "react";
import { hasDialogue, pickEntryNodeId } from "./game/dialogue";

// Walks a branching dialogue tree (docs/schema/ncu.md#dialogue) node by
// node. Keyed by the speaking unit's id by the caller (see App.jsx's
// key={dialogueNcuId}), so talking to someone new remounts this component -
// the lazy useState initializer below re-picks a random entry node each time.
//
// The quests the NCU offers ({identifier, offerText, description, marker})
// and the active quests it takes turned in ({identifier, name, ready,
// text}) are top-level options, listed under the opening line (or alone,
// for an NCU with no dialogue). An offer's option is its offerText (with a
// marker glyph only for marker quests); picking it starts the quest, and
// the NCU replies with its description. Picking a turn-in shows its text,
// to complete when it's ready.
export function DialogueWindow({ name, dialogue, offers = [], turnIns = [], onAcceptQuest, onTurnInQuest, onClose }) {
  const [entryNodeId] = useState(() => (hasDialogue(dialogue) ? pickEntryNodeId(dialogue) : null));
  const [currentNodeId, setCurrentNodeId] = useState(entryNodeId);
  const [questId, setQuestId] = useState(null);
  // Started here, so hidden before the server's new offers arrive.
  const [started, setStarted] = useState(() => new Map());
  const node = dialogue?.nodes?.[currentNodeId];
  const reply = started.get(questId);
  const turnIn = turnIns.find((t) => t.identifier === questId);
  const openOffers = offers.filter((offer) => !started.has(offer.identifier));
  const atTop = currentNodeId === entryNodeId;
  if (!node && !reply && !turnIn && !(atTop && (openOffers.length || turnIns.length))) return null;

  const startQuest = (offer) => {
    onAcceptQuest?.(offer.identifier);
    setStarted((current) => new Map(current).set(offer.identifier, offer.description));
    setQuestId(offer.identifier);
  };

  return (
    <div className="game-dialogue" role="dialog" aria-label={name}>
      <div className="game-window-header game-dialogue-header">
        <span className="game-window-title">{name}</span>
        <button className="game-window-close" onClick={onClose} aria-label="Close">✕</button>
      </div>
      {reply !== undefined ? (
        <>
          <p className="game-dialogue-line">{reply}</p>
          <div className="game-dialogue-options">
            <button className="game-dialogue-option" onClick={() => setQuestId(null)}>Back</button>
          </div>
        </>
      ) : turnIn ? (
        <QuestTurnIn quest={turnIn} onComplete={() => { onTurnInQuest?.(turnIn.identifier); onClose(); }} onBack={() => setQuestId(null)} />
      ) : (
        <>
          {node && <p className="game-dialogue-line">{node.text}</p>}
          <div className="game-dialogue-options">
            {atTop && openOffers.map((offer) => (
              <button key={offer.identifier} className={offer.marker ? "game-dialogue-option game-dialogue-option-quest" : "game-dialogue-option"} onClick={() => startQuest(offer)}>
                {offer.marker && "◆ "}{offer.offerText}
              </button>
            ))}
            {atTop && turnIns.map((t) => (
              <button key={t.identifier} className="game-dialogue-option game-dialogue-option-quest" onClick={() => setQuestId(t.identifier)}>
                {t.ready ? "✔" : "…"} {t.name}
              </button>
            ))}
            {node && <NodeButtons node={node} onNext={setCurrentNodeId} onClose={onClose} />}
            {!node && <button className="game-dialogue-option" onClick={onClose}>Goodbye</button>}
          </div>
        </>
      )}
    </div>
  );
}

function NodeButtons({ node, onNext, onClose }) {
  if (node.choices?.length) {
    return node.choices.map((choice, i) => (
      <button key={i} className="game-dialogue-option" onClick={choice.next ? () => onNext(choice.next) : onClose}>
        {choice.text}
      </button>
    ));
  }
  return (
    <button className="game-dialogue-option" onClick={node.next ? () => onNext(node.next) : onClose}>
      {node.next ? "Next" : "Goodbye"}
    </button>
  );
}

function QuestTurnIn({ quest, onComplete, onBack }) {
  return (
    <>
      <p className="game-dialogue-quest-name">{quest.name}</p>
      {quest.text && <p className="game-dialogue-line">{quest.text}</p>}
      <div className="game-dialogue-options">
        {quest.ready && <button className="game-dialogue-option game-dialogue-option-quest" onClick={onComplete}>Complete</button>}
        <button className="game-dialogue-option" onClick={onBack}>{quest.ready ? "Not now" : "Back"}</button>
      </div>
    </>
  );
}
