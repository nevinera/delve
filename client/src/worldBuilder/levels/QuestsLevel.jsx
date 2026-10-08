import {useMemo, useState} from "react";
import QuestGraphCanvas from "./QuestGraphCanvas";
import {chainColor, createQuest, questGraph, questPositions, questsFile, setQuestPositions, worldQuests} from "../state/questOps";

// Creates a quest by identifier, then opens it.
function NewQuestForm({draft, onChange, onOpenQuest}) {
  const [identifier, setIdentifier] = useState("");
  const [error, setError] = useState(null);
  function submit(e) {
    e.preventDefault();
    const key = identifier.trim();
    try {
      onChange(createQuest(draft, key));
      setIdentifier("");
      setError(null);
      onOpenQuest(key);
    } catch (err) {
      setError(err.message);
    }
  }
  return (
    <form className="quest-new" onSubmit={submit}>
      <input type="text" value={identifier} placeholder="new-quest-identifier" aria-label="New quest identifier" onChange={(e) => setIdentifier(e.target.value)} />
      <button type="submit" className="add-entry" disabled={!identifier.trim()}>New quest</button>
      {error && <p className="zone-list-error">{error}</p>}
    </form>
  );
}

// The world's quests: their graph (left) and a list by chain (right).
// Opening a quest shows its editor over the page (see QuestEditor).
export default function QuestsLevel({draft, onChange, onOpenQuest}) {
  const quests = worldQuests(draft);
  const graph = useMemo(() => questGraph(quests), [quests]);
  const chains = new Map();
  for (const quest of quests) {
    const key = quest.chainIdentifier ?? "";
    if (!chains.has(key)) chains.set(key, {identifier: key, name: quest.chainName || key, quests: []});
    chains.get(key).quests.push(quest);
  }
  const sortedChains = [...chains.values()].sort((a, b) => a.name.localeCompare(b.name));

  return (
    <>
      <div className="content-editor-left">
        <div className="content-editor-preview">
          <QuestGraphCanvas
            key={draft.snapshot.commitSha}
            graph={graph}
            initialPositions={questPositions(draft)}
            onPositionsChange={(positions) => onChange((current) => setQuestPositions(current, positions))}
            onOpenQuest={onOpenQuest}
          />
        </div>
      </div>
      <div className="content-editor-fields">
        <h3>Quests</h3>
        <p className="world-key">File: <code>{questsFile(draft)}</code></p>
        <NewQuestForm draft={draft} onChange={onChange} onOpenQuest={onOpenQuest} />
        {sortedChains.map((chain) => (
          <section key={chain.identifier} className="quest-chain">
            <h4><span className="quest-chain-badge" style={{background: chainColor(chain.identifier)}} /> {chain.name}</h4>
            <ul>
              {chain.quests.map((quest) => (
                <li key={quest.identifier}>
                  <button type="button" className="link-button" onClick={() => onOpenQuest(quest.identifier)}>
                    {quest.marker ? "◆ " : ""}{quest.name || quest.identifier}
                  </button>
                  {" "}<code>{quest.identifier}</code>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </>
  );
}
