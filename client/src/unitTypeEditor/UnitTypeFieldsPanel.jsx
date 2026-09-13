import {humanize} from "../editor/abilityFormatting";
import {abilityKeyForRef, refForAbilityKey} from "./abilityRefs";

const RESOURCE_FIELDS = [
  {key: "name", type: "text"},
  {key: "color", type: "text"},
  {key: "max", type: "number"},
  {key: "defaultValue", type: "number"},
  {key: "returnRate", type: "number"},
  {key: "isFluid", type: "checkbox"},
];

const TARGETING_TYPES = ["aggroTable", "nearest", "healerAggro"];
const BASIC_ATTACK_SCHOOLS = ["physical", "magic"];
const BASIC_ATTACK_STYLES = ["claw", "sword", "axe", "club", "arrow", "arcane", "ice", "nature", "fire"];

// "phased" is deliberately not offered here - no unit type uses it yet and
// the game server doesn't act on tactics at all currently, so there's
// nothing to gain from building its recursive phase-tree UI before it's
// needed. Validators::UnitTypeValidator still accepts it for hand-authored
// content.
const TACTICS_TYPES = ["randomAvailable", "rotation", "priorityRotation", "scripted"];

function TextField({value, onChange}) {
  return <input type="text" value={value ?? ""} onChange={(e) => onChange(e.target.value === "" ? null : e.target.value)} />;
}

function NumberField({value, onChange}) {
  return (
    <input
      type="number" step="any" value={value ?? ""}
      onChange={(e) => onChange(e.target.value === "" ? null : parseFloat(e.target.value))}
    />
  );
}

function OptionalSelect({value, options, onChange, blankLabel = "— default —"}) {
  return (
    <select value={value ?? ""} onChange={(e) => onChange(e.target.value === "" ? null : e.target.value)}>
      <option value="">{blankLabel}</option>
      {options.map((o) => <option key={o} value={o}>{humanize(o)}</option>)}
    </select>
  );
}

// A unit type's abilities are only ever attached by reference (see
// abilities/units/<key>/), same as a class's - no inline authoring here,
// so every power name a tactic can pick from comes from resolving each
// $ref against availableAbilities.
function currentPowerNames(unitTypeKey, powers, availableAbilities) {
  return (powers ?? [])
    .map((entry) => {
      const key = abilityKeyForRef(unitTypeKey, entry);
      return key && availableAbilities[key]?.ability?.name;
    })
    .filter(Boolean);
}

function TokenImageUrlField({urls, dispatch}) {
  const list = urls ?? [];

  function set(next) {
    dispatch({type: "SET_FIELD", field: "tokenImageUrl", value: next});
  }

  return (
    <div>
      {list.map((url, i) => (
        <div key={i} style={{display: "flex", gap: 6, marginBottom: 4}}>
          <input
            type="text" value={url}
            onChange={(e) => set(list.map((u, idx) => (idx === i ? e.target.value : u)))}
          />
          <button type="button" className="remove-entry" onClick={() => set(list.filter((_, idx) => idx !== i))}>
            Remove
          </button>
        </div>
      ))}
      <button type="button" className="add-entry" onClick={() => set([...list, ""])}>
        + Add token image
      </button>
    </div>
  );
}

function ResourceFields({resource, dispatch}) {
  const value = resource ?? {};

  function update(key, fieldValue) {
    dispatch({type: "SET_FIELD", field: "resource", value: {...value, [key]: fieldValue}});
  }

  return (
    <table>
      <tbody>
        {RESOURCE_FIELDS.map(({key, type}) => (
          <tr key={key}>
            <th>{humanize(key)}</th>
            <td>
              {type === "checkbox"
                ? <input type="checkbox" checked={Boolean(value[key])} onChange={(e) => update(key, e.target.checked)} />
                : type === "number"
                  ? <NumberField value={value[key]} onChange={(v) => update(key, v)} />
                  : <TextField value={value[key]} onChange={(v) => update(key, v)} />}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function TargetingField({targeting, dispatch}) {
  return (
    <select
      value={targeting?.type ?? "aggroTable"}
      onChange={(e) => dispatch({type: "SET_FIELD", field: "targeting", value: {type: e.target.value}})}
    >
      {TARGETING_TYPES.map((t) => <option key={t} value={t}>{humanize(t)}</option>)}
    </select>
  );
}

function blankTactics(type) {
  if (type === "rotation" || type === "priorityRotation") return {type, powers: []};
  if (type === "scripted") return {type: "scripted", duration: 1.0, events: []};
  return {type: "randomAvailable"};
}

function PowerNameSelect({value, names, onChange}) {
  return (
    <select value={value ?? ""} onChange={(e) => onChange(e.target.value)}>
      <option value="">— select a power —</option>
      {names.map((n) => <option key={n} value={n}>{n}</option>)}
    </select>
  );
}

function RotationPowersList({tactics, names, setTactics}) {
  const powers = tactics.powers ?? [];

  function update(i, value) {
    setTactics({...tactics, powers: powers.map((p, idx) => (idx === i ? value : p))});
  }

  return (
    <div>
      {powers.map((name, i) => (
        <div className="entry-heading-row" key={i}>
          <PowerNameSelect value={name} names={names} onChange={(v) => update(i, v)} />
          <button type="button" className="remove-entry" onClick={() => setTactics({...tactics, powers: powers.filter((_, idx) => idx !== i)})}>
            Remove
          </button>
        </div>
      ))}
      <button
        type="button" className="add-entry" disabled={!names.length}
        onClick={() => setTactics({...tactics, powers: [...powers, names[0] ?? ""]})}
      >
        + Add power to rotation
      </button>
    </div>
  );
}

function ScriptedFields({tactics, names, setTactics}) {
  const events = tactics.events ?? [];

  function updateEvent(i, field, value) {
    setTactics({...tactics, events: events.map((e, idx) => (idx === i ? {...e, [field]: value} : e))});
  }

  return (
    <div>
      <label>
        Duration (seconds)
        <NumberField value={tactics.duration} onChange={(v) => setTactics({...tactics, duration: v ?? 0})} />
      </label>
      {events.map((event, i) => (
        <div className="entry-heading-row" key={i}>
          <PowerNameSelect value={event.power} names={names} onChange={(v) => updateEvent(i, "power", v)} />
          <NumberField value={event.at} onChange={(v) => updateEvent(i, "at", v ?? 0)} />
          <button type="button" className="remove-entry" onClick={() => setTactics({...tactics, events: events.filter((_, idx) => idx !== i)})}>
            Remove
          </button>
        </div>
      ))}
      <button
        type="button" className="add-entry" disabled={!names.length}
        onClick={() => setTactics({...tactics, events: [...events, {power: names[0] ?? "", at: 0}]})}
      >
        + Add event
      </button>
    </div>
  );
}

function TacticsFields({tactics, currentNames, dispatch}) {
  const current = tactics ?? {type: "randomAvailable"};

  function setTactics(next) {
    dispatch({type: "SET_FIELD", field: "tactics", value: next});
  }

  return (
    <div>
      <select value={current.type} onChange={(e) => setTactics(blankTactics(e.target.value))}>
        {TACTICS_TYPES.map((type) => <option key={type} value={type}>{humanize(type)}</option>)}
      </select>

      {(current.type === "rotation" || current.type === "priorityRotation") && (
        <RotationPowersList tactics={current} names={currentNames} setTactics={setTactics} />
      )}
      {current.type === "scripted" && <ScriptedFields tactics={current} names={currentNames} setTactics={setTactics} />}
    </div>
  );
}

function PowersList({unitTypeKey, powers, availableAbilities, dispatch}) {
  const abilityKeys = Object.keys(availableAbilities).sort();
  const list = powers ?? [];

  function setPower(index, abilityKey) {
    const entry = {$ref: refForAbilityKey(unitTypeKey, abilityKey), referenceTo: "ability"};
    dispatch({type: "UPDATE_ENTRY_FIELDS", section: "powers", index, fields: entry});
  }

  return (
    <div>
      {list.map((entry, i) => {
        const selectedKey = abilityKeyForRef(unitTypeKey, entry) ?? "";
        return (
          <div className="entry-block" key={i}>
            <div className="entry-heading-row">
              <h3>Power {i + 1}</h3>
              <button type="button" className="remove-entry" onClick={() => dispatch({type: "REMOVE_ENTRY", section: "powers", index: i})}>
                Remove
              </button>
            </div>
            <select value={selectedKey} onChange={(e) => setPower(i, e.target.value)}>
              <option value="">— select an ability —</option>
              {abilityKeys.map((key) => <option key={key} value={key}>{key}</option>)}
            </select>
          </div>
        );
      })}
      <div className="add-buttons-row">
        <button
          type="button" className="add-entry" disabled={!abilityKeys.length}
          onClick={() => dispatch({type: "ADD_ENTRY", section: "powers", entry: {$ref: refForAbilityKey(unitTypeKey, abilityKeys[0]), referenceTo: "ability"}})}
        >
          + Add power
        </button>
      </div>
    </div>
  );
}

export default function UnitTypeFieldsPanel({unitTypeKey, unitTypeData, availableAbilities, newAbilityUrl, onRefreshAbilities, refreshStatus, dispatch}) {
  const names = currentPowerNames(unitTypeKey, unitTypeData.powers, availableAbilities);

  function setField(field) {
    return (value) => dispatch({type: "SET_FIELD", field, value});
  }

  return (
    <div className="fields-panel">
      <table>
        <tbody>
          <tr><th>Name</th><td><TextField value={unitTypeData.name} onChange={setField("name")} /></td></tr>
          <tr><th>Description</th><td><TextField value={unitTypeData.description} onChange={setField("description")} /></td></tr>
          <tr><th>Token radius (ft)</th><td><NumberField value={unitTypeData.tokenRadius} onChange={setField("tokenRadius")} /></td></tr>
          <tr><th>Speed factor</th><td><NumberField value={unitTypeData.speedFactor} onChange={setField("speedFactor")} /></td></tr>
          <tr><th>Aggro radius (ft)</th><td><NumberField value={unitTypeData.aggroRadius} onChange={setField("aggroRadius")} /></td></tr>
          <tr><th>Max HP</th><td><NumberField value={unitTypeData.maxHP} onChange={setField("maxHP")} /></td></tr>
          <tr><th>DPS</th><td><NumberField value={unitTypeData.dps} onChange={setField("dps")} /></td></tr>
          <tr><th>Attack speed</th><td><NumberField value={unitTypeData.attackSpeed} onChange={setField("attackSpeed")} /></td></tr>
          <tr><th>Basic attack range (ft)</th><td><NumberField value={unitTypeData.basicAttackRange} onChange={setField("basicAttackRange")} /></td></tr>
          <tr>
            <th>Basic attack school</th>
            <td><OptionalSelect value={unitTypeData.basicAttackSchool} options={BASIC_ATTACK_SCHOOLS} onChange={setField("basicAttackSchool")} /></td>
          </tr>
          <tr>
            <th>Basic attack style</th>
            <td><OptionalSelect value={unitTypeData.basicAttackStyle} options={BASIC_ATTACK_STYLES} onChange={setField("basicAttackStyle")} /></td>
          </tr>
          <tr><th>Targeting</th><td><TargetingField targeting={unitTypeData.targeting} dispatch={dispatch} /></td></tr>
        </tbody>
      </table>

      <h3>Token images</h3>
      <TokenImageUrlField urls={unitTypeData.tokenImageUrl} dispatch={dispatch} />

      <h3>Resource</h3>
      <ResourceFields resource={unitTypeData.resource} dispatch={dispatch} />

      <h3>Tactics</h3>
      <TacticsFields tactics={unitTypeData.tactics} currentNames={names} dispatch={dispatch} />

      <h3>Powers</h3>
      <p className="new-ability-link">
        <a href={newAbilityUrl} target="_blank" rel="noreferrer">+ New ability</a>{" "}
        <button type="button" className="refresh-abilities" onClick={onRefreshAbilities}>Refresh abilities</button>{" "}
        {refreshStatus}
      </p>
      <PowersList unitTypeKey={unitTypeKey} powers={unitTypeData.powers} availableAbilities={availableAbilities} dispatch={dispatch} />
    </div>
  );
}
