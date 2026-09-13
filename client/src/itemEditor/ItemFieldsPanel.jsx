import {humanize} from "../editor/abilityFormatting";
import {SLOT_VALUES, WEAPON_SLOTS, WEAPON_TYPES, PRIMARY_STATS, SECONDARY_STATS, maxSecondaries} from "./itemFieldOptions";

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

// Whether this slot ever has a primary/weaponType at all - ring/neck never
// itemize a primary stat, and only weapon slots take a weaponType. See
// docs/schema/item.md.
function primaryEligible(slot, shield) {
  return slot !== "ring" && slot !== "neck" && !shield;
}

function weaponTypeEligible(slot, shield) {
  return WEAPON_SLOTS.includes(slot) && !shield;
}

export default function ItemFieldsPanel({itemData, dispatch}) {
  const slot = itemData.slot ?? "";
  const shield = slot === "off_hand" && itemData.shield === true;
  const secondaries = Array.isArray(itemData.secondaries) ? itemData.secondaries : [];
  const maxSec = slot ? maxSecondaries(slot) : 0;

  function setField(field, value) {
    dispatch({type: "SET_FIELD", field, value});
  }

  function setSlot(nextSlot) {
    // Clear fields that stop being meaningful under the new slot, rather
    // than leaving stale values an author didn't intend to keep.
    const updates = {slot: nextSlot};
    if (nextSlot !== "off_hand") updates.shield = false;
    if (!primaryEligible(nextSlot, nextSlot === "off_hand" && itemData.shield)) updates.primary = null;
    if (!weaponTypeEligible(nextSlot, nextSlot === "off_hand" && itemData.shield)) updates.weaponType = null;
    dispatch({type: "SET_FIELD", field: "slot", value: nextSlot});
    Object.entries(updates).forEach(([field, value]) => {
      if (field !== "slot") dispatch({type: "SET_FIELD", field, value});
    });
  }

  function setShield(nextShield) {
    const updates = {shield: nextShield};
    if (nextShield) {
      updates.primary = null;
      updates.weaponType = null;
    }
    Object.entries(updates).forEach(([field, value]) => dispatch({type: "SET_FIELD", field, value}));
  }

  function toggleSecondary(stat) {
    const has = secondaries.includes(stat);
    if (!has && secondaries.length >= maxSec) return; // already at this slot's cap
    const next = has ? secondaries.filter((s) => s !== stat) : [...secondaries, stat];
    setField("secondaries", next);
  }

  return (
    <div>
      <table>
        <tbody>
          <tr>
            <th>Identifier</th>
            <td><TextField value={itemData.identifier} onChange={(v) => setField("identifier", v)} placeholder="sword-of-doom" /></td>
          </tr>
          <tr>
            <th>Name</th>
            <td><TextField value={itemData.name} onChange={(v) => setField("name", v)} placeholder="Sword of Doom" /></td>
          </tr>
          <tr>
            <th>Slot</th>
            <td><SelectField value={slot} options={SLOT_VALUES} onChange={setSlot} nullLabel="Select a slot…" /></td>
          </tr>
          <tr>
            <th>Elevation</th>
            <td><NumberField value={itemData.elvl} onChange={(v) => setField("elvl", v)} /></td>
          </tr>
          {slot === "off_hand" && (
            <tr>
              <th>Shield</th>
              <td>
                <input type="checkbox" checked={shield} onChange={(e) => setShield(e.target.checked)} />
              </td>
            </tr>
          )}
          {weaponTypeEligible(slot, shield) && (
            <tr>
              <th>Weapon Type</th>
              <td><SelectField value={itemData.weaponType} options={WEAPON_TYPES} onChange={(v) => setField("weaponType", v)} nullLabel={slot === "off_hand" ? "None (non-weapon)" : "Select a weapon type…"} /></td>
            </tr>
          )}
          {primaryEligible(slot, shield) && (
            <tr>
              <th>Primary</th>
              <td><SelectField value={itemData.primary} options={PRIMARY_STATS} onChange={(v) => setField("primary", v)} nullLabel="None" /></td>
            </tr>
          )}
          <tr>
            <th>Description</th>
            <td><TextField value={itemData.description} onChange={(v) => setField("description", v)} /></td>
          </tr>
          <tr>
            <th>Icon URL</th>
            <td><TextField value={itemData.icon_url} onChange={(v) => setField("icon_url", v)} placeholder="../../assets/items/sword-of-doom.webp" /></td>
          </tr>
        </tbody>
      </table>

      {slot && (
        <>
          <h3>Secondaries ({secondaries.length}/{maxSec})</h3>
          <div className="checkbox-list">
            {SECONDARY_STATS.map((stat) => (
              <label key={stat}>
                <input
                  type="checkbox" checked={secondaries.includes(stat)}
                  disabled={!secondaries.includes(stat) && secondaries.length >= maxSec}
                  onChange={() => toggleSecondary(stat)}
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
