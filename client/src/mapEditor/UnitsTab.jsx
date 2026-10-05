import {useEffect, useRef, useState} from "react";
import LeashFields from "./LeashFields";
import {MovementFields, MovementTypeSelect, PositionButton} from "./MovementFields";
import {unitGroups} from "./groupIdentifiers";
import {INTENDED_FOR, PULL_SIZES, RANDOM_PULL_SIZE} from "./encounter";

const NO_ENCOUNTER = {selection: [], settings: {intendedFor: "open", pullSize: null}, onChangeSettings: () => {}, onSelect: () => {}, onExtendSelection: () => {}, armed: false, onArm: () => {}, onDisarm: () => {}, error: ""};

// The map editor's Units tab. With no group open: a palette of the unit
// types on this map (plus "+" for the world's others) above the list of
// groups. Pressing a palette entry arms it - each click on the map then
// places one of those, in a new group of its own - and hovering one
// highlights its units. Opening a group (its row here, or double-clicking
// a member on the map) shows its members instead, collapsed unless there's
// just one; shift-clicking units on the map adds or removes them (see
// MapWorkbench).
//
// A unit's position is only ever set by clicking the map (to place),
// dragging its token (to move), or its Position pill (to re-place) - never
// typed. Its unitType is picked, for a unit whose type needs correcting.

function TextField({value, onChange, placeholder}) {
  return <input type="text" value={value ?? ""} placeholder={placeholder} onChange={(e) => onChange(e.target.value === "" ? null : e.target.value)} />;
}

// Falls back to the raw key for a unit type the world doesn't have.
function unitTypeLabel(unitTypeDetails, unitTypeKey) {
  return unitTypeDetails[unitTypeKey]?.name || unitTypeKey;
}

// unitType is the real unit_types/ file key by convention (not a
// zone-level alias - a Map has no unitTypes dict of its own, see the map
// editor plan) - that's what lets a unit's real token image/tokenRadius
// resolve (see UnitShapes). A pre-existing map authored before this editor
// existed may have units whose unitType doesn't match any real key (e.g. a
// zone alias) - shown as an extra, clearly-marked option so picking a real
// one doesn't require already knowing to clear it first.
function UnitTypeSelect({value, availableUnitTypeKeys, unitTypeDetails, onChange}) {
  const isUnknown = value && !availableUnitTypeKeys.includes(value);
  return (
    <select value={value ?? ""} onChange={(e) => onChange(e.target.value === "" ? null : e.target.value)}>
      <option value="">— choose —</option>
      {isUnknown && <option value={value}>{value} (not a real unit type)</option>}
      {availableUnitTypeKeys.map((key) => <option key={key} value={key}>{unitTypeLabel(unitTypeDetails, key)}</option>)}
    </select>
  );
}

// Same fallback (a plain hostility-colored dot) as UnitShapes uses on the
// map itself when there's no tokenImageUrl - not the same element/colors
// object (kept separate per this project's per-file convention), but the
// same idea, so the sidebar and canvas agree on what an unresolved/absent
// token looks like.
const HOSTILITY_COLORS = {hostile: "#e05a5a", neutral: "#d9b64a", friendly: "#5ac07a"};

export function TokenThumb({unit, unitTypeDetails, className = "map-unit-token-thumb"}) {
  const tokenImageUrl = unitTypeDetails[unit.unitType]?.tokenImageUrl;
  if (tokenImageUrl) {
    return <img className={className} src={tokenImageUrl} alt="" />;
  }
  return (
    <div
      className={`${className} map-unit-token-thumb-fallback`}
      style={{background: HOSTILITY_COLORS[unit.hostility] ?? HOSTILITY_COLORS.hostile}}
    />
  );
}

// Falls back to the raw key, same as unitTypeLabel - see MapEditor's
// itemDetails (keyed by the item's file path, lazily populated).
function itemLabel(itemDetails, itemKey) {
  return itemDetails[itemKey]?.name || itemKey;
}

// lootTable is a plain {identifier: weight} object (docs/schema/zone.md's
// LootTable), not an entry array like every other list in this editor - so
// add/remove/reweigh all funnel through one dispatch of the whole updated
// object rather than ADD_ENTRY/REMOVE_ENTRY. A new entry always starts at
// weight 1: since every entry starts equal, an untouched table is "one
// item, evenly split among options" for free, no redistribution math
// needed (see the map editor plan's Slice 6).
// docs/schema/unit.md's lootCount: a resolved value >= 1 awards that many
// items (truncated); a value between 0 and 1 is instead the probability of
// awarding exactly one item (0 otherwise) - the game server (see
// game-server/internal/instancestate/loot.go's resolveLootCount) implements
// this split. This field only edits a fixed number for now, not a
// [min, max] range - matches every other numeric field in this editor
// (e.g. currentHpFraction), which are all single values, not ranges.
function LootCountField({unit, unitIndex, dispatch}) {
  const value = unit.lootCount ?? 1;
  return (
    <div className="map-loot-count-field">
      <label>
        Loot Count{" "}
        <input
          type="number" min="0" step="0.1" value={value}
          onChange={(e) => dispatch({
            type: "UPDATE_ENTRY_FIELD", section: "units", index: unitIndex, field: "lootCount",
            value: e.target.value === "" ? 1 : parseFloat(e.target.value),
          })}
        />
      </label>
      <p className="map-sidebar-hint">1 or more: number of items dropped. Between 0 and 1: odds of dropping one item.</p>
    </div>
  );
}

// renderItemAdder({onAdded(key), close()}), if given, offers getting a new
// item (e.g. importing or creating one) to drop, in a popover.
function LootTableFields({unit, unitIndex, availableItemKeys, itemDetails, onChooseItem, dispatch, renderItemAdder}) {
  const [chosenItem, setChosenItem] = useState("");
  const [addingItem, setAddingItem] = useState(false);
  const lootTable = unit.lootTable ?? {};
  const entries = Object.entries(lootTable);
  // An item already in the table isn't offered again - lootTable is keyed
  // by identifier, so picking it again would just silently overwrite the
  // existing entry's weight instead of adding a second one.
  const usedIdentifiers = new Set(entries.map(([identifier]) => identifier));
  const pickableKeys = availableItemKeys.filter((key) => !usedIdentifiers.has(itemDetails[key]?.identifier ?? key));

  function setLootTable(next) {
    dispatch({type: "UPDATE_ENTRY_FIELD", section: "units", index: unitIndex, field: "lootTable", value: next});
  }

  function addEntry() {
    if (!chosenItem) return;
    const identifier = itemDetails[chosenItem]?.identifier ?? chosenItem;
    setLootTable({...lootTable, [identifier]: 1});
    setChosenItem("");
  }

  function removeEntry(identifier) {
    const next = {...lootTable};
    delete next[identifier];
    setLootTable(next);
  }

  function setWeight(identifier, weight) {
    setLootTable({...lootTable, [identifier]: weight});
  }

  return (
    <div className="map-unit-loot-table">
      <h4>Loot Table</h4>
      <LootCountField unit={unit} unitIndex={unitIndex} dispatch={dispatch} />
      {entries.length === 0 && <p className="map-editor-sidebar-placeholder">No loot yet.</p>}
      {entries.map(([identifier, weight]) => (
        <div key={identifier} className="map-loot-entry">
          <span className="map-loot-entry-name">{itemLabel(itemDetails, identifier)}</span>
          <input
            type="number" min="1" step="1" value={weight}
            onChange={(e) => setWeight(identifier, e.target.value === "" ? 1 : parseInt(e.target.value, 10))}
          />
          <button type="button" className="map-loot-entry-remove" onClick={() => removeEntry(identifier)}>×</button>
        </div>
      ))}
      <div className="add-buttons-row">
        <select value={chosenItem} onChange={(e) => { setChosenItem(e.target.value); onChooseItem(e.target.value); }}>
          <option value="">Choose item…</option>
          {pickableKeys.map((key) => <option key={key} value={key}>{itemLabel(itemDetails, key)}</option>)}
        </select>
        <button type="button" className="add-entry" disabled={!chosenItem} onClick={addEntry}>+ Add Loot Entry</button>
        {renderItemAdder && (
          <button type="button" className="add-entry" aria-expanded={addingItem} onClick={() => setAddingItem((a) => !a)}>New item…</button>
        )}
      </div>
      {addingItem && (
        <div className="map-loot-item-popover" role="dialog" aria-label="Add a new item">
          {renderItemAdder({
            onAdded: (key) => {
              setLootTable({...lootTable, [key]: 1});
              setAddingItem(false);
            },
            close: () => setAddingItem(false),
          })}
        </div>
      )}
    </div>
  );
}

// Small utf8 marker shown in a unit's collapsed row when it has any loot
// entries, so "does this unit drop anything" is visible without expanding
// every row to check.
function LootIcon({unit}) {
  if (!unit.lootTable || Object.keys(unit.lootTable).length === 0) return null;
  return <span className="map-unit-row-loot-icon" title="Has loot">💰</span>;
}

// Placements carry a section ("units" or "ncus" - see UiState); only this
// panel's own should light up its rows.
function inUnitsSection(placement) {
  return placement && (placement.section ?? "units") === "units" ? placement : null;
}

// One unit's row - collapsed (token, name, type, loot icon) until clicked,
// which expands the full editing form.
function UnitRow({
  unit, index, expanded, hovered, rowRef, onRowClick, onHover, onRemove,
  availableUnitTypeKeys, unitTypeDetails, onChooseUnitType,
  unitPlacement, onStartUnitPlacement,
  patrolStepPlacement, onStartPatrolStepPlacement, onStartPatrolStepEdit, onHoverPatrolStep,
  wanderLocationPlacement, onStartWanderLocationPlacement, onUpdateMovement,
  availableItemKeys, itemDetails, onChooseItem, renderItemAdder,
  updateUnit, dispatch,
}) {
  return (
    <div
      ref={rowRef}
      className={`entry-block map-unit-block${expanded ? " map-unit-expanded" : ""}${hovered ? " map-entry-hovered" : ""}`}
      onMouseEnter={() => onHover(index)}
      onMouseLeave={() => onHover(null)}
    >
      <div className="entry-heading-row map-unit-row" onClick={() => onRowClick(index)}>
        <div className="map-unit-row-summary">
          <span className="map-sidebar-section-toggle">{expanded ? "▾" : "▸"}</span>
          <TokenThumb unit={unit} unitTypeDetails={unitTypeDetails} className="map-unit-token-thumb map-unit-row-token" />
          <span className="map-unit-row-name">{unit.identifier || `Unit ${index + 1}`}</span>
          <span className="map-unit-row-type">{unitTypeLabel(unitTypeDetails, unit.unitType)}</span>
          <LootIcon unit={unit} />
        </div>
        {expanded && (
          <button type="button" className="remove-entry" onClick={(e) => { e.stopPropagation(); onRemove(index); }}>
            Remove
          </button>
        )}
      </div>
      {expanded && (
        <>
          <div className="map-unit-body">
            <table>
              <tbody>
                <tr>
                  <th>Type</th>
                  <td>
                    <UnitTypeSelect
                      value={unit.unitType} availableUnitTypeKeys={availableUnitTypeKeys} unitTypeDetails={unitTypeDetails}
                      onChange={(v) => { updateUnit(index, {unitType: v}); onChooseUnitType(v); }}
                    />
                  </td>
                </tr>
                <tr>
                  <th>Identifier</th>
                  <td><TextField value={unit.identifier} placeholder="goblin_a" onChange={(v) => updateUnit(index, {identifier: v})} /></td>
                </tr>
                <tr>
                  <th>Position</th>
                  <td>
                    <PositionButton
                      unitIndex={index} position={unit.position}
                      unitPlacement={unitPlacement} onStartUnitPlacement={onStartUnitPlacement}
                    />
                  </td>
                </tr>
                <tr>
                  <th>Facing</th>
                  <td>
                    <input
                      type="range" min="0" max="359" step="1" value={unit.position.angle ?? 0}
                      onChange={(e) => updateUnit(index, {position: {...unit.position, angle: parseFloat(e.target.value) || 0}})}
                    />
                    {" "}{Math.round(unit.position.angle ?? 0)}°
                  </td>
                </tr>
                <tr>
                  <th>HP</th>
                  <td>
                    <input
                      type="range" min="0" max="1" step="0.01" value={unit.currentHpFraction ?? 1}
                      onChange={(e) => updateUnit(index, {currentHpFraction: parseFloat(e.target.value)})}
                    />
                    {" "}{Math.round((unit.currentHpFraction ?? 1) * 100)}%
                  </td>
                </tr>
                <tr>
                  <th>Movement</th>
                  <td><MovementTypeSelect unit={unit} unitIndex={index} dispatch={dispatch} /></td>
                </tr>
                <LeashFields
                  leashRadius={unit.leashRadius} hardLeash={unit.hardLeash}
                  onChange={(fields) => updateUnit(index, fields)}
                  inheritLabel={{radius: "map's", hard: "Map's setting"}}
                />
              </tbody>
            </table>
            <div className="map-unit-token-panel">
              <TokenThumb unit={unit} unitTypeDetails={unitTypeDetails} />
            </div>
          </div>
          <MovementFields
            unit={unit} unitIndex={index}
            patrolStepPlacement={patrolStepPlacement} onStartPatrolStepPlacement={onStartPatrolStepPlacement} onStartPatrolStepEdit={onStartPatrolStepEdit}
            onHoverPatrolStep={onHoverPatrolStep}
            wanderLocationPlacement={wanderLocationPlacement} onStartWanderLocationPlacement={onStartWanderLocationPlacement}
            onUpdateMovement={onUpdateMovement}
          />
          <LootTableFields
            unit={unit} unitIndex={index}
            availableItemKeys={availableItemKeys} itemDetails={itemDetails} onChooseItem={onChooseItem}
            dispatch={dispatch} renderItemAdder={renderItemAdder}
          />
        </>
      )}
    </div>
  );
}

// A group's name is committed on blur/Enter, not per-keystroke - a rename
// rewrites every member (see MapWorkbench's renameGroup), and a mid-edit
// empty string would otherwise briefly ungroup them all.
function GroupNameField({identifier, onRename}) {
  const [value, setValue] = useState(identifier);
  useEffect(() => setValue(identifier), [identifier]);

  function commit() {
    const trimmed = value.trim();
    if (trimmed && trimmed !== identifier) onRename(identifier, trimmed);
    else setValue(identifier);
  }

  return (
    <input
      type="text" className="map-unit-group-name" value={value} aria-label="Group name"
      onClick={(e) => e.stopPropagation()}
      onChange={(e) => setValue(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); }}
    />
  );
}

// The unit types placeable from the palette: those already on the map and
// any added with "+" (paletteAdditions, kept by the host), alphabetically -
// so a family (goblin-*) sits together for range-selecting.
export function paletteKeys(units, added) {
  return [...new Set([...units.map((unit) => unit.unitType).filter(Boolean), ...added])].sort();
}

// renderAdder({onAdded(key), close()}), if given, renders more ways to get
// a unit type (e.g. import or create one) below the world's others.
function Palette({units, unitTypes, added, onAdd, armedUnitType, onArmUnitType, onHoverUnitType, canPlaceOnMap, renderAdder, encounter}) {
  const [adding, setAdding] = useState(false);
  const keys = paletteKeys(units, added);
  const addable = unitTypes.keys.filter((key) => !keys.includes(key));

  function add(key) {
    onAdd(key);
    setAdding(false);
    if (canPlaceOnMap) onArmUnitType(key);
  }

  return (
    <section className="map-unit-palette" aria-label="Unit palette">
      <div className="map-unit-palette-entries">
        {keys.map((key) => {
          const armed = armedUnitType === key;
          const selected = encounter.selection.includes(key);
          return (
            <button
              key={key} type="button" aria-pressed={armed} disabled={!canPlaceOnMap}
              className={`map-unit-palette-entry${armed ? " armed" : ""}${selected ? " selected" : ""}`}
              onClick={(e) => {
                if (e.shiftKey) {
                  encounter.onExtendSelection(key, keys);
                  return;
                }
                encounter.onSelect(armed ? [] : [key]);
                onArmUnitType(armed ? null : key);
              }}
              onMouseEnter={() => onHoverUnitType(key)}
              onMouseLeave={() => onHoverUnitType(null)}
            >
              <TokenThumb unit={{unitType: key}} unitTypeDetails={unitTypes.details} className="map-unit-token-thumb map-unit-palette-token" />
              <span>{unitTypeLabel(unitTypes.details, key)}</span>
            </button>
          );
        })}
        <button type="button" className="map-unit-palette-add" aria-label="Add a unit type" onClick={() => setAdding((a) => !a)}>+</button>
      </div>
      {adding && (
        <div className="map-unit-palette-popover" role="dialog" aria-label="Add a unit type">
          {addable.length === 0
            ? <p className="map-sidebar-hint">Every unit type in this world is already here.</p>
            : addable.map((key) => (
              <button key={key} type="button" className="map-unit-palette-option" onClick={() => add(key)}>
                <TokenThumb unit={{unitType: key}} unitTypeDetails={unitTypes.details} className="map-unit-token-thumb map-unit-palette-token" />
                {unitTypeLabel(unitTypes.details, key)}
              </button>
            ))}
          {renderAdder?.({onAdded: add, close: () => setAdding(false)})}
        </div>
      )}
      {!canPlaceOnMap && <p className="map-sidebar-hint">Set feet dimensions (Map tab) before placing units.</p>}
      {armedUnitType && <p className="map-sidebar-hint">Click the map to place {unitTypeLabel(unitTypes.details, armedUnitType)}. Escape to stop.</p>}
      <EncounterControls encounter={encounter} canPlaceOnMap={canPlaceOnMap} />
    </section>
  );
}

// "+ Encounter": places a balanced pull per map click, built from the
// selected palette entries (shift-click to range-select) or the whole
// palette - see encounter.js.
function EncounterControls({encounter, canPlaceOnMap}) {
  const {settings, onChangeSettings, armed, onArm, error, selection} = encounter;
  return (
    <div className="map-encounter-controls">
      <div className="map-encounter-row">
        <select aria-label="Encounter intended for" value={settings.intendedFor} onChange={(e) => onChangeSettings({intendedFor: e.target.value})}>
          {INTENDED_FOR.map((tag) => <option key={tag} value={tag}>{tag}</option>)}
        </select>
        <select aria-label="Encounter pull size" value={settings.pullSize ?? ""} onChange={(e) => onChangeSettings({pullSize: e.target.value || null})}>
          <option value="">pull size…</option>
          {PULL_SIZES.map((size) => <option key={size} value={size}>{size}</option>)}
          <option value={RANDOM_PULL_SIZE}>random size</option>
        </select>
        <button type="button" className={`add-entry${armed ? " armed" : ""}`} aria-pressed={armed} disabled={!canPlaceOnMap}
          onClick={() => (armed ? encounter.onDisarm() : onArm())}>+ Encounter</button>
      </div>
      {armed && (
        <p className="map-sidebar-hint">
          Click the map to place a {settings.intendedFor} {settings.pullSize === RANDOM_PULL_SIZE ? "random-size" : settings.pullSize} encounter from {selection.length ? `the ${selection.length} selected unit types` : "the whole palette"}. Escape to stop.
        </p>
      )}
      {error && <p className="map-sidebar-hint map-encounter-error" role="alert">{error}</p>}
    </div>
  );
}

const MAX_GROUP_TOKENS = 6;

function GroupList({units, unitTypeDetails, hoveredGroupIdentifier, hoveredIndex, onOpenGroup, onHoverGroup, onHover}) {
  const groups = unitGroups(units);
  if (groups.length === 0) return <p className="map-editor-sidebar-placeholder">No units yet - press a unit type above, then click the map.</p>;

  return (
    <ul className="map-unit-group-list" aria-label="Groups">
      {groups.map((group) => {
        const [first] = group.memberIndices;
        const name = group.identifier ?? units[first].identifier ?? `Unit ${first + 1}`;
        const hovered = group.identifier ? hoveredGroupIdentifier === group.identifier : hoveredIndex === first;
        return (
          <li key={group.identifier ?? `unit-${first}`}>
            <button
              type="button" className={`map-unit-group-row${hovered ? " map-entry-hovered" : ""}`}
              onClick={() => onOpenGroup(group)}
              onMouseEnter={() => (group.identifier ? onHoverGroup(group.identifier) : onHover(first))}
              onMouseLeave={() => (group.identifier ? onHoverGroup(null) : onHover(null))}
            >
              <span className="map-unit-group-tokens">
                {group.memberIndices.slice(0, MAX_GROUP_TOKENS).map((i) => (
                  <TokenThumb key={i} unit={units[i]} unitTypeDetails={unitTypeDetails} className="map-unit-token-thumb map-unit-row-token" />
                ))}
              </span>
              <span className="map-unit-group-row-name">{name}</span>
              <span className="map-unit-group-count">{group.memberIndices.length}</span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}

function OpenGroup({
  identifier, units, onCloseGroup, onRenameGroup, hoveredIndex, focusUnitRequest, onExpandedIndicesChange, rowProps,
}) {
  const memberIndices = units.flatMap((unit, i) => (unit.groupIdentifier === identifier ? [i] : []));
  const [expandedIndices, setExpandedIndices] = useState(() => new Set());
  const rowRefs = useRef({});
  const single = memberIndices.length === 1;
  const isExpanded = (i) => single || expandedIndices.has(i);
  const expandedKey = memberIndices.filter(isExpanded).join(",");

  // Mirrored up so MovementShapes can show the paths of the units being
  // edited (see MapWorkbench's expandedUnitIndices).
  useEffect(() => {
    onExpandedIndicesChange?.(new Set(expandedKey ? expandedKey.split(",").map(Number) : []));
  }, [expandedKey, onExpandedIndicesChange]);

  // A member clicked on the map opens its row and scrolls to it.
  useEffect(() => {
    if (!focusUnitRequest || units[focusUnitRequest.index]?.groupIdentifier !== identifier) return;
    setExpandedIndices((current) => new Set([...current, focusUnitRequest.index]));
    requestAnimationFrame(() => rowRefs.current[focusUnitRequest.index]?.scrollIntoView?.({block: "nearest", behavior: "smooth"}));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusUnitRequest]);

  function toggleExpanded(index) {
    setExpandedIndices((current) => {
      const next = new Set(current);
      if (next.has(index)) next.delete(index); else next.add(index);
      return next;
    });
  }

  return (
    <section className="map-unit-open-group" aria-label="Open group">
      <button type="button" className="map-unit-close-group" onClick={onCloseGroup}>← Close group</button>
      <div className="map-unit-group-header">
        <GroupNameField identifier={identifier} onRename={onRenameGroup} />
        <span className="map-unit-group-count">{memberIndices.length} {memberIndices.length === 1 ? "unit" : "units"}</span>
      </div>
      <p className="map-sidebar-hint">Shift-click units on the map to add or remove them.</p>
      {memberIndices.map((index) => (
        <UnitRow
          key={index}
          index={index}
          unit={units[index]}
          expanded={isExpanded(index)}
          hovered={hoveredIndex === index}
          rowRef={(el) => { rowRefs.current[index] = el; }}
          onRowClick={toggleExpanded}
          {...rowProps}
        />
      ))}
    </section>
  );
}

export default function UnitsTab({
  units, unitTypes, items, canPlaceOnMap,
  openGroup, onOpenGroup, onCloseGroup, onRenameGroup,
  armedUnitType, onArmUnitType, onHoverUnitType, paletteAdditions = [], onAddToPalette, renderUnitTypeAdder, renderItemAdder,
  encounter = NO_ENCOUNTER,
  hoveredGroupIdentifier, onHoverGroup, hoveredIndex, onHover, selectedIndex, onSelect,
  focusUnitRequest, onExpandedIndicesChange,
  onChooseUnitType = () => {}, onChooseItem = () => {},
  unitPlacement, onStartUnitPlacement,
  patrolStepPlacement, onStartPatrolStepPlacement, onStartPatrolStepEdit, onHoverPatrolStep,
  wanderLocationPlacement, onStartWanderLocationPlacement, onUpdateMovement,
  dispatch,
}) {
  function updateUnit(index, fields) {
    Object.entries(fields).forEach(([field, value]) => {
      dispatch({type: "UPDATE_ENTRY_FIELD", section: "units", index, field, value});
    });
  }

  function removeUnit(index) {
    dispatch({type: "REMOVE_ENTRY", section: "units", index});
    if (selectedIndex === index) onSelect(null);
  }

  if (openGroup) {
    return (
      <OpenGroup
        identifier={openGroup} units={units}
        onCloseGroup={onCloseGroup} onRenameGroup={onRenameGroup}
        hoveredIndex={hoveredIndex} focusUnitRequest={focusUnitRequest} onExpandedIndicesChange={onExpandedIndicesChange}
        rowProps={{
          onHover, onRemove: removeUnit,
          availableUnitTypeKeys: unitTypes.keys, unitTypeDetails: unitTypes.details, onChooseUnitType,
          unitPlacement: inUnitsSection(unitPlacement), onStartUnitPlacement,
          patrolStepPlacement: inUnitsSection(patrolStepPlacement), onStartPatrolStepPlacement, onStartPatrolStepEdit, onHoverPatrolStep,
          wanderLocationPlacement: inUnitsSection(wanderLocationPlacement), onStartWanderLocationPlacement, onUpdateMovement,
          availableItemKeys: items.keys, itemDetails: items.details, onChooseItem, renderItemAdder,
          updateUnit, dispatch,
        }}
      />
    );
  }

  return (
    <div className="map-units-tab">
      <Palette
        units={units} unitTypes={unitTypes} canPlaceOnMap={canPlaceOnMap}
        added={paletteAdditions} onAdd={onAddToPalette} renderAdder={renderUnitTypeAdder}
        armedUnitType={armedUnitType} onArmUnitType={onArmUnitType} onHoverUnitType={onHoverUnitType}
        encounter={encounter}
      />
      <GroupList
        units={units} unitTypeDetails={unitTypes.details}
        hoveredGroupIdentifier={hoveredGroupIdentifier} hoveredIndex={hoveredIndex}
        onOpenGroup={onOpenGroup} onHoverGroup={onHoverGroup} onHover={onHover}
      />
    </div>
  );
}
