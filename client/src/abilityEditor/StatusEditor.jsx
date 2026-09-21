// Nested sub-editor for a PowerEffect's "status" field (see
// Validators::StatusValidator/StatusEffectValidator/AuraEffectValidator).
// `status` is a StatusDraft (or null, meaning this entry has no status
// yet) - reached from AbilityFieldsPanel via AbilityDraft#statusFor, the
// same "sub-model owned by the parent draft" pattern AbilityDraft itself
// follows from ItemDraft (see plans/editors-as-classes.md). Every mutation
// here calls a StatusDraft method and bubbles the resulting StatusDraft up
// through onChange - none of the domain rules (what a fresh aura/status
// effect starts as, the merge-vs-delete-on-null patch semantics) live in
// this component any more.

import {StockAssetPicker} from "./AbilityFieldsPanel";

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

// onChange(fields) - a partial patch, merged by StatusDraft#updateAuraEffect.
function AuraEffectFields({aura, onChange, onPickStock, onRemove, stockAssets}) {
  return (
    <div className="status-aura-effect-fields">
      <table>
        <tbody>
          <tr>
            <th>Source URL</th>
            <td>
              <TextField value={aura.sourceURL} onChange={(sourceURL) => onChange({sourceURL})} />
              <StockAssetPicker options={stockAssets} onPick={onPickStock} />
            </td>
          </tr>
          <tr><th>Scale</th><td><NumberField value={aura.scale} onChange={(scale) => onChange({scale})} /></td></tr>
          <tr><th>Opacity</th><td><NumberField value={aura.opacity} onChange={(opacity) => onChange({opacity})} /></td></tr>
          <tr><th>Color</th><td><TextField value={aura.color} onChange={(color) => onChange({color})} /></td></tr>
          <tr><th>Sprite columns</th><td><NumberField value={aura.spriteColumns} onChange={(spriteColumns) => onChange({spriteColumns})} /></td></tr>
          <tr><th>Sprite rows</th><td><NumberField value={aura.spriteRows} onChange={(spriteRows) => onChange({spriteRows})} /></td></tr>
          <tr><th>Sprite frame count</th><td><NumberField value={aura.spriteFrameCount} onChange={(spriteFrameCount) => onChange({spriteFrameCount})} /></td></tr>
          <tr><th>Sprite frame rate</th><td><NumberField value={aura.spriteFrameRate} onChange={(spriteFrameRate) => onChange({spriteFrameRate})} /></td></tr>
        </tbody>
      </table>
      <button type="button" className="remove-entry" onClick={onRemove}>Remove aura effect</button>
    </div>
  );
}

// onChange(fields) - a partial patch, merged (with delete-on-null) by
// StatusDraft#updateStatusEffect. onSetType(type) replaces the whole row
// with a fresh type-appropriate placeholder (StatusDraft#setStatusEffectType).
function StatusEffectRow({effect, onChange, onSetType, onRemove}) {
  return (
    <div className="status-effect-row">
      <LabeledField label="Type">
        <Select value={effect.type} options={STATUS_EFFECT_TYPES} onChange={onSetType} blankLabel="type" />
      </LabeledField>
      {effect.type === "stat" && (
        <>
          <LabeledField label="Stat">
            <Select value={effect.statName} options={STAT_NAMES} onChange={(statName) => onChange({statName})} blankLabel="stat" />
          </LabeledField>
          <LabeledField label="Modifier">
            <Select value={effect.modifierType} options={MODIFIER_TYPES} onChange={(modifierType) => onChange({modifierType})} blankLabel="modifier" />
          </LabeledField>
          <LabeledField label="Amount">
            <NumberField value={effect.amount} onChange={(amount) => onChange({amount})} />
          </LabeledField>
        </>
      )}
      {effect.type === "recurring" && (
        <>
          <LabeledField label="Tick rate (s/tick)">
            <NumberField value={effect.tickRate} onChange={(tickRate) => onChange({tickRate})} />
          </LabeledField>
          <LabeledField label="On tick">
            <Select value={effect.onTick} options={ON_TICK_OPTIONS} onChange={(onTick) => onChange({onTick})} blankLabel="on tick" />
          </LabeledField>
          <LabeledField label="Amount (per tick)">
            <NumberField value={effect.amount} onChange={(amount) => onChange({amount})} />
          </LabeledField>
          <LabeledField label="School">
            <Select value={effect.school ?? ""} options={SCHOOL_OPTIONS} onChange={(school) => onChange({school})} blankLabel="school" />
          </LabeledField>
        </>
      )}
      <button type="button" className="remove-entry" onClick={onRemove}>Remove</button>
    </div>
  );
}

function StatusEffectsList({effects, onAdd, onUpdate, onSetType, onRemove}) {
  return (
    <div className="status-effects-list">
      {effects.map((effect, i) => (
        <StatusEffectRow
          key={i}
          effect={effect}
          onChange={(fields) => onUpdate(i, fields)}
          onSetType={(type) => onSetType(i, type)}
          onRemove={() => onRemove(i)}
        />
      ))}
      <button type="button" className="add-entry" onClick={() => onAdd("stat")}>
        + Add status effect
      </button>
    </div>
  );
}

export default function StatusEditor({status, onChange, onAdd, stockAssets}) {
  if (status == null) {
    return (
      <button type="button" className="add-entry" onClick={onAdd}>
        + Add status
      </button>
    );
  }

  const value = status.data;
  const graphics = stockAssets?.graphics ?? EMPTY_STOCK_GRAPHICS;

  return (
    <div className="status-editor">
      <table>
        <tbody>
          <tr><th>Name</th><td><TextField value={value.name} onChange={(name) => onChange(status.setField("name", name))} /></td></tr>
          <tr><th>Short name</th><td><TextField value={value.shortName} onChange={(shortName) => onChange(status.setField("shortName", shortName))} /></td></tr>
          <tr><th>Description</th><td><TextField value={value.description} onChange={(description) => onChange(status.setField("description", description))} /></td></tr>
          <tr><th>Treat as</th><td><Select value={value.treatAs} options={TREAT_AS_OPTIONS} onChange={(treatAs) => onChange(status.setField("treatAs", treatAs))} blankLabel="treat as" /></td></tr>
          <tr><th>Stacking</th><td><Select value={value.stacking} options={STACKING_OPTIONS} onChange={(stacking) => onChange(status.setField("stacking", stacking))} blankLabel="stacking" /></td></tr>
          <tr><th>Max stacks</th><td><NumberField value={value.maxStacks} onChange={(maxStacks) => onChange(status.setField("maxStacks", maxStacks))} /></td></tr>
        </tbody>
      </table>

      <div className="status-aura-effect">
        <h4>Aura effect</h4>
        {value.auraEffect == null ? (
          <button type="button" className="add-entry" onClick={() => onChange(status.addAuraEffect())}>
            + Add aura effect
          </button>
        ) : (
          <AuraEffectFields
            aura={value.auraEffect}
            onChange={(fields) => onChange(status.updateAuraEffect(fields))}
            onPickStock={(name) => onChange(status.pickAuraStockGraphic(name, graphics))}
            onRemove={() => onChange(status.removeAuraEffect())}
            stockAssets={graphics}
          />
        )}
      </div>

      <div className="status-effects">
        <h4>Status effects</h4>
        <StatusEffectsList
          effects={status.effects}
          onAdd={(type) => onChange(status.addStatusEffect(type))}
          onUpdate={(i, fields) => onChange(status.updateStatusEffect(i, fields))}
          onSetType={(i, type) => onChange(status.setStatusEffectType(i, type))}
          onRemove={(i) => onChange(status.removeStatusEffect(i))}
        />
      </div>
    </div>
  );
}
