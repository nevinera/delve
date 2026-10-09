import {useState} from "react";
import EditModal from "./EditModal";
import ContentAdder from "./ContentAdder";
import ItemLevel from "./ItemLevel";
import {addItemToZone, createItem, itemData, itemKeys} from "../state/itemOps";
import {libraryItems, prepareItemImport} from "../state/importing";
import {
  chainColor, completionFlag, deleteQuest, followUps, prerequisites, questChains, questChoices, questData,
  renameQuest, updateQuest, worldQuests,
} from "../state/questOps";

const OBJECTIVE_TYPES = ["talk", "kill", "reach"];
// A new or re-zoned objective's blank required fields, by type.
const TYPE_FIELDS = {talk: {ncu: ""}, kill: {unitType: ""}, reach: {}};

// Drops unset fields (null or undefined), so the quests file only holds
// what's set. A blank required field stays, for Validate to point at.
function compact(object) {
  return Object.fromEntries(Object.entries(object).filter(([, value]) => value !== null && value !== undefined));
}

// optional: clearing it unsets the field rather than leaving "".
function Text({value, onChange, placeholder, multiline = false, optional = false}) {
  const props = {value: value ?? "", placeholder, onChange: (e) => onChange(optional && e.target.value === "" ? undefined : e.target.value)};
  return multiline ? <textarea rows={3} {...props} /> : <input type="text" {...props} />;
}

function Choice({value, options, onChange, blank = "—"}) {
  return (
    <select value={value ?? ""} onChange={(e) => onChange(e.target.value || null)}>
      <option value="">{blank}</option>
      {options.map(({value: v, label}) => <option key={v} value={v}>{label}</option>)}
    </select>
  );
}

const zoneOptions = (choices) => choices.map((zone) => ({value: zone.key, label: zone.name}));
const zoneOf = (choices, key) => choices.find((zone) => zone.key === key);
const ncuOptions = (zone, map = null) => (zone?.maps ?? [])
  .filter((m) => !map || m.key === map)
  .flatMap((m) => m.ncus.map((ncu) => ({value: ncu.identifier, label: map ? ncu.name : `${ncu.name} (${m.name})`})));

// A zone, then an NCU in it: {zone, ncu}.
function NcuPicker({value, choices, onChange}) {
  const zone = zoneOf(choices, value?.zone);
  return (
    <span className="quest-pair">
      <Choice value={value?.zone} options={zoneOptions(choices)} blank="Zone…" onChange={(z) => onChange({zone: z ?? "", ncu: ""})} />
      <Choice value={value?.ncu} options={ncuOptions(zone)} blank="NCU…" onChange={(ncu) => onChange({zone: value?.zone ?? "", ncu: ncu ?? ""})} />
    </span>
  );
}

function FlagList({flags, onChange, quests, allowQuests}) {
  const [adding, setAdding] = useState("");
  const add = (flag) => {
    if (flag && !flags.includes(flag)) onChange([...flags, flag]);
    setAdding("");
  };
  const questOptions = quests.filter((q) => !flags.includes(completionFlag(q.identifier)))
    .map((q) => ({value: completionFlag(q.identifier), label: q.name || q.identifier}));
  return (
    <div className="quest-flags">
      {flags.map((flag) => (
        <span key={flag} className="quest-flag">
          <code>{flag}</code>
          <button type="button" aria-label={`Remove ${flag}`} onClick={() => onChange(flags.filter((f) => f !== flag))}>✕</button>
        </span>
      ))}
      <span className="quest-pair">
        {allowQuests && <Choice value="" options={questOptions} blank="Completed quest…" onChange={add} />}
        <input type="text" value={adding} placeholder="type/identifier" onChange={(e) => setAdding(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              add(adding.trim());
            }
          }} />
        <button type="button" className="add-entry" disabled={!adding.trim()} onClick={() => add(adding.trim())}>Add</button>
      </span>
    </div>
  );
}

function ObjectiveFields({objective, choices, onChange, onRemove}) {
  const zone = zoneOf(choices, objective.zone);
  const set = (fields) => onChange(compact({...objective, ...fields}));
  const target = objective.unit !== undefined ? "unit" : "unitType";
  const units = (zone?.maps ?? []).filter((m) => !objective.map || m.key === objective.map).flatMap((m) => m.units)
    .map((unit) => ({value: unit.identifier, label: `${unit.identifier} (${unit.unitType})`}));
  return (
    <li className="quest-objective">
      <span className="quest-pair">
        <Choice value={objective.type} options={OBJECTIVE_TYPES.map((t) => ({value: t, label: t}))} blank="Type…"
          onChange={(type) => onChange(compact({type: type ?? "", text: objective.text, zone: objective.zone, map: objective.map, ...TYPE_FIELDS[type]}))} />
        <Text value={objective.text} placeholder="What the quest log says" onChange={(text) => set({text})} />
        <button type="button" aria-label="Remove objective" onClick={onRemove}>✕</button>
      </span>
      <span className="quest-pair">
        <Choice value={objective.zone} options={zoneOptions(choices)} blank="Zone…"
          onChange={(z) => onChange(compact({type: objective.type, text: objective.text, zone: z ?? "", count: objective.count, ...TYPE_FIELDS[objective.type]}))} />
        <Choice value={objective.map} options={(zone?.maps ?? []).map((m) => ({value: m.key, label: m.name}))}
          blank={objective.type === "reach" ? "Anywhere in the zone" : "Any map"} onChange={(map) => set({map})} />
      </span>
      {objective.type === "talk" && (
        <span className="quest-pair">
          <Choice value={objective.ncu} options={ncuOptions(zone, objective.map)} blank="NCU…" onChange={(ncu) => set({ncu: ncu ?? ""})} />
        </span>
      )}
      {objective.type === "kill" && (
        <span className="quest-pair">
          <Choice value={target} options={[{value: "unitType", label: "Any of a unit type"}, {value: "unit", label: "A specific unit"}]}
            blank="Kill…" onChange={(kind) => set(kind === "unit" ? {unit: "", unitType: undefined} : {unit: undefined, unitType: ""})} />
          {target === "unitType"
            ? <Choice value={objective.unitType} options={(zone?.unitTypes ?? []).map((t) => ({value: t.key, label: t.name}))}
              blank="Unit type…" onChange={(unitType) => set({unitType: unitType ?? ""})} />
            : <Choice value={objective.unit} options={units} blank="Unit…" onChange={(unit) => set({unit: unit ?? ""})} />}
          <label>
            Count <input type="number" min={1} value={objective.count ?? 1}
              onChange={(e) => set({count: Number(e.target.value) > 1 ? Number(e.target.value) : undefined})} />
          </label>
        </span>
      )}
    </li>
  );
}

// A reward: any of the world's items (items), awarded from a zone, which
// gets the item in its items when picked (see addItemToZone).
function RewardFields({reward, choices, items, onChange, onRemove}) {
  return (
    <li className="quest-pair">
      <Choice value={reward.zone} options={zoneOptions(choices)} blank="Zone…" onChange={(z) => onChange({...reward, zone: z ?? ""})} />
      <Choice value={reward.item} options={items} blank="Item…" onChange={(item) => onChange({...reward, item: item ?? ""})} />
      <button type="button" aria-label="Remove reward" onClick={onRemove}>✕</button>
    </li>
  );
}

function QuestLinks({label, identifiers, draft, onOpen}) {
  if (!identifiers.length) return null;
  return (
    <p className="quest-links">
      {label}:{" "}
      {identifiers.map((id, i) => (
        <span key={id}>
          {i > 0 && ", "}
          <button type="button" className="link-button" onClick={() => onOpen(id)}>{questData(draft, id)?.name || id}</button>
        </span>
      ))}
    </p>
  );
}

// The editor for one quest, as a popover over whatever level opened it
// (the quests page, an NCU on a map, another quest). Edits go straight
// into the draft; links to related quests swap it to that quest. Key it
// by the quest's identifier, so opening another quest starts afresh.
export default function QuestEditor({draft, quest: identifier, onChange, onOpenQuest, onClose, library = null, repo = null}) {
  const [renaming, setRenaming] = useState(identifier);
  const [error, setError] = useState(null);
  const [addingItem, setAddingItem] = useState(false);
  const [creatingItem, setCreatingItem] = useState(null); // a just-created item's key, open for editing
  const quest = questData(draft, identifier);
  if (!quest) {
    return <EditModal title="Quest" label="Quest" onDone={onClose}><p className="notice-error">No quest "{identifier}".</p></EditModal>;
  }
  const choices = questChoices(draft);
  const quests = worldQuests(draft).filter((q) => q.identifier !== identifier);
  const chains = questChains(draft);
  const set = (fields) => onChange(updateQuest(draft, identifier, compact({...quest, ...fields})));
  const items = itemKeys(draft).map((key) => ({value: key, label: itemData(draft, key)?.name || key}));
  // Rewards whose item the zone now needs in its items.
  const setRewards = (next) => {
    let updated = updateQuest(draft, identifier, compact({...quest, rewards: next.length ? next : undefined}));
    for (const reward of next) if (reward.zone && reward.item) updated = addItemToZone(updated, reward.zone, reward.item);
    onChange(updated);
  };
  const rewardZone = quest.offeredBy?.zone ?? "";
  const addReward = (item) => setRewards([...(quest.rewards ?? []), {zone: rewardZone, item}]);
  const attempt = (fn) => {
    try {
      setError(null);
      fn();
    } catch (e) {
      setError(e.message);
    }
  };
  const objectives = quest.objectives ?? [];
  const rewards = quest.rewards ?? [];
  const setAt = (list, i, value) => list.map((entry, j) => (j === i ? value : entry));

  return (
    <EditModal title={`Quest: ${quest.name || identifier}`} label={`Quest ${identifier}`} onDone={onClose}>
      <div className="quest-editor">
        {error && <p className="notice-error">{error}</p>}
        <QuestLinks label="Requires" identifiers={prerequisites(quest).filter((id) => questData(draft, id))} draft={draft} onOpen={onOpenQuest} />
        <QuestLinks label="Leads to" identifiers={followUps(draft, identifier)} draft={draft} onOpen={onOpenQuest} />
        <table>
          <tbody>
            <tr>
              <th>Identifier</th>
              <td className="quest-pair">
                <input type="text" value={renaming} onChange={(e) => setRenaming(e.target.value)} />
                <button type="button" className="add-entry" disabled={renaming === identifier}
                  onClick={() => attempt(() => {
                    onChange(renameQuest(draft, identifier, renaming));
                    onOpenQuest(renaming);
                  })}>Rename</button>
              </td>
            </tr>
            <tr><th>Name</th><td><Text value={quest.name} onChange={(name) => set({name})} /></td></tr>
            <tr>
              <th>Chain</th>
              <td className="quest-pair">
                <span className="quest-chain-badge" style={{background: chainColor(quest.chainIdentifier)}} />
                <Choice value={quest.chainIdentifier} options={chains.map((c) => ({value: c.identifier, label: c.name}))} blank="Chain…"
                  onChange={(chainIdentifier) => set({chainIdentifier, chainName: chains.find((c) => c.identifier === chainIdentifier)?.name})} />
                <Text value={quest.chainName} placeholder="Chain name" onChange={(chainName) => set({chainName})} />
                <button type="button" className="add-entry"
                  onClick={() => set({chainIdentifier: identifier, chainName: quest.name || identifier})}>New chain</button>
              </td>
            </tr>
            <tr><th>Offered by</th><td><NcuPicker value={quest.offeredBy} choices={choices} onChange={(offeredBy) => set({offeredBy})} /></td></tr>
            <tr><th>Option text</th><td><Text value={quest.offerText} placeholder="What the player says to start it" onChange={(offerText) => set({offerText})} /></td></tr>
            <tr><th>Description</th><td><Text multiline value={quest.description} placeholder="The NCU's reply; also the quest log text" onChange={(description) => set({description})} /></td></tr>
            <tr>
              <th>Marker</th>
              <td><label><input type="checkbox" checked={quest.marker === true} onChange={(e) => set({marker: e.target.checked || undefined})} /> Show a quest marker on the NCU</label></td>
            </tr>
            <tr>
              <th>Turn in to</th>
              <td>
                {quest.turnIn
                  ? <span className="quest-pair">
                    <NcuPicker value={quest.turnIn} choices={choices} onChange={(turnIn) => set({turnIn})} />
                    <button type="button" aria-label="No turn-in" onClick={() => set({turnIn: undefined, progressText: undefined, completionText: undefined})}>✕</button>
                  </span>
                  : <button type="button" className="add-entry" onClick={() => set({turnIn: {zone: "", ncu: ""}})}>Add a turn-in NCU</button>}
              </td>
            </tr>
            {quest.turnIn && (
              <>
                <tr><th>Progress text</th><td><Text multiline optional value={quest.progressText} onChange={(progressText) => set({progressText})} /></td></tr>
                <tr><th>Completion text</th><td><Text multiline optional value={quest.completionText} onChange={(completionText) => set({completionText})} /></td></tr>
              </>
            )}
            <tr>
              <th>Requires</th>
              <td><FlagList flags={quest.requiresFlags ?? []} quests={quests} allowQuests onChange={(requiresFlags) => set({requiresFlags: requiresFlags.length ? requiresFlags : undefined})} /></td>
            </tr>
            <tr>
              <th>Grants</th>
              <td><FlagList flags={quest.grantsFlags ?? []} quests={quests} onChange={(grantsFlags) => set({grantsFlags: grantsFlags.length ? grantsFlags : undefined})} /></td>
            </tr>
            <tr><th>Timer</th><td><Text optional value={quest.timer} placeholder="e.g. 90s or 5m (none if blank)" onChange={(timer) => set({timer})} /></td></tr>
          </tbody>
        </table>

        <h3>Objectives</h3>
        <ol className="quest-objectives">
          {objectives.map((objective, i) => (
            <ObjectiveFields key={i} objective={objective} choices={choices}
              onChange={(next) => set({objectives: setAt(objectives, i, next)})}
              onRemove={() => set({objectives: objectives.filter((_, j) => j !== i)})} />
          ))}
        </ol>
        <button type="button" className="add-entry" onClick={() => set({objectives: [...objectives, {type: "kill", text: "", zone: quest.offeredBy?.zone ?? "", unitType: ""}]})}>Add objective</button>

        <h3>Rewards</h3>
        <ul className="quest-rewards">
          {rewards.map((reward, i) => (
            <RewardFields key={i} reward={reward} choices={choices} items={items}
              onChange={(next) => setRewards(setAt(rewards, i, next))}
              onRemove={() => setRewards(rewards.filter((_, j) => j !== i))} />
          ))}
        </ul>
        <span className="quest-pair">
          <button type="button" className="add-entry" onClick={() => addReward("")}>Add reward</button>
          <button type="button" className="add-entry" aria-expanded={addingItem} onClick={() => setAddingItem((a) => !a)}>New item…</button>
        </span>
        {addingItem && (
          <div className="map-loot-item-popover quest-item-popover" role="dialog" aria-label="Add a new item">
            <ContentAdder
              noun="item" draft={draft} library={library} list={libraryItems} prepare={prepareItemImport} create={createItem}
              onChange={onChange}
              onAdded={(key) => {
                setAddingItem(false);
                onChange((current) => addItemToZone(updateQuest(current, identifier, {...quest, rewards: [...rewards, {zone: rewardZone, item: key}]}), rewardZone, key));
              }}
              onCreated={(key) => {
                setAddingItem(false);
                setCreatingItem(key);
              }}
            />
          </div>
        )}
        {creatingItem && (
          <EditModal title={`Item: ${itemData(draft, creatingItem)?.name || creatingItem}`} label={`Edit item ${creatingItem}`}
            onDone={() => {
              addReward(creatingItem);
              setCreatingItem(null);
            }}>
            <ItemLevel draft={draft} item={creatingItem} onChange={onChange} repo={repo} />
          </EditModal>
        )}

        <h3>Delete</h3>
        <button type="button" className="add-entry"
          onClick={() => attempt(() => {
            onChange(deleteQuest(draft, identifier));
            onClose();
          })}>Delete this quest</button>
      </div>
    </EditModal>
  );
}
