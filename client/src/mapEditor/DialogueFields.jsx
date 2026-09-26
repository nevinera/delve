import {useState} from "react";
import {randomIdentifierSuffix} from "./randomIdentifier";

// Edits an NCU's `dialogue` (docs/schema/ncu.md#dialogue): a branching tree
// of nodes, keyed by an opaque id the author never sees or edits directly -
// only ever picked by its text preview, same "opaque id, friendly label"
// convention unit/NCU identifiers already use (see randomIdentifier.js).
// `entry` is an array of {node} objects rather than bare ids so a future
// flag condition has somewhere to land without a breaking schema change.
//
// Deleting a node auto-clears any dangling reference to it (from `entry`,
// or another node's `next`/`choices[].next`) rather than blocking the
// delete or requiring manual fixup first - same auto-reconciliation
// philosophy as zoneEditor/syncZoneRefs.js. A dead-end choice (its `next`
// cleared this way) is flagged in the UI so it doesn't look like a bug.
export function deleteDialogueNode(dialogue, nodeId) {
  const nodes = {...dialogue.nodes};
  delete nodes[nodeId];

  for (const [id, node] of Object.entries(nodes)) {
    if (node.next === nodeId) {
      nodes[id] = {...node, next: undefined};
    } else if (node.choices) {
      nodes[id] = {
        ...node,
        choices: node.choices.map((c) => (c.next === nodeId ? {...c, next: undefined} : c)),
      };
    }
  }

  return {entry: dialogue.entry.filter((e) => e.node !== nodeId), nodes};
}

function newNodeId(nodes) {
  let id = `node-${randomIdentifierSuffix()}`;
  while (Object.prototype.hasOwnProperty.call(nodes, id)) id = `node-${randomIdentifierSuffix()}`;
  return id;
}

function nodePreview(node) {
  const text = node?.text?.trim();
  return text ? (text.length > 40 ? `${text.slice(0, 40)}…` : text) : "(empty)";
}

function NextSelect({value, nodeIds, nodes, excludeId, onChange, ariaLabel}) {
  return (
    <select aria-label={ariaLabel} value={value ?? ""} onChange={(e) => onChange(e.target.value || undefined)}>
      <option value="">(end conversation)</option>
      {nodeIds.filter((id) => id !== excludeId).map((id) => (
        <option key={id} value={id}>{nodePreview(nodes[id])}</option>
      ))}
    </select>
  );
}

function ChoiceRow({choice, index, nodeIds, nodes, excludeId, onChangeText, onChangeNext, onRemove}) {
  return (
    <div className="map-dialogue-choice-row">
      <textarea
        rows={1} value={choice.text} aria-label={`Choice ${index + 1} text`}
        onChange={(e) => onChangeText(e.target.value)}
      />
      <NextSelect
        value={choice.next} nodeIds={nodeIds} nodes={nodes} excludeId={excludeId}
        onChange={onChangeNext} ariaLabel={`Choice ${index + 1} target`}
      />
      {!choice.next && <span className="map-dialogue-dead-end" title="This choice ends the conversation">(dead end)</span>}
      <button type="button" aria-label={`Remove choice ${index + 1}`} onClick={onRemove}>×</button>
    </div>
  );
}

function NodeCard({id, node, nodeIds, nodes, entry, onChangeText, onChangeNext, onSetChoices, onChangeChoice, onAddChoice, onRemoveChoice, onToggleEntry, onDelete}) {
  const [expanded, setExpanded] = useState(false);
  const mode = node.choices ? "choices" : "linear";

  return (
    <div className="entry-block map-dialogue-node">
      <div className="entry-heading-row" onClick={() => setExpanded((e) => !e)}>
        <span className="map-sidebar-section-toggle">{expanded ? "▾" : "▸"}</span>
        <span className="map-dialogue-node-preview">{nodePreview(node)}</span>
        {expanded && (
          <button type="button" className="remove-entry" onClick={(e) => { e.stopPropagation(); onDelete(); }}>
            Remove
          </button>
        )}
      </div>
      {expanded && (
        <div className="map-dialogue-node-body">
          <label>
            <input type="checkbox" checked={entry.some((e) => e.node === id)} onChange={() => onToggleEntry(id)} />
            {" "}Possible starting line
          </label>
          <textarea
            rows={2} value={node.text} aria-label="Node text"
            onChange={(e) => onChangeText(e.target.value)}
          />
          <div className="map-dialogue-mode">
            <label>
              <input type="radio" name={`mode-${id}`} checked={mode === "linear"} onChange={() => onChangeNext(node.next)} />
              {" "}Continues automatically
            </label>
            <label>
              <input type="radio" name={`mode-${id}`} checked={mode === "choices"} onChange={onSetChoices} />
              {" "}Player chooses
            </label>
          </div>
          {mode === "linear" ? (
            <NextSelect
              value={node.next} nodeIds={nodeIds} nodes={nodes} excludeId={id}
              onChange={onChangeNext} ariaLabel="Continues to"
            />
          ) : (
            <div className="map-dialogue-choices">
              {node.choices.map((choice, i) => (
                <ChoiceRow
                  key={i} choice={choice} index={i} nodeIds={nodeIds} nodes={nodes} excludeId={id}
                  onChangeText={(text) => onChangeChoice(i, "text", text)}
                  onChangeNext={(next) => onChangeChoice(i, "next", next)}
                  onRemove={() => onRemoveChoice(i)}
                />
              ))}
              <div className="add-buttons-row">
                <button type="button" className="add-entry" onClick={onAddChoice}>+ Add Choice</button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function DialogueFields({dialogue, onChange}) {
  const nodes = dialogue?.nodes ?? {};
  const entry = dialogue?.entry ?? [];
  const nodeIds = Object.keys(nodes);

  function write(nextDialogue) {
    onChange(Object.keys(nextDialogue.nodes).length ? nextDialogue : undefined);
  }

  function updateNode(id, fields) {
    write({...dialogue, nodes: {...nodes, [id]: {...nodes[id], ...fields}}});
  }

  function addNode() {
    const id = newNodeId(nodes);
    const nextDialogue = {
      entry: nodeIds.length === 0 ? [{node: id}] : entry,
      nodes: {...nodes, [id]: {text: ""}},
    };
    write(nextDialogue);
  }

  function toggleEntry(id) {
    const isEntry = entry.some((e) => e.node === id);
    write({...dialogue, entry: isEntry ? entry.filter((e) => e.node !== id) : [...entry, {node: id}]});
  }

  function removeNode(id) {
    write(deleteDialogueNode(dialogue, id));
  }

  return (
    <div className="map-ncu-dialogue">
      <h4>Dialogue</h4>
      {nodeIds.length === 0 && <p className="map-editor-sidebar-placeholder">No dialogue yet.</p>}
      {nodeIds.map((id) => (
        <NodeCard
          key={id} id={id} node={nodes[id]} nodeIds={nodeIds} nodes={nodes} entry={entry}
          onChangeText={(text) => updateNode(id, {text})}
          onChangeNext={(next) => updateNode(id, {next, choices: undefined})}
          onSetChoices={() => updateNode(id, {choices: nodes[id].choices ?? [{text: "", next: undefined}], next: undefined})}
          onChangeChoice={(i, field, value) => {
            const choices = nodes[id].choices.map((c, j) => (j === i ? {...c, [field]: value} : c));
            updateNode(id, {choices});
          }}
          onAddChoice={() => updateNode(id, {choices: [...nodes[id].choices, {text: "", next: undefined}]})}
          onRemoveChoice={(i) => updateNode(id, {choices: nodes[id].choices.filter((_, j) => j !== i)})}
          onToggleEntry={toggleEntry}
          onDelete={() => removeNode(id)}
        />
      ))}
      <div className="add-buttons-row">
        <button type="button" className="add-entry" onClick={addNode}>+ Add Node</button>
      </div>
    </div>
  );
}
