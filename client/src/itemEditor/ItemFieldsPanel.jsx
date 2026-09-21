import {humanize} from "../abilityEditor/abilityFormatting";
import {SLOT_VALUES, WEAPON_TYPES, PRIMARY_STATS, SECONDARY_STATS} from "./itemFieldOptions";

function TextField({value, onChange, placeholder}) {
  return <input type="text" value={value ?? ""} placeholder={placeholder} onChange={(e) => onChange(e.target.value === "" ? null : e.target.value)} />;
}

function NumberField({value, onChange}) {
  return (
    <input
      type="number" step="any" value={value ?? ""}
      onChange={(e) => onChange(e.target.value === "" ? null : parseFloat(e.target.value))}
    />
  );
}

function SelectField({value, options, onChange, nullLabel = "—"}) {
  return (
    <select value={value ?? ""} onChange={(e) => onChange(e.target.value === "" ? null : e.target.value)}>
      <option value="">{nullLabel}</option>
      {options.map((option) => <option key={option} value={option}>{humanize(option)}</option>)}
    </select>
  );
}

// Purely presentational - every domain rule (which fields a slot change
// invalidates, the secondaries cap) lives on ItemDraft itself now; this
// just renders draft's current values and calls its mutator methods.
export default function ItemFieldsPanel({draft, onChange}) {
  const {data, slot, shield, secondaries, maxSecondaries, primaryEligible, weaponTypeEligible} = draft;

  return (
    <div>
      <table>
        <tbody>
          <tr>
            <th>Identifier</th>
            <td><TextField value={data.identifier} onChange={(v) => onChange(draft.setField("identifier", v))} placeholder="sword-of-doom" /></td>
          </tr>
          <tr>
            <th>Name</th>
            <td><TextField value={data.name} onChange={(v) => onChange(draft.setField("name", v))} placeholder="Sword of Doom" /></td>
          </tr>
          <tr>
            <th>Slot</th>
            <td><SelectField value={slot} options={SLOT_VALUES} onChange={(v) => onChange(draft.setSlot(v))} nullLabel="Select a slot…" /></td>
          </tr>
          <tr>
            <th>Elevation</th>
            <td><NumberField value={data.elvl} onChange={(v) => onChange(draft.setField("elvl", v))} /></td>
          </tr>
          {slot === "off_hand" && (
            <tr>
              <th>Shield</th>
              <td>
                <input type="checkbox" checked={shield} onChange={(e) => onChange(draft.setShield(e.target.checked))} />
              </td>
            </tr>
          )}
          {weaponTypeEligible && (
            <tr>
              <th>Weapon Type</th>
              <td><SelectField value={data.weaponType} options={WEAPON_TYPES} onChange={(v) => onChange(draft.setField("weaponType", v))} nullLabel={slot === "off_hand" ? "None (non-weapon)" : "Select a weapon type…"} /></td>
            </tr>
          )}
          {primaryEligible && (
            <tr>
              <th>Primary</th>
              <td><SelectField value={data.primary} options={PRIMARY_STATS} onChange={(v) => onChange(draft.setField("primary", v))} nullLabel="None" /></td>
            </tr>
          )}
          <tr>
            <th>Description</th>
            <td><TextField value={data.description} onChange={(v) => onChange(draft.setField("description", v))} /></td>
          </tr>
          <tr>
            <th>Icon URL</th>
            <td><TextField value={data.icon_url} onChange={(v) => onChange(draft.setField("icon_url", v))} placeholder="../../assets/items/sword-of-doom.webp" /></td>
          </tr>
        </tbody>
      </table>

      {slot && (
        <>
          <h3>Secondaries ({secondaries.length}/{maxSecondaries})</h3>
          <div className="checkbox-list">
            {SECONDARY_STATS.map((stat) => (
              <label key={stat}>
                <input
                  type="checkbox" checked={secondaries.includes(stat)}
                  disabled={!secondaries.includes(stat) && secondaries.length >= maxSecondaries}
                  onChange={() => onChange(draft.toggleSecondary(stat))}
                />
                {humanize(stat)}
              </label>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
