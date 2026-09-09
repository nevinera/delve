// Nested sub-editor for a PowerEffect's "status" field (see
// Validators::StatusValidator/StatusEffectValidator/AuraEffectValidator).
// Controlled like every other EntryField widget: `value`/`onChange(newStatus)`,
// composing a whole new status object on every change so it round-trips
// through abilityReducer's existing UPDATE_ENTRY_FIELD (entry.status =
// newStatus) with no reducer changes needed.

import {StockAssetPicker} from "./AbilityFieldsPanel";
import {graphicFieldsFor} from "./stockAssetFields";

const TREAT_AS_OPTIONS = ["buff", "debuff", "inherent"];
const STACKING_OPTIONS = ["extend", "replace", "stack"];
const STATUS_EFFECT_TYPES = ["stat", "recurring", "none"];
const MODIFIER_TYPES = ["multiply", "add"];
const ON_TICK_OPTIONS = ["heal", "harm"];
const SCHOOL_OPTIONS = ["", "physical", "magic"];

const EMPTY_STOCK_GRAPHICS = {};

// Mirrors Validators::StatusEffectValidator::STAT_NAMES (Tier 1 input stats
// followed by Tier 2 derived/output stats) - there's no existing
// client-side copy of this catalog to import from.
const STAT_NAMES = [
  "strength", "agility", "intellect", "stamina",
  "critRating", "hasteRating", "masteryRating", "versatilityRating", "defenceRating",
  "physicalCritChance", "magicCritChance",
  "physicalHaste", "magicHaste",
  "physicalAvoidance", "magicAvoidance",
  "physicalMitigation", "magicMitigation",
  "masteryValue", "maxHealth", "movementSpeed", "attackSpeed",
  "damageDone", "physicalDamageDone", "magicDamageDone",
  "healingDone", "healingTaken",
  "damageTaken", "physicalDamageTaken", "magicDamageTaken",
];

function newStatus() {
  return {name: "", shortName: "", treatAs: "buff", stacking: "replace", effects: []};
}

function placeholderStatusEffect(type) {
  switch (type) {
    case "recurring": return {type: "recurring", tickRate: 1.0, onTick: "heal", amount: 1.0};
    case "none": return {type: "none"};
    default: return {type: "stat", statName: "damageDone", modifierType: "multiply", amount: 1.0};
  }
}

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

// A number input has no readable placeholder (Chrome/Firefox both hide it
// once there's a value, and a bare row of unlabeled number boxes is
// meaningless at a glance either way) - wrap it with a real visible label
// instead, same as every field elsewhere in the editor gets via a table's <th>.
function LabeledField({label, children}) {
  return (
    <label className="status-effect-field">
      <span className="status-effect-field-label">{label}</span>
      {children}
    </label>
  );
}

function Select({value, options, onChange, blankLabel = "—"}) {
  return (
    <select value={value ?? ""} onChange={(e) => onChange(e.target.value === "" ? null : e.target.value)}>
      {options.map((option) => (
        <option key={option || "(none)"} value={option}>{option === "" ? blankLabel : option}</option>
      ))}
    </select>
  );
}

function AuraEffectFields({aura, onChange, onRemove, stockAssets}) {
  function patch(fields) {
    onChange({...aura, ...fields});
  }

  return (
    <div className="status-aura-effect-fields">
      <table>
        <tbody>
          <tr>
            <th>Source URL</th>
            <td>
              <TextField value={aura.sourceURL} onChange={(sourceURL) => patch({sourceURL})} />
              <StockAssetPicker options={stockAssets} onPick={(name) => patch(graphicFieldsFor(name, stockAssets[name]))} />
            </td>
          </tr>
          <tr><th>Scale</th><td><NumberField value={aura.scale} onChange={(scale) => patch({scale})} /></td></tr>
          <tr><th>Opacity</th><td><NumberField value={aura.opacity} onChange={(opacity) => patch({opacity})} /></td></tr>
          <tr><th>Color</th><td><TextField value={aura.color} onChange={(color) => patch({color})} /></td></tr>
          <tr><th>Sprite columns</th><td><NumberField value={aura.spriteColumns} onChange={(spriteColumns) => patch({spriteColumns})} /></td></tr>
          <tr><th>Sprite rows</th><td><NumberField value={aura.spriteRows} onChange={(spriteRows) => patch({spriteRows})} /></td></tr>
          <tr><th>Sprite frame count</th><td><NumberField value={aura.spriteFrameCount} onChange={(spriteFrameCount) => patch({spriteFrameCount})} /></td></tr>
          <tr><th>Sprite frame rate</th><td><NumberField value={aura.spriteFrameRate} onChange={(spriteFrameRate) => patch({spriteFrameRate})} /></td></tr>
        </tbody>
      </table>
      <button type="button" className="remove-entry" onClick={onRemove}>Remove aura effect</button>
    </div>
  );
}

function StatusEffectRow({effect, onChange, onRemove}) {
  function patch(fields) {
    const updated = {...effect};
    for (const [key, val] of Object.entries(fields)) {
      if (val === null) delete updated[key];
      else updated[key] = val;
    }
    onChange(updated);
  }

  return (
    <div className="status-effect-row">
      <LabeledField label="Type">
        <Select value={effect.type} options={STATUS_EFFECT_TYPES} onChange={(type) => onChange(placeholderStatusEffect(type))} blankLabel="type" />
      </LabeledField>
      {effect.type === "stat" && (
        <>
          <LabeledField label="Stat">
            <Select value={effect.statName} options={STAT_NAMES} onChange={(statName) => patch({statName})} blankLabel="stat" />
          </LabeledField>
          <LabeledField label="Modifier">
            <Select value={effect.modifierType} options={MODIFIER_TYPES} onChange={(modifierType) => patch({modifierType})} blankLabel="modifier" />
          </LabeledField>
          <LabeledField label="Amount">
            <NumberField value={effect.amount} onChange={(amount) => patch({amount})} />
          </LabeledField>
        </>
      )}
      {effect.type === "recurring" && (
        <>
          <LabeledField label="Tick rate (s/tick)">
            <NumberField value={effect.tickRate} onChange={(tickRate) => patch({tickRate})} />
          </LabeledField>
          <LabeledField label="On tick">
            <Select value={effect.onTick} options={ON_TICK_OPTIONS} onChange={(onTick) => patch({onTick})} blankLabel="on tick" />
          </LabeledField>
          <LabeledField label="Amount (per tick)">
            <NumberField value={effect.amount} onChange={(amount) => patch({amount})} />
          </LabeledField>
          <LabeledField label="School">
            <Select value={effect.school ?? ""} options={SCHOOL_OPTIONS} onChange={(school) => patch({school})} blankLabel="school" />
          </LabeledField>
        </>
      )}
      <button type="button" className="remove-entry" onClick={onRemove}>Remove</button>
    </div>
  );
}

function StatusEffectsList({effects, onChange}) {
  function updateAt(i, newEffect) {
    onChange(effects.map((effect, idx) => (idx === i ? newEffect : effect)));
  }
  function removeAt(i) {
    onChange(effects.filter((_, idx) => idx !== i));
  }

  return (
    <div className="status-effects-list">
      {effects.map((effect, i) => (
        <StatusEffectRow key={i} effect={effect} onChange={(newEffect) => updateAt(i, newEffect)} onRemove={() => removeAt(i)} />
      ))}
      <button type="button" className="add-entry" onClick={() => onChange([...effects, placeholderStatusEffect("stat")])}>
        + Add status effect
      </button>
    </div>
  );
}

export default function StatusEditor({value, onChange, stockAssets}) {
  if (value == null) {
    return (
      <button type="button" className="add-entry" onClick={() => onChange(newStatus())}>
        + Add status
      </button>
    );
  }

  function patch(fields) {
    const updated = {...value};
    for (const [key, val] of Object.entries(fields)) {
      if (val === null) delete updated[key];
      else updated[key] = val;
    }
    onChange(updated);
  }

  const graphics = stockAssets?.graphics ?? EMPTY_STOCK_GRAPHICS;

  return (
    <div className="status-editor">
      <table>
        <tbody>
          <tr><th>Name</th><td><TextField value={value.name} onChange={(name) => patch({name})} /></td></tr>
          <tr><th>Short name</th><td><TextField value={value.shortName} onChange={(shortName) => patch({shortName})} /></td></tr>
          <tr><th>Description</th><td><TextField value={value.description} onChange={(description) => patch({description})} /></td></tr>
          <tr><th>Treat as</th><td><Select value={value.treatAs} options={TREAT_AS_OPTIONS} onChange={(treatAs) => patch({treatAs})} blankLabel="treat as" /></td></tr>
          <tr><th>Stacking</th><td><Select value={value.stacking} options={STACKING_OPTIONS} onChange={(stacking) => patch({stacking})} blankLabel="stacking" /></td></tr>
          <tr><th>Max stacks</th><td><NumberField value={value.maxStacks} onChange={(maxStacks) => patch({maxStacks})} /></td></tr>
        </tbody>
      </table>

      <div className="status-aura-effect">
        <h4>Aura effect</h4>
        {value.auraEffect == null ? (
          <button type="button" className="add-entry" onClick={() => patch({auraEffect: {sourceURL: ""}})}>
            + Add aura effect
          </button>
        ) : (
          <AuraEffectFields
            aura={value.auraEffect}
            onChange={(auraEffect) => patch({auraEffect})}
            onRemove={() => patch({auraEffect: null})}
            stockAssets={graphics}
          />
        )}
      </div>

      <div className="status-effects">
        <h4>Status effects</h4>
        <StatusEffectsList effects={value.effects ?? []} onChange={(effects) => patch({effects})} />
      </div>
    </div>
  );
}
