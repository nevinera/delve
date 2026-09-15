import {useEffect, useRef, useState} from "react";

// "+ Add Unit" is two steps, unlike every other add-tool here: pick a unit
// type from the dropdown (this panel's own local state - it's not written
// anywhere until placed), then the button arms MapCanvas's single-shot
// "add-unit" tool the same way "+ Add Circle" does. A unit's position is
// only ever set by clicking the map (to place), dragging its token on
// canvas (to move), or clicking its Position pill here (to re-place via
// MapCanvas's `unitPlacement` - same pattern as a connection's
// CoordinateButton) - never typed.
//
// hostility is fixed to "hostile" and movement to {type: "still"} for
// every unit in this slice (no pickers yet - see the map editor plan's
// Slice 5/8). identifier isn't schema-required, but is part of the form
// already since it's used in a group's display name.
//
// unitType *is* editable, via UnitTypeSelect below - unlike position, this
// is typed/picked rather than set by interacting with the map, and an
// already-placed unit may need it corrected (e.g. a map authored before
// this editor existed, whose units carry zone-level aliases rather than a
// real unit_types/ key - see UnitShapes for why that key is what lets a
// unit's real token/tokenRadius resolve).

function TextField({value, onChange, placeholder}) {
  return <input type="text" value={value ?? ""} placeholder={placeholder} onChange={(e) => onChange(e.target.value === "" ? null : e.target.value)} />;
}

// Falls back to the raw key when its details haven't been fetched yet (see
// MapEditor's unitTypeDetails - only keys actually in use, or picked from
// the dropdown, get their {name, tokenRadius, tokenImageUrl} loaded, so a
// repo with far more unit types than any one map uses doesn't pay to open
// every file just to build this list).
function unitTypeLabel(unitTypeDetails, unitTypeKey) {
  return unitTypeDetails[unitTypeKey]?.name || unitTypeKey;
}

function round1(n) {
  return Math.round(n * 10) / 10;
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

function TokenThumb({unit, unitTypeDetails, className = "map-unit-token-thumb"}) {
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

function LootTableFields({unit, unitIndex, availableItemKeys, itemDetails, onChooseItem, dispatch}) {
  const [chosenItem, setChosenItem] = useState("");
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
      </div>
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

function PositionButton({unitIndex, position, unitPlacement, onStartUnitPlacement}) {
  const isPlacingHere = unitPlacement?.unitIndex === unitIndex;
  return (
    <button
      type="button" className={`map-point-pill map-unit-position-btn${isPlacingHere ? " map-point-pill-pending" : ""}`}
      disabled={isPlacingHere}
      onClick={() => onStartUnitPlacement(unitIndex)}
    >
      {isPlacingHere ? "…" : `${round1(position.x)}, ${round1(position.y)}`}
    </button>
  );
}

// One unit's row - collapsed by default (token, name, type, loot icon);
// clicking it expands the full editing form, unless grouping mode is
// active, in which case any click here toggles this unit's membership in
// the group being edited instead (see UnitsPanel's handleRowClick).
function UnitRow({
  unit, index, expanded, hovered, rowRef, onRowClick, onHover, onRemove,
  availableUnitTypeKeys, unitTypeDetails, onChooseUnitType,
  unitPlacement, onStartUnitPlacement,
  availableItemKeys, itemDetails, onChooseItem,
  updateUnit, dispatch,
  inGroupingMode, isGroupingTarget,
}) {
  return (
    <div
      ref={rowRef}
      className={`entry-block map-unit-block${expanded ? " map-unit-expanded" : ""}${hovered ? " map-entry-hovered" : ""}${isGroupingTarget ? " map-unit-grouping-target" : ""}`}
      onMouseEnter={() => onHover(index)}
      onMouseLeave={() => onHover(null)}
    >
      <div className="entry-heading-row map-unit-row" onClick={() => onRowClick(index)}>
        <div className="map-unit-row-summary">
          <span className="map-sidebar-section-toggle">
            {inGroupingMode ? (isGroupingTarget ? "✓" : "") : (expanded ? "▾" : "▸")}
          </span>
          <TokenThumb unit={unit} unitTypeDetails={unitTypeDetails} className="map-unit-token-thumb map-unit-row-token" />
          <span className="map-unit-row-name">{unit.identifier || `Unit ${index + 1}`}</span>
          <span className="map-unit-row-type">{unitTypeLabel(unitTypeDetails, unit.unitType)}</span>
          <LootIcon unit={unit} />
        </div>
        {expanded && !inGroupingMode && (
          <button type="button" className="remove-entry" onClick={(e) => { e.stopPropagation(); onRemove(index); }}>
            Remove
          </button>
        )}
      </div>
      {expanded && !inGroupingMode && (
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
                  <th>HP</th>
                  <td>
                    <input
                      type="range" min="0" max="1" step="0.01" value={unit.currentHpFraction ?? 1}
                      onChange={(e) => updateUnit(index, {currentHpFraction: parseFloat(e.target.value)})}
                    />
                    {" "}{Math.round((unit.currentHpFraction ?? 1) * 100)}%
                  </td>
                </tr>
              </tbody>
            </table>
            <div className="map-unit-token-panel">
              <TokenThumb unit={unit} unitTypeDetails={unitTypeDetails} />
            </div>
          </div>
          <LootTableFields
            unit={unit} unitIndex={index}
            availableItemKeys={availableItemKeys} itemDetails={itemDetails} onChooseItem={onChooseItem}
            dispatch={dispatch}
          />
        </>
      )}
    </div>
  );
}

// A group's display name is renamed on blur/Enter, not per-keystroke -
// renaming dispatches UPDATE_ENTRY_FIELD for every member at once (see
// MapEditor's renameGroup), and committing on every keystroke would both
// thrash that and risk a mid-edit empty string briefly ungrouping every
// member (buildEntries below treats a falsy groupIdentifier as ungrouped).
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
      type="text" className="map-unit-group-name" value={value}
      onClick={(e) => e.stopPropagation()}
      onChange={(e) => setValue(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); }}
    />
  );
}

// A group is derived, not stored - see MapEditor's groupingMode/
// pendingGroupNames comments. Its header shows the shared name (editable),
// a member count, and the "Add/Remove Units" toggle for grouping mode;
// clicking the header itself (not the name field or button) collapses/
// expands the enclosed member rows, independent of each member's own
// expand state underneath.
function GroupBlock({
  identifier, memberIndices, collapsed, onToggleCollapsed,
  groupingMode, onStartGroupingMode, hoveredGroupIdentifier, onHoverGroup, onRenameGroup,
  renderMember,
}) {
  const isGroupingThis = groupingMode?.groupIdentifier === identifier;
  const isHighlighted = isGroupingThis || hoveredGroupIdentifier === identifier;

  return (
    <div
      className={`map-unit-group-block${isHighlighted ? " map-entry-hovered" : ""}`}
      onMouseEnter={() => onHoverGroup(identifier)}
      onMouseLeave={() => onHoverGroup(null)}
    >
      <div className="map-unit-group-header" onClick={() => onToggleCollapsed(identifier)}>
        <span className="map-sidebar-section-toggle">{collapsed ? "▸" : "▾"}</span>
        <GroupNameField identifier={identifier} onRename={onRenameGroup} />
        <span className="map-unit-group-count">({memberIndices.length})</span>
        <button
          type="button" className={`map-unit-group-toggle${isGroupingThis ? " map-unit-group-toggle-active" : ""}`}
          onClick={(e) => { e.stopPropagation(); onStartGroupingMode(identifier); }}
        >
          {isGroupingThis ? "Done" : "Add/Remove Units"}
        </button>
      </div>
      {!collapsed && (
        <div className="map-unit-group-members">
          {memberIndices.map((i) => renderMember(i))}
        </div>
      )}
    </div>
  );
}

// Splits units into flat (ungrouped) rows and group blocks, in units-array
// order - a group block appears at the position of its first member, and
// pulls in every other member regardless of where they sit in the array
// (see the map editor plan's Slice 7). pendingGroupNames (MapEditor-local,
// never written to mapData) appends any group created but not yet given a
// member, so "+ Add Group" has somewhere to show up before its first click.
function buildEntries(units, pendingGroupNames) {
  const entries = [];
  const seenGroups = new Set();
  units.forEach((unit, i) => {
    const gid = unit.groupIdentifier;
    if (!gid) {
      entries.push({type: "unit", index: i});
      return;
    }
    if (seenGroups.has(gid)) return;
    seenGroups.add(gid);
    const memberIndices = [];
    units.forEach((u, j) => { if (u.groupIdentifier === gid) memberIndices.push(j); });
    entries.push({type: "group", identifier: gid, memberIndices});
  });
  pendingGroupNames.forEach((name) => {
    if (!seenGroups.has(name)) entries.push({type: "group", identifier: name, memberIndices: []});
  });
  return entries;
}

export default function UnitsPanel({
  units, selectedIndex, onSelect, onHover, hoveredIndex,
  availableUnitTypeKeys, unitTypeDetails, onChooseUnitType, newUnitTypeUrl,
  availableItemKeys, itemDetails, onChooseItem, newItemUrl,
  onRefresh, refreshStatus,
  tool, placement, canPlaceOnMap, pendingUnitType, onStartAddUnit,
  unitPlacement, onStartUnitPlacement, dispatch,
  focusUnitRequest,
  groupingMode = null, onStartGroupingMode, onToggleGroupMember,
  hoveredGroupIdentifier = null, onHoverGroup, pendingGroupNames = [], onAddPendingGroup, onRenameGroup,
}) {
  const [sectionCollapsed, setSectionCollapsed] = useState(true);
  const [chosenUnitType, setChosenUnitType] = useState("");
  const [newGroupName, setNewGroupName] = useState("");
  // Each unit's row collapses independently - unlike the section-level
  // collapse above, there's no single "selected" unit: a row toggles only
  // itself on click, so several can be open at once (see PositionButton's
  // unitPlacement for the one thing that's still exclusive - re-placing a
  // position on the map).
  const [expandedIndices, setExpandedIndices] = useState(() => new Set());
  // A group block's own collapse - separate from its members' individual
  // expand state, which is preserved underneath while the block is closed.
  const [collapsedGroups, setCollapsedGroups] = useState(() => new Set());
  const toolBusy = tool !== "select" || !!placement || !!unitPlacement || !canPlaceOnMap;
  const rowRefs = useRef({});
  const pendingScrollIndexRef = useRef(null);

  function toggleExpanded(index) {
    setExpandedIndices((current) => {
      const next = new Set(current);
      if (next.has(index)) next.delete(index); else next.add(index);
      return next;
    });
  }

  function toggleGroupCollapsed(identifier) {
    setCollapsedGroups((current) => {
      const next = new Set(current);
      if (next.has(identifier)) next.delete(identifier); else next.add(identifier);
      return next;
    });
  }

  // While grouping mode is active, any unit click (this row's, or a
  // different one's) toggles membership instead of expanding/collapsing -
  // see MapEditor's toggleGroupMember.
  function handleRowClick(index) {
    if (groupingMode) {
      onToggleGroupMember(index);
      return;
    }
    toggleExpanded(index);
  }

  // A unit clicked *on the map* (see MapCanvas/MapEditor's focusUnitFromMap)
  // is different from clicking its row here: it opens that unit's row
  // exclusively (closing every other open row) and scrolls it into view -
  // clicking a row directly never closes any other row. focusUnitRequest
  // carries a nonce so re-clicking the same unit's token still re-scrolls.
  // If the unit is inside a collapsed group block, that block is opened too
  // (otherwise there'd be nothing in the DOM yet to scroll to).
  useEffect(() => {
    if (!focusUnitRequest) return;
    setSectionCollapsed(false);
    setExpandedIndices(new Set([focusUnitRequest.index]));
    const gid = units[focusUnitRequest.index]?.groupIdentifier;
    if (gid) {
      setCollapsedGroups((current) => {
        if (!current.has(gid)) return current;
        const next = new Set(current);
        next.delete(gid);
        return next;
      });
    }
    pendingScrollIndexRef.current = focusUnitRequest.index;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusUnitRequest]);

  useEffect(() => {
    const index = pendingScrollIndexRef.current;
    if (index === null) return;
    const el = rowRefs.current[index];
    if (el) {
      el.scrollIntoView({block: "nearest", behavior: "smooth"});
      pendingScrollIndexRef.current = null;
    }
  });

  function updateUnit(index, fields) {
    Object.entries(fields).forEach(([field, value]) => {
      dispatch({type: "UPDATE_ENTRY_FIELD", section: "units", index, field, value});
    });
  }

  function removeUnit(index) {
    dispatch({type: "REMOVE_ENTRY", section: "units", index});
    if (selectedIndex === index) onSelect(null);
    setExpandedIndices((current) => {
      if (!current.has(index)) return current;
      const next = new Set(current);
      next.delete(index);
      return next;
    });
  }

  function submitNewGroup(e) {
    e.preventDefault();
    if (!newGroupName.trim()) return;
    onAddPendingGroup(newGroupName);
    setNewGroupName("");
  }

  const entries = buildEntries(units, pendingGroupNames);

  // Shared, index-independent props for every UnitRow - deliberately
  // excludes anything that varies per row (expanded/hovered/rowRef/
  // isGroupingTarget, set explicitly in renderUnitRow below) so spread
  // order here can never accidentally clobber a per-row value.
  const unitRowProps = {
    onHover, onRemove: removeUnit,
    availableUnitTypeKeys, unitTypeDetails, onChooseUnitType,
    unitPlacement, onStartUnitPlacement,
    availableItemKeys, itemDetails, onChooseItem,
    updateUnit, dispatch,
    onRowClick: handleRowClick,
    inGroupingMode: !!groupingMode,
  };

  function renderUnitRow(index) {
    return (
      <UnitRow
        key={index}
        index={index}
        unit={units[index]}
        expanded={expandedIndices.has(index)}
        hovered={hoveredIndex === index}
        rowRef={(el) => { rowRefs.current[index] = el; }}
        isGroupingTarget={!!groupingMode && units[index].groupIdentifier === groupingMode.groupIdentifier}
        {...unitRowProps}
      />
    );
  }

  return (
    <>
      <div className="map-sidebar-section-heading" onClick={() => setSectionCollapsed((c) => !c)}>
        <span className="map-sidebar-section-toggle">{sectionCollapsed ? "▸" : "▾"}</span>
        <h3>Units{units.length > 0 ? ` (${units.length})` : ""}</h3>
      </div>
      {!sectionCollapsed && (
        <>
          <p className="map-sidebar-unit-type-links">
            <a href={newUnitTypeUrl} target="_blank" rel="noreferrer">+ New Unit Type</a>{" "}
            <a href={newItemUrl} target="_blank" rel="noreferrer">+ New Item</a>{" "}
            <button type="button" onClick={(e) => { e.stopPropagation(); onRefresh(); }}>Refresh</button>{" "}
            {refreshStatus}
          </p>
          <div className="add-buttons-row">
            <select
              value={chosenUnitType}
              onChange={(e) => { setChosenUnitType(e.target.value); onChooseUnitType(e.target.value); }}
            >
              <option value="">Choose unit type…</option>
              {availableUnitTypeKeys.map((key) => (
                <option key={key} value={key}>{unitTypeLabel(unitTypeDetails, key)}</option>
              ))}
            </select>
            <button
              type="button" className="add-entry" disabled={!chosenUnitType || toolBusy}
              onClick={(e) => { e.stopPropagation(); onStartAddUnit(chosenUnitType); }}
            >
              + Add Unit
            </button>
          </div>
          <form className="add-buttons-row" onSubmit={submitNewGroup}>
            <input
              type="text" placeholder="New group name…" value={newGroupName}
              onClick={(e) => e.stopPropagation()}
              onChange={(e) => setNewGroupName(e.target.value)}
            />
            <button type="submit" className="add-entry" disabled={!newGroupName.trim()}>+ Add Group</button>
          </form>
          {!canPlaceOnMap && <p className="map-sidebar-hint">Set feet dimensions (above) before placing units.</p>}
          {groupingMode && (
            <p className="map-sidebar-hint">
              Grouping "{groupingMode.groupIdentifier}" - click units (here or on the map) to add or remove them.
              Press Escape or click "Done" to finish.
            </p>
          )}
          {entries.length === 0 && tool !== "add-unit" && (
            <p className="map-editor-sidebar-placeholder">No units yet - pick a unit type above and click "+ Add Unit".</p>
          )}
          {entries.map((entry) => (
            entry.type === "unit"
              ? renderUnitRow(entry.index)
              : (
                <GroupBlock
                  key={`group-${entry.identifier}`}
                  identifier={entry.identifier}
                  memberIndices={entry.memberIndices}
                  collapsed={collapsedGroups.has(entry.identifier)}
                  onToggleCollapsed={toggleGroupCollapsed}
                  groupingMode={groupingMode}
                  onStartGroupingMode={onStartGroupingMode}
                  hoveredGroupIdentifier={hoveredGroupIdentifier}
                  onHoverGroup={onHoverGroup}
                  onRenameGroup={onRenameGroup}
                  renderMember={renderUnitRow}
                />
              )
          ))}
          {/* Nothing is written to mapData until the map click actually
              happens (see MapCanvas) - this is purely a "something's in
              progress" cue, at the position the real entry will land once
              placed (the list's end). */}
          {tool === "add-unit" && (
            <div className="entry-block map-entry-pending">
              <div className="entry-heading-row">
                <h3>Unit {units.length + 1}: {unitTypeLabel(unitTypeDetails, pendingUnitType)} <span className="map-entry-summary">(placing…)</span></h3>
              </div>
            </div>
          )}
        </>
      )}
    </>
  );
}
