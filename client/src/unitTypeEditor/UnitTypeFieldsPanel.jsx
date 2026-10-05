import {humanize} from "../abilityEditor/abilityFormatting";
import {RESOURCE_TYPES} from "../resourceTypes";
import ImagePicker from "../content/ImagePicker";
import {TAG_CATEGORIES, TAG_DESCRIPTIONS, unitTargets, targetFit} from "../balanceTargets";

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

// Each slot is an ImagePicker over the host's token images (see
// UnitTypeWorkbench's tokenImages): pick one by sight, or upload a new one.
// Clearing a slot removes it.
function TokenImageUrlField({draft, onChange, tokenImages}) {
  return (
    <div className="token-image-slots">
      {draft.tokenImageUrls.map((url, i) => (
        <ImagePicker
          key={i}
          label={`Token image ${i + 1}`}
          value={url || undefined}
          url={url ? tokenImages.urlFor(url) : null}
          options={tokenImages.options}
          onUpload={tokenImages.upload}
          onChange={(value) => onChange(value ? draft.updateTokenImage(i, value) : draft.removeTokenImage(i))}
        />
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

function tagLabel(tag) {
  return TAG_DESCRIPTIONS[tag] ? `${tag} (${TAG_DESCRIPTIONS[tag]})` : tag;
}

// The balance tags docs/combat_balance.md's targets are keyed by: a select
// per exclusive category, a checkbox per role.
function BalanceTagFields({draft, onChange}) {
  const tags = draft.tags;
  return (
    <table className="balance-tags">
      <tbody>
        {TAG_CATEGORIES.map((category) => (
          <tr key={category.key}>
            <th>{category.label}</th>
            <td>
              {category.exclusive ? (
                <select
                  aria-label={category.label}
                  value={tags.find((t) => category.tags.includes(t)) ?? ""}
                  onChange={(e) => onChange(draft.setExclusiveTag(category.tags, e.target.value || null))}
                >
                  <option value="">— none —</option>
                  {category.tags.map((t) => <option key={t} value={t}>{tagLabel(t)}</option>)}
                </select>
              ) : (
                category.tags.map((t) => (
                  <label key={t} className="balance-tag-role">
                    <input type="checkbox" checked={tags.includes(t)} onChange={() => onChange(draft.toggleRoleTag(t))} /> {t}
                  </label>
                ))
              )}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

// "target 300" (or a range) beside Max HP / DPS, colored by fit.
function TargetHint({value, range, digits}) {
  if (!range) return null;
  const [lo, hi] = range.map((n) => n.toFixed(digits));
  const fit = typeof value === "number" ? targetFit(value, range) : null;
  return <span className={`field-target${fit ? ` target-${fit}` : ""}`}>target {lo === hi ? lo : `${lo}-${hi}`}</span>;
}

// Purely presentational - every domain rule (tactics placeholder shapes,
// rotation/scripted list editing) lives on UnitTypeDraft; this just
// renders draft's current values and calls its mutator methods. Powers
// aren't edited here - each one is its own area in the editor.
export default function UnitTypeFieldsPanel({
  draft, onChange, tokenImages,
}) {
  const unitTypeData = draft.data;
  const names = draft.powerNames;
  const targets = unitTargets(draft.tags);

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
          <tr><th title="Set to spawn stealthed, with this stealth rating">Stealth</th><td><NumberField value={unitTypeData.stealth} onChange={setField("stealth")} /></td></tr>
          <tr><th title="Detection rating, for spotting stealthed characters">Detection</th><td><NumberField value={unitTypeData.detection} onChange={setField("detection")} /></td></tr>
          <tr>
            <th>Max HP</th>
            <td><NumberField value={unitTypeData.maxHP} onChange={setField("maxHP")} /> <TargetHint value={unitTypeData.maxHP} range={targets.hp} digits={0} /></td>
          </tr>
          <tr>
            <th>DPS</th>
            <td><NumberField value={unitTypeData.dps} onChange={setField("dps")} /> <TargetHint value={unitTypeData.dps} range={targets.dps} digits={1} /></td>
          </tr>
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

      <h3>Balance tags</h3>
      <BalanceTagFields draft={draft} onChange={onChange} />

      <h3>Token images</h3>
      <TokenImageUrlField draft={draft} onChange={onChange} tokenImages={tokenImages} />

      <h3>Resource</h3>
      <ResourceTypeField resource={unitTypeData.resource} draft={draft} onChange={onChange} />

      <h3>Tactics</h3>
      <TacticsFields tactics={unitTypeData.tactics} currentNames={draft.combatPowerNames} draft={draft} onChange={onChange} />

      <h3>On death</h3>
      <p className="field-hint">A power that fires once when this unit dies, instead of in combat: area damage around the corpse, or a heal or buff for its pack.</p>
      <select aria-label="On death power" value={unitTypeData.onDeath ?? ""} onChange={(e) => onChange(draft.setOnDeath(e.target.value || null))}>
        <option value="">None</option>
        {names.map((n) => <option key={n} value={n}>{n}</option>)}
      </select>
    </div>
  );
}
