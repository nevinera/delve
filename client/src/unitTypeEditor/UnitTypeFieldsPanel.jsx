import {humanize} from "../abilityEditor/abilityFormatting";
import {RESOURCE_TYPES} from "../resourceTypes";

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

function TokenImageUrlField({draft, onChange}) {
  const list = draft.tokenImageUrls;

  return (
    <div>
      {list.map((url, i) => (
        <div key={i} style={{display: "flex", gap: 6, marginBottom: 4}}>
          <input type="text" value={url} onChange={(e) => onChange(draft.updateTokenImage(i, e.target.value))} />
          <button type="button" className="remove-entry" onClick={() => onChange(draft.removeTokenImage(i))}>
            Remove
          </button>
        </div>
      ))}
      <button type="button" className="add-entry" onClick={() => onChange(draft.addTokenImage())}>
        + Add token image
      </button>
    </div>
  );
}

// A fixed list of resource types (see resourceTypes.js) plus "none" - the
// unit type just picks one and gets that preset's full ResourceType details
// (color/max/defaultValue/returnRate/isFluid), rather than hand-authoring
// them.
function ResourceTypeField({resource, draft, onChange}) {
  return (
    <select value={resource?.name ?? ""} onChange={(e) => onChange(draft.setResourceType(e.target.value))}>
      <option value="">None</option>
      {RESOURCE_TYPES.map((r) => <option key={r.id} value={r.id}>{humanize(r.name)}</option>)}
    </select>
  );
}

function TargetingField({targeting, draft, onChange}) {
  return (
    <select value={targeting?.type ?? "aggroTable"} onChange={(e) => onChange(draft.setTargetingType(e.target.value))}>
      {TARGETING_TYPES.map((t) => <option key={t} value={t}>{humanize(t)}</option>)}
    </select>
  );
}

function PowerNameSelect({value, names, onChange}) {
  return (
    <select value={value ?? ""} onChange={(e) => onChange(e.target.value)}>
      <option value="">— select a power —</option>
      {names.map((n) => <option key={n} value={n}>{n}</option>)}
    </select>
  );
}

function RotationPowersList({tactics, names, draft, onChange}) {
  const powers = tactics.powers ?? [];

  return (
    <div>
      {powers.map((name, i) => (
        <div className="entry-heading-row" key={i}>
          <PowerNameSelect value={name} names={names} onChange={(v) => onChange(draft.updateRotationPower(i, v))} />
          <button type="button" className="remove-entry" onClick={() => onChange(draft.removeRotationPower(i))}>
            Remove
          </button>
        </div>
      ))}
      <button
        type="button" className="add-entry" disabled={!names.length}
        onClick={() => onChange(draft.addRotationPower(names[0] ?? ""))}
      >
        + Add power to rotation
      </button>
    </div>
  );
}

function ScriptedFields({tactics, names, draft, onChange}) {
  const events = tactics.events ?? [];

  return (
    <div>
      <label>
        Duration (seconds)
        <NumberField value={tactics.duration} onChange={(v) => onChange(draft.setTacticsDuration(v))} />
      </label>
      {events.map((event, i) => (
        <div className="entry-heading-row" key={i}>
          <PowerNameSelect value={event.power} names={names} onChange={(v) => onChange(draft.updateScriptedEvent(i, "power", v))} />
          <NumberField value={event.at} onChange={(v) => onChange(draft.updateScriptedEvent(i, "at", v ?? 0))} />
          <button type="button" className="remove-entry" onClick={() => onChange(draft.removeScriptedEvent(i))}>
            Remove
          </button>
        </div>
      ))}
      <button
        type="button" className="add-entry" disabled={!names.length}
        onClick={() => onChange(draft.addScriptedEvent(names[0] ?? ""))}
      >
        + Add event
      </button>
    </div>
  );
}

function TacticsFields({tactics, currentNames, draft, onChange}) {
  const current = tactics ?? {type: "randomAvailable"};

  return (
    <div>
      <select value={current.type} onChange={(e) => onChange(draft.setTacticsType(e.target.value))}>
        {TACTICS_TYPES.map((type) => <option key={type} value={type}>{humanize(type)}</option>)}
      </select>

      {(current.type === "rotation" || current.type === "priorityRotation") && (
        <RotationPowersList tactics={current} names={currentNames} draft={draft} onChange={onChange} />
      )}
      {current.type === "scripted" && <ScriptedFields tactics={current} names={currentNames} draft={draft} onChange={onChange} />}
    </div>
  );
}

function PowersList({powers, availableAbilities, draft, onChange}) {
  const abilityKeys = Object.keys(availableAbilities).sort();
  const list = powers ?? [];

  return (
    <div>
      {list.map((entry, i) => {
        const selectedKey = draft.abilityKeyForPower(i) ?? "";
        return (
          <div className="entry-block" key={i}>
            <div className="entry-heading-row">
              <h3>Power {i + 1}</h3>
              <button type="button" className="remove-entry" onClick={() => onChange(draft.removePower(i))}>
                Remove
              </button>
            </div>
            <select value={selectedKey} onChange={(e) => onChange(draft.setPower(i, e.target.value))}>
              <option value="">— select an ability —</option>
              {abilityKeys.map((key) => <option key={key} value={key}>{key}</option>)}
            </select>
          </div>
        );
      })}
      <div className="add-buttons-row">
        <button
          type="button" className="add-entry" disabled={!abilityKeys.length}
          onClick={() => onChange(draft.addPower(abilityKeys[0]))}
        >
          + Add power
        </button>
      </div>
    </div>
  );
}

// Purely presentational - every domain rule (tactics placeholder shapes,
// power-ref math, rotation/scripted list editing) lives on UnitTypeDraft
// now; this just renders draft's current values and calls its mutator
// methods.
export default function UnitTypeFieldsPanel({draft, availableAbilities, newAbilityUrl, onRefreshAbilities, refreshStatus, onChange}) {
  const unitTypeData = draft.data;
  const names = draft.currentPowerNames(availableAbilities);

  function setField(field) {
    return (value) => onChange(draft.setField(field, value));
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
          <tr><th>Targeting</th><td><TargetingField targeting={unitTypeData.targeting} draft={draft} onChange={onChange} /></td></tr>
        </tbody>
      </table>

      <h3>Token images</h3>
      <TokenImageUrlField draft={draft} onChange={onChange} />

      <h3>Resource</h3>
      <ResourceTypeField resource={unitTypeData.resource} draft={draft} onChange={onChange} />

      <h3>Tactics</h3>
      <TacticsFields tactics={unitTypeData.tactics} currentNames={names} draft={draft} onChange={onChange} />

      <h3>Powers</h3>
      <p className="new-ability-link">
        <a href={newAbilityUrl} target="_blank" rel="noreferrer">+ New ability</a>{" "}
        <button type="button" className="refresh-abilities" onClick={onRefreshAbilities}>Refresh abilities</button>{" "}
        {refreshStatus}
      </p>
      <PowersList powers={unitTypeData.powers} availableAbilities={availableAbilities} draft={draft} onChange={onChange} />
    </div>
  );
}
