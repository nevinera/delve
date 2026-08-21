import { useCallback, useEffect, useRef, useState } from "react";

const RESPAWN_DELAY_S = 10;
import Canvas from "./Canvas";
import { GameConnection } from "./game/connection";

// W/S/Q/E → movement keys sent to server; A/D → turning handled by SceneManager
const KEY_MAP = {
  KeyW: "forward",
  KeyS: "backward",
  KeyQ: "strafe_left",
  KeyE: "strafe_right",
  KeyA: "turn_left",
  KeyD: "turn_right",
};
const MOVEMENT_KEYS = new Set(["forward", "backward", "strafe_left", "strafe_right"]);
const TURN_KEYS = new Set(["turn_left", "turn_right"]);

const styles = {
  root: {
    display: "flex",
    flexDirection: "column",
    width: "100vw",
    height: "100vh",
    background: "#111",
    color: "#ddd",
    fontFamily: "monospace",
    fontSize: 13,
    overflow: "hidden",
  },
  frames: {
    display: "flex",
    flexShrink: 0,
    height: 90,
  },
  selfFrame: {
    flex: 1,
    position: "relative",
    background: "#0d2b0d",
    border: "1px solid #2a6a2a",
    padding: 8,
  },
  targetFrame: {
    flex: 1,
    position: "relative",
    background: "#2b0d0d",
    border: "1px solid #6a2a2a",
    padding: 8,
  },
  targetRange: {
    fontSize: 11,
    color: "#999",
    display: "block",
    marginTop: 1,
  },
  deadBadge: {
    position: "absolute",
    top: 6,
    right: 8,
    fontSize: 22,
    fontWeight: "bold",
    color: "#cc2222",
    letterSpacing: 2,
    textShadow: "0 0 6px #000, 0 1px 4px #000",
    pointerEvents: "none",
  },
  actionBar: {
    position: "relative",
    flexShrink: 0,
    display: "flex",
    justifyContent: "center",
    alignItems: "center",
    gap: 4,
    padding: "4px 8px",
    background: "#111",
    borderTop: "1px solid #333",
  },
  charSheetButton: {
    position: "absolute",
    left: 8,
    bottom: 4,
    width: 52,
    height: 26,
    background: "#1c1c1c",
    border: "1px solid #444",
    borderRadius: 4,
    color: "#999",
    fontSize: 10,
    letterSpacing: 0.5,
    cursor: "pointer",
  },
  actionButton: {
    position: "relative",
    width: 52,
    height: 52,
    background: "#1c1c1c",
    border: "1px solid #444",
    borderRadius: 4,
    cursor: "default",
    flexShrink: 0,
    overflow: "hidden",
  },
  actionIcon: {
    position: "absolute",
    inset: 4,
    objectFit: "contain",
  },
  actionButtonFlash: {
    borderColor: "#cc0",
    boxShadow: "inset 0 0 10px rgba(255, 220, 50, 0.5)",
    background: "#2a2a0a",
  },
  actionCooldownOverlay: {
    position: "absolute",
    inset: 0,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    pointerEvents: "none",
  },
  actionCooldownText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "bold",
    textShadow: "0 0 4px #000, 0 1px 3px #000",
    lineHeight: 1,
  },
  actionKeybind: {
    position: "absolute",
    bottom: 2,
    right: 4,
    fontSize: 10,
    color: "#666",
    lineHeight: 1,
    pointerEvents: "none",
  },
  log: {
    flexShrink: 0,
    height: 110,
    background: "#1a1a1a",
    borderTop: "1px solid #333",
    padding: "6px 8px",
    overflowY: "auto",
    lineHeight: 1.5,
  },
  canvasWrapper: {
    flex: 1,
    position: "relative",
    overflow: "hidden",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    background: "#000",
  },
  respawnOverlay: {
    position: "absolute",
    top: 12,
    left: "50%",
    transform: "translateX(-50%)",
    zIndex: 10,
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: 6,
    background: "rgba(0,0,0,0.7)",
    border: "1px solid #555",
    borderRadius: 6,
    padding: "8px 18px",
    pointerEvents: "auto",
  },
  respawnCountdown: {
    fontSize: 20,
    fontWeight: "bold",
    color: "#cc2222",
    letterSpacing: 1,
  },
  respawnButton: {
    fontSize: 16,
    fontWeight: "bold",
    padding: "6px 20px",
    background: "#2a5a2a",
    color: "#cfc",
    border: "1px solid #4a9a4a",
    borderRadius: 4,
    cursor: "pointer",
  },
  lootWindow: {
    position: "absolute",
    zIndex: 20,
    background: "rgba(20,16,12,0.95)",
    border: "1px solid #7a5a2a",
    borderRadius: 6,
    padding: "10px 16px 14px",
    minWidth: 260,
    pointerEvents: "auto",
  },
  lootHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
    cursor: "move",
    userSelect: "none",
  },
  lootTitle: {
    fontSize: 15,
    fontWeight: "bold",
    color: "#d4a84b",
    letterSpacing: 1,
    textTransform: "uppercase",
  },
  lootClose: {
    background: "none",
    border: "none",
    color: "#888",
    fontSize: 16,
    cursor: "pointer",
    lineHeight: 1,
    padding: "0 2px",
  },
  lootList: {
    listStyle: "none",
    margin: 0,
    padding: 0,
    display: "flex",
    flexDirection: "column",
    gap: 6,
  },
  lootItem: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "baseline",
    gap: 12,
    padding: "4px 0",
    borderBottom: "1px solid #333",
  },
  lootItemName: {
    color: "#e8d5a0",
    fontSize: 13,
  },
  lootItemMeta: {
    color: "#888",
    fontSize: 11,
    whiteSpace: "nowrap",
  },
  lootTake: {
    background: "none",
    border: "1px solid #7a5a2a",
    borderRadius: 3,
    color: "#d4a84b",
    fontSize: 11,
    cursor: "pointer",
    padding: "1px 6px",
    whiteSpace: "nowrap",
  },
  lootOwned: {
    color: "#888",
    fontSize: 11,
    marginLeft: 4,
  },
  charSheetWrapper: {
    position: "absolute",
    zIndex: 25,
    left: "50%",
    top: "50%",
    transform: "translate(-50%, -50%)",
    display: "flex",
    alignItems: "flex-start",
    gap: 8,
  },
  charSheet: {
    background: "rgba(20,16,12,0.97)",
    border: "1px solid #7a5a2a",
    borderRadius: 6,
    padding: "10px 16px 14px",
    width: 480,
    pointerEvents: "auto",
  },
  charSheetCandidatePane: {
    background: "rgba(20,16,12,0.97)",
    border: "1px solid #7a5a2a",
    borderRadius: 6,
    padding: "10px 16px 14px",
    width: 220,
    pointerEvents: "auto",
  },
  charSheetCandidateTitle: {
    fontSize: 12,
    fontWeight: "bold",
    color: "#d4a84b",
    letterSpacing: 0.5,
    textTransform: "uppercase",
    marginBottom: 8,
  },
  charSheetCandidateList: {
    listStyle: "none",
    margin: 0,
    padding: 0,
    display: "flex",
    flexDirection: "column",
    gap: 4,
    maxHeight: 320,
    overflowY: "auto",
  },
  charSheetCandidateItem: {
    fontSize: 12,
    color: "#e8d5a0",
    padding: "3px 2px",
    borderBottom: "1px solid #333",
  },
  charSheetCandidateEmpty: {
    fontSize: 12,
    color: "#555",
  },
  charSheetEquipRowClickable: {
    cursor: "pointer",
  },
  charSheetEquipRowHover: {
    background: "rgba(212,168,75,0.06)",
  },
  charSheetEquipRowExpanded: {
    background: "rgba(212,168,75,0.12)",
  },
  charSheetHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 10,
  },
  charSheetTitle: {
    fontSize: 15,
    fontWeight: "bold",
    color: "#d4a84b",
    letterSpacing: 1,
    textTransform: "uppercase",
  },
  charSheetBody: {
    display: "flex",
    gap: 20,
  },
  charSheetColumn: {
    flex: 1,
    minWidth: 0,
  },
  charSheetColumnTitle: {
    fontSize: 11,
    color: "#888",
    textTransform: "uppercase",
    letterSpacing: 1,
    marginBottom: 6,
  },
  charSheetEquipList: {
    listStyle: "none",
    margin: 0,
    padding: 0,
    display: "flex",
    flexDirection: "column",
    gap: 2,
  },
  charSheetEquipRow: {
    display: "flex",
    justifyContent: "space-between",
    gap: 8,
    padding: "3px 0",
    borderBottom: "1px solid #333",
    fontSize: 12,
  },
  charSheetSlotLabel: {
    color: "#888",
    whiteSpace: "nowrap",
  },
  charSheetEmptySlot: {
    color: "#555",
  },
  charSheetStatGroup: {
    marginBottom: 10,
  },
  charSheetStatGroupTitle: {
    fontSize: 13,
    color: "#888",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    paddingTop: 6,
    marginBottom: 3,
  },
  charSheetStatsList: {
    listStyle: "none",
    margin: 0,
    padding: 0,
    display: "flex",
    flexDirection: "column",
    gap: 3,
  },
  charSheetStatRow: {
    display: "flex",
    justifyContent: "space-between",
    fontSize: 12,
    color: "#7fae7f",
  },
  itemTooltipAnchor: {
    display: "inline-block",
    cursor: "default",
  },
  itemTooltip: {
    position: "fixed",
    zIndex: 100,
    background: "rgba(20,16,12,0.97)",
    border: "1px solid #7a5a2a",
    borderRadius: 6,
    padding: "8px 12px",
    minWidth: 180,
    maxWidth: 320,
    pointerEvents: "none",
  },
  itemTooltipName: {
    color: "#d4a84b",
    fontSize: 14,
    fontWeight: "bold",
  },
  itemTooltipMeta: {
    color: "#999",
    fontSize: 11,
    marginTop: 2,
  },
  itemTooltipStats: {
    marginTop: 6,
    display: "flex",
    flexDirection: "column",
    gap: 1,
  },
  itemTooltipStat: {
    color: "#7fae7f",
    fontSize: 12,
  },
  itemTooltipDescription: {
    color: "#aaa",
    fontSize: 12,
    fontStyle: "italic",
    marginTop: 6,
  },
  unitTooltip: {
    position: "absolute",
    top: 8,
    right: 8,
    zIndex: 15,
    background: "rgba(20,16,12,0.95)",
    border: "1px solid #555",
    borderRadius: 6,
    padding: "8px 12px",
    minWidth: 160,
    pointerEvents: "none",
  },
  unitTooltipName: {
    color: "#e8d5a0",
    fontSize: 14,
    fontWeight: "bold",
  },
  unitTooltipStatus: {
    fontSize: 11,
    color: "#999",
    marginTop: 4,
  },
  unitTooltipTag: {
    fontSize: 11,
    color: "#d4a84b",
    marginTop: 2,
  },
};

function UnitBar({ label, current, max }) {
  const pct = max > 0 ? Math.round((current / max) * 100) : 0;
  return (
    <div style={{ fontSize: 11, marginTop: 4, color: "#aaa" }}>
      {label} {current?.toFixed(0)}/{max?.toFixed(0)} ({pct}%)
    </div>
  );
}

function HealthBar({ current, max }) {
  const pct = max > 0 ? Math.max(0, Math.min(1, current / max)) : 0;
  return (
    <div style={{
      position: "absolute",
      bottom: 6,
      left: 6,
      right: 6,
      height: 9,
      border: "1px solid #3a8a3a",
      borderRadius: 2,
      background: "#5a1010",
    }}>
      <div style={{
        width: `${pct * 100}%`,
        height: "100%",
        background: "#2a7a2a",
        borderRadius: 1,
      }} />
    </div>
  );
}

// Returns the maximum range in feet for a power, or null for self-only powers.
// The JSON range field may be a number (e.g. 5.0) or a [min, max] array.
function powerMaxRange(power) {
  for (const effect of power.effects ?? []) {
    const r = effect.range;
    if (r == null) continue;
    return Array.isArray(r) ? r[1] : r;
  }
  return null;
}

function formatUnitName(unit) {
  const raw = unit?.unit_type_identifier || unit?.zone_unit_identifier;
  if (!raw) return "Unknown";
  return raw
    .replace(/^player:/, "")
    .split("_")
    .map(w => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

const UNIT_STATUS_LABELS = {
  idle: "Idle",
  engaged: "Engaged",
  leashing: "Leashing",
  dead: "Dead",
};

// Fixed to the upper-right corner of the canvas region, shown while
// hovering any token other than the current character.
export function UnitTooltip({ unit, selfUnitId }) {
  if (!unit) return null;

  const tagLabel = unit.tagged_by == null
    ? null
    : unit.tagged_by === selfUnitId
      ? "Tagged by you"
      : "Tagged by another player";

  return (
    <div style={styles.unitTooltip}>
      <div style={styles.unitTooltipName}>{formatUnitName(unit)}</div>
      <UnitBar label="HP" current={unit.health} max={unit.max_health} />
      <div style={styles.unitTooltipStatus}>
        {UNIT_STATUS_LABELS[unit.status] || unit.status}
      </div>
      {tagLabel && <div style={styles.unitTooltipTag}>{tagLabel}</div>}
    </div>
  );
}

const STAT_LABELS = {
  strength: "Strength",
  agility: "Agility",
  intellect: "Intellect",
  stamina: "Stamina",
  crit_rating: "Crit Rating",
  haste_rating: "Haste Rating",
  mastery_rating: "Mastery Rating",
  versatility_rating: "Versatility Rating",
  resilience_rating: "Resilience Rating",
  weapon_dps: "Weapon DPS",
};

// Wraps its children in a hover target that shows a WoW-style item tooltip
// near the cursor. `item` should have {name, slot, ilvl, description, stats}.
export function ItemTooltip({ item, children, style }) {
  const [pos, setPos] = useState(null); // {x, y} in viewport coords, or null when hidden

  if (!item) return children;

  const stats = Object.entries(item.stats || {}).filter(([, v]) => v);

  return (
    <span
      style={{ ...styles.itemTooltipAnchor, ...style }}
      onMouseEnter={e => setPos({ x: e.clientX, y: e.clientY })}
      onMouseMove={e => setPos({ x: e.clientX, y: e.clientY })}
      onMouseLeave={() => setPos(null)}
    >
      {children}
      {pos && (
        <div style={{ ...styles.itemTooltip, left: pos.x + 16, top: pos.y + 16 }}>
          <div style={styles.itemTooltipName}>{item.name}</div>
          {(item.slot || item.ilvl != null) && (
            <div style={styles.itemTooltipMeta}>
              {[item.slot, item.ilvl != null && `ilvl ${item.ilvl}`].filter(Boolean).join(" · ")}
            </div>
          )}
          {stats.length > 0 && (
            <div style={styles.itemTooltipStats}>
              {stats.map(([key, value]) => (
                <div key={key} style={styles.itemTooltipStat}>
                  +{value} {STAT_LABELS[key] || key}
                </div>
              ))}
            </div>
          )}
          {item.description && (
            <div style={styles.itemTooltipDescription}>{item.description}</div>
          )}
        </div>
      )}
    </span>
  );
}

const EQUIPPED_SLOT_LABELS = {
  head: "Head",
  neck: "Neck",
  shoulders: "Shoulders",
  back: "Back",
  chest: "Chest",
  wrists: "Wrists",
  hands: "Hands",
  waist: "Waist",
  legs: "Legs",
  feet: "Feet",
  ring_1: "Left Ring",
  ring_2: "Right Ring",
  trinket_1: "Left Trinket",
  trinket_2: "Right Trinket",
  main_hand: "Main Hand",
  off_hand: "Off Hand",
};
const EQUIPPED_SLOT_ORDER = Object.keys(EQUIPPED_SLOT_LABELS);

// Mirrors EquippedItem::SLOT_TYPES (app/models/equipped_item.rb) — which
// CharacterItem#slot values are compatible with a given equipped slot.
const EQUIPPABLE_ITEM_SLOTS = {
  ring_1: ["ring"],
  ring_2: ["ring"],
  trinket_1: ["trinket"],
  trinket_2: ["trinket"],
  main_hand: ["main_hand", "one_hand", "two_hand"],
  off_hand: ["off_hand", "one_hand"],
};
function itemSlotsFor(equippedSlot) {
  return EQUIPPABLE_ITEM_SLOTS[equippedSlot] || [equippedSlot];
}

const STAT_GROUPS = [
  { title: "Primary", keys: ["strength", "agility", "intellect", "stamina", "weapon_dps"] },
  { title: "Secondary", keys: ["crit_rating", "haste_rating", "mastery_rating", "versatility_rating", "resilience_rating"] },
];

// The equipped-items payload only carries provenance (identifier, source,
// stats) — no display name — so derive a readable label from the identifier.
export function formatItemName(identifier) {
  if (!identifier) return "—";
  return identifier
    .replace(/[-_]/g, " ")
    .split(" ")
    .filter(Boolean)
    .map(w => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

function netStats(equippedItems) {
  const total = {};
  for (const item of Object.values(equippedItems || {})) {
    for (const [key, value] of Object.entries(item.stats || {})) {
      total[key] = (total[key] || 0) + value;
    }
  }
  return total;
}

// Scrollable list of candidate items for one equipped slot, shown to the
// left of the character sheet. View-only: clicking an item does not equip it.
function CandidateItemsPane({ slotLabel, loading, items, onClose }) {
  return (
    <div style={styles.charSheetCandidatePane}>
      <div style={styles.charSheetHeader}>
        <span style={styles.charSheetCandidateTitle}>{slotLabel}</span>
        <button style={styles.lootClose} onClick={onClose}>✕</button>
      </div>
      {loading ? (
        <div style={styles.charSheetCandidateEmpty}>Loading…</div>
      ) : items.length === 0 ? (
        <div style={styles.charSheetCandidateEmpty}>No items available.</div>
      ) : (
        <ul style={styles.charSheetCandidateList}>
          {items.map(item => (
            <li key={item.id} style={styles.charSheetCandidateItem}>
              <ItemTooltip item={item}>
                <span>{item.name}</span>
              </ItemTooltip>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// View-only character sheet: equipped items on the left, summed raw stats
// on the right. Toggled by the "P" hotkey or the action-bar button.
// Clicking an equipped item opens a candidate-item pane to its left (view
// only for now — no equipping yet).
export function CharacterSheet({ open, equippedItems, characterItemsUrl, onClose }) {
  const [expandedSlot, setExpandedSlot] = useState(null);
  const [hoveredSlot, setHoveredSlot] = useState(null);
  const [candidateItems, setCandidateItems] = useState([]);
  const [candidateLoading, setCandidateLoading] = useState(false);

  useEffect(() => {
    if (!open) setExpandedSlot(null);
  }, [open]);

  useEffect(() => {
    if (!expandedSlot || !characterItemsUrl) return;
    setCandidateLoading(true);
    const params = new URLSearchParams();
    itemSlotsFor(expandedSlot).forEach(s => params.append("slot[]", s));
    const equippedSourceKeys = new Set(Object.values(equippedItems || {}).map(i => i.source_key));
    fetch(`${characterItemsUrl}?${params.toString()}`)
      .then(r => r.json())
      .then(items => setCandidateItems(items.filter(i => !equippedSourceKeys.has(i.source_key))))
      .catch(() => setCandidateItems([]))
      .finally(() => setCandidateLoading(false));
  }, [expandedSlot, characterItemsUrl, equippedItems]);

  if (!open) return null;

  const stats = netStats(equippedItems);

  const toggleSlot = (slot) => {
    setExpandedSlot(current => (current === slot ? null : slot));
  };

  return (
    <div style={styles.charSheetWrapper}>
      {expandedSlot && (
        <CandidateItemsPane
          slotLabel={EQUIPPED_SLOT_LABELS[expandedSlot]}
          loading={candidateLoading}
          items={candidateItems}
          onClose={() => setExpandedSlot(null)}
        />
      )}
      <div style={styles.charSheet}>
        <div style={styles.charSheetHeader}>
          <span style={styles.charSheetTitle}>Character</span>
          <button style={styles.lootClose} onClick={onClose}>✕</button>
        </div>
        <div style={styles.charSheetBody}>
          <div style={styles.charSheetColumn}>
            <div style={styles.charSheetColumnTitle}>Equipment</div>
            <ul style={styles.charSheetEquipList}>
              {EQUIPPED_SLOT_ORDER.map(slot => {
                const item = equippedItems?.[slot];
                const rowStyle = {
                  ...styles.charSheetEquipRow,
                  ...(item ? styles.charSheetEquipRowClickable : {}),
                  ...(hoveredSlot === slot ? styles.charSheetEquipRowHover : {}),
                  ...(expandedSlot === slot ? styles.charSheetEquipRowExpanded : {}),
                };
                return (
                  <li
                    key={slot}
                    style={rowStyle}
                    onClick={item ? () => toggleSlot(slot) : undefined}
                    onMouseEnter={item ? () => setHoveredSlot(slot) : undefined}
                    onMouseLeave={item ? () => setHoveredSlot(current => (current === slot ? null : current)) : undefined}
                  >
                    <span style={styles.charSheetSlotLabel}>{EQUIPPED_SLOT_LABELS[slot]}</span>
                    {item ? (
                      <ItemTooltip item={{ ...item, name: formatItemName(item.identifier) }} style={{ cursor: "pointer" }}>
                        <span style={styles.lootItemName}>{formatItemName(item.identifier)}</span>
                      </ItemTooltip>
                    ) : (
                      <span style={styles.charSheetEmptySlot}>Empty</span>
                    )}
                  </li>
                );
              })}
            </ul>
          </div>
          <div style={styles.charSheetColumn}>
            <div style={styles.charSheetColumnTitle}>Stats</div>
            {STAT_GROUPS.map(group => (
              <div key={group.title} style={styles.charSheetStatGroup}>
                <div style={styles.charSheetStatGroupTitle}>{group.title}</div>
                <ul style={styles.charSheetStatsList}>
                  {group.keys.map(key => (
                    <li key={key} style={styles.charSheetStatRow}>
                      <span>{STAT_LABELS[key] || key}</span>
                      <span>{stats[key] || 0}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

const CLAIM_LABEL = {
  owned:          "(owned)",
  upgraded:       "(upgraded)",
  upgrade:        "(upgrading...)",
  locked_for_me:  "(taking...)",
  locked:         "(locked)",
  gone:           "(gone)",
  received:       "(received)",
};

// unitHasLootClaim reports whether characterUnitId holds any claim entry
// (of any state) on lootItems — i.e. whether they tagged the unit.
export function unitHasLootClaim(lootItems, characterUnitId) {
  return !!lootItems?.some(i => i.claims?.some(c => c.character_unit_id === characterUnitId));
}

export function LootWindow({ unitId, items, selfUnitId, onTake, onClose }) {
  const [pos, setPos] = useState({ fx: 0.0, fy: 0.5 }); // {fx, fy} fractional coords of upper-left within canvasWrapper
  const elRef = useRef(null);

  const handleHeaderMouseDown = (e) => {
    if (e.button !== 0) return;
    e.preventDefault();
    const rect = elRef.current.getBoundingClientRect();
    const parentRect = elRef.current.offsetParent.getBoundingClientRect();
    const originFx = (rect.left - parentRect.left) / parentRect.width;
    const originFy = (rect.top - parentRect.top) / parentRect.height;
    const startX = e.clientX;
    const startY = e.clientY;
    const onMouseMove = (mv) => {
      setPos({
        fx: originFx + (mv.clientX - startX) / parentRect.width,
        fy: originFy + (mv.clientY - startY) / parentRect.height,
      });
    };
    const onMouseUp = () => {
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
    };
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
  };

  if (!items?.length) return null;

  const windowStyle = { ...styles.lootWindow, left: `${pos.fx * 100}%`, top: `${pos.fy * 100}%`, transform: "none" };

  return (
    <div ref={elRef} style={windowStyle}>
      <div style={styles.lootHeader} onMouseDown={handleHeaderMouseDown}>
        <span style={styles.lootTitle}>Loot</span>
        <button style={styles.lootClose} onClick={onClose}>✕</button>
      </div>
      <ul style={styles.lootList}>
        {items.map((item, i) => {
          const myState = item.claims?.find(c => c.character_unit_id === selfUnitId)?.state;
          const label = CLAIM_LABEL[myState];
          const canTake = myState === "available";
          return (
            <li key={i} style={styles.lootItem}>
              <ItemTooltip item={item}>
                <span style={styles.lootItemName}>
                  {item.name}
                  {label && <span style={styles.lootOwned}> {label}</span>}
                </span>
              </ItemTooltip>
              <span style={styles.lootItemMeta}>{item.slot} · ilvl {item.ilvl}</span>
              {canTake && <button style={styles.lootTake} onClick={() => onTake(unitId, i)}>Take</button>}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function RespawnOverlay({ deathTime, onRespawn }) {
  const [remaining, setRemaining] = useState(RESPAWN_DELAY_S);

  useEffect(() => {
    if (!deathTime) return;
    const update = () => setRemaining(Math.max(0, RESPAWN_DELAY_S - (Date.now() - deathTime) / 1000));
    update();
    const id = setInterval(update, 100);
    return () => clearInterval(id);
  }, [deathTime]);

  if (!deathTime) return null;

  return (
    <div style={styles.respawnOverlay}>
      {remaining > 0
        ? <span style={styles.respawnCountdown}>Respawn in {Math.ceil(remaining)}s</span>
        : <button style={styles.respawnButton} onClick={onRespawn}>Respawn</button>
      }
    </div>
  );
}

export default function App({
  slotToken,
  gameServerUrl,
  instanceId,
  slotId,
  zoneSourceUrl,
  characterName,
  characterTokenUrl,
  classConfigUrl,
  ownedZoneItems: initialOwnedZoneItems = {},
  equippedItems = {},
  characterItemsUrl,
}) {
  const connRef = useRef(null);
  const canvasRef = useRef(null);
  const movementKeysRef = useRef(new Set());
  const turnKeysRef = useRef(new Set());
  const facingRef = useRef(0); // degrees
  const selfPosRef = useRef(null); // latest client-predicted position {x, y}
  const selfIdentifierRef = useRef(`player:${characterName}`);
  selfIdentifierRef.current = `player:${characterName}`;
  const [units, setUnits] = useState({});
  const [targetId, setTargetId] = useState(null);
  const [hoveredUnitId, setHoveredUnitId] = useState(null);
  const unitsRef = useRef({});
  const targetIdRef = useRef(null);
  const [disconnected, setDisconnected] = useState(false);
  const [log, setLog] = useState(["Connecting…"]);
  const [lootWindowUnitId, setLootWindowUnitId] = useState(null);
  const [charSheetOpen, setCharSheetOpen] = useState(false);
  const [powers, setPowers] = useState([]);
  const [flashSlot, setFlashSlot] = useState(null);
  const [gcdEndsAt, setGcdEndsAt] = useState(0);   // epoch ms; drives cooldown display
  const gcdEndsAtRef = useRef(0);                   // same value, safe to read in callbacks
  const gcdTotalMsRef = useRef(0);                  // duration of the current GCD window
  const npcPowersByZoneIdRef = useRef({});          // { [zoneUnitId]: { [powerName]: power } }

  const setGcd = useCallback((ms) => {
    gcdEndsAtRef.current = ms;
    setGcdEndsAt(ms);
  }, []);

  // Tick re-renders at 50ms while GCD is active for smooth sweep animation.
  const [, setTick] = useState(0);
  useEffect(() => {
    if (gcdEndsAt <= Date.now()) return;
    const id = setInterval(() => {
      setTick(t => t + 1);
      if (Date.now() >= gcdEndsAt) clearInterval(id);
    }, 50);
    return () => clearInterval(id);
  }, [gcdEndsAt]);


  useEffect(() => {
    if (!classConfigUrl) return;
    fetch(classConfigUrl)
      .then(r => r.json())
      .then(cfg => setPowers(cfg.powers ?? []))
      .catch(() => {});
  }, [classConfigUrl]);

  useEffect(() => {
    if (!zoneSourceUrl) return;
    fetch(zoneSourceUrl)
      .then(r => r.json())
      .then(zone => {
        const byId = {};
        for (const map of zone.maps ?? []) {
          for (const unit of map.units ?? []) {
            const ut = zone.unitTypes?.[unit.unitType];
            if (!ut) continue;
            const byName = {};
            for (const p of ut.powers ?? []) {
              byName[p.name] = p;
            }
            byId[unit.identifier] = byName;
          }
        }
        npcPowersByZoneIdRef.current = byId;
      })
      .catch(() => {});
  }, [zoneSourceUrl]);

  const addLog = (msg) => setLog((prev) => [...prev.slice(-99), msg]);

  const handleTargetUnit = useCallback((id) => {
    if (id != null) {
      const self = Object.values(unitsRef.current).find(u => u.zone_unit_identifier === selfIdentifierRef.current);
      const tgt = unitsRef.current[id];
      if (self && tgt) {
        const dx = tgt.position.x - self.position.x;
        const dy = tgt.position.y - self.position.y;
        if (Math.sqrt(dx * dx + dy * dy) > 60) return;
      }
    }
    targetIdRef.current = id;
    setTargetId(id);
    connRef.current?.send({
      direction: "up",
      type: "target",
      target_id: id ?? null,
    });
  }, []);

  const usePower = useCallback((slot) => {
    const selfUnit = Object.values(unitsRef.current).find(u => u.zone_unit_identifier === selfIdentifierRef.current);
    if (selfUnit?.status === "dead") return;
    if (Date.now() < gcdEndsAtRef.current) return;
    const power = powers[slot];
    if (!power) return;
    if (power.cooldown > 0) {
      const cdEndsAt = selfUnit?.power_cooldowns?.[power.name] ?? 0;
      if (Date.now() < cdEndsAt) return;
    }
    // Mirror server-side rejection checks so we don't set GCD on commands that
    // will certainly be rejected (target missing, dead, or out of range).
    const range = powerMaxRange(power);
    if (range != null) {
      let target = targetIdRef.current ? unitsRef.current[targetIdRef.current] : null;
      if (!target || target.status === "dead") {
        const nearestId = Object.entries(unitsRef.current)
          .filter(([, u]) =>
            u.hostility === "hostile" &&
            u.map_identifier === selfUnit?.map_identifier &&
            u.status !== "dead"
          )
          .map(([id, u]) => {
            const dx = u.position.x - (selfUnit?.position.x ?? 0);
            const dy = u.position.y - (selfUnit?.position.y ?? 0);
            return { id, dist: Math.sqrt(dx * dx + dy * dy) };
          })
          .filter(h => h.dist <= 60)
          .sort((a, b) => a.dist - b.dist)[0]?.id ?? null;
        if (!nearestId) return;
        handleTargetUnit(nearestId);
        target = unitsRef.current[nearestId];
      }
      const self = selfPosRef.current;
      if (self) {
        const selfRadius = Object.values(unitsRef.current).find(u => u.zone_unit_identifier === selfIdentifierRef.current)?.radius ?? 0;
        const dx = target.position.x - self.x;
        const dy = target.position.y - self.y;
        if (Math.sqrt(dx * dx + dy * dy) > range + selfRadius + (target.radius ?? 0)) return;
        if (power.frontal !== false) {
          const toTarget = Math.atan2(dx, dy) * 180 / Math.PI;
          let diff = toTarget - facingRef.current;
          while (diff > 180) diff -= 360;
          while (diff < -180) diff += 360;
          if (Math.abs(diff) > 75) return;
        }
      }
    }
    const totalMs = power.globalCooldown * 1000;
    gcdTotalMsRef.current = totalMs;
    setGcd(Date.now() + totalMs);
    connRef.current?.send({ direction: "up", type: "use_power", slot });
    setFlashSlot(slot);
    setTimeout(() => setFlashSlot(null), 150);
    if (power.graphicEffects?.length) {
      const targetUnit = targetIdRef.current ? unitsRef.current[targetIdRef.current] : null;
      canvasRef.current?.playGraphicEffects(
        power.graphicEffects,
        { self: selfPosRef.current, target: targetUnit?.position },
        classConfigUrl,
      );
    }
  }, [powers, setGcd, classConfigUrl, handleTargetUnit]);

  const sendMove = useCallback(() => {
    const pos = selfPosRef.current;
    connRef.current?.send({
      direction: "up",
      type: "move",
      facing: facingRef.current,
      keys: [...movementKeysRef.current],
      ...(pos !== null ? { x: pos.x, y: pos.y } : {}),
    });
  }, []);

  const handleSelfPosition = useCallback((pos) => {
    selfPosRef.current = pos;
    sendMove();
  }, [sendMove]);

  // Called by SceneManager when continuous turning updates the facing angle
  const handleFacingChange = useCallback((degrees) => {
    facingRef.current = ((degrees % 360) + 360) % 360;
    sendMove();
  }, [sendMove]);

  const handleTabTarget = useCallback((unitsSnapshot, currentTargetId, selfId) => {
    const selfUnit = Object.values(unitsSnapshot).find(u => u.zone_unit_identifier === selfId);
    if (!selfUnit) return;

    const hostiles = Object.entries(unitsSnapshot)
      .filter(([, u]) =>
        u.hostility === "hostile" &&
        u.map_identifier === selfUnit.map_identifier &&
        u.status !== "dead" &&
        (canvasRef.current?.isInView(u.position.x, u.position.y) ?? true)
      )
      .map(([id, u]) => {
        const dx = u.position.x - selfUnit.position.x;
        const dy = u.position.y - selfUnit.position.y;
        return { id, dist: Math.sqrt(dx * dx + dy * dy) };
      })
      .filter(h => h.dist <= 60)
      .sort((a, b) => a.dist - b.dist);

    if (hostiles.length === 0) return;
    const currentIdx = hostiles.findIndex(h => h.id === currentTargetId);
    const nextIdx = (currentIdx + 1) % hostiles.length;
    handleTargetUnit(hostiles[nextIdx].id);
  }, [handleTargetUnit]);

  useEffect(() => {
    const onKeyDown = (e) => {
      if (e.repeat) return;
      if (e.code === "Escape") {
        setLootWindowUnitId(null);
        setCharSheetOpen(false);
        return;
      }
      if (e.code === "KeyP") {
        setCharSheetOpen(o => !o);
        return;
      }
      if (e.code === "Tab") {
        e.preventDefault();
        handleTabTarget(
          // capture current values via refs to avoid stale closure
          unitsRef.current,
          targetIdRef.current,
          selfIdentifier,
        );
        return;
      }
      const slotKey = e.code.match(/^Digit(\d)$/)?.[1];
      if (slotKey !== undefined) {
        const slot = slotKey === "0" ? 9 : parseInt(slotKey, 10) - 1;
        usePower(slot);
        return;
      }
      const action = KEY_MAP[e.code];
      if (!action) return;
      const selfForInput = Object.values(unitsRef.current).find(u => u.zone_unit_identifier === selfIdentifierRef.current);
      if (selfForInput?.status === "dead") return;
      if (MOVEMENT_KEYS.has(action)) {
        movementKeysRef.current.add(action);
        sendMove();
      } else if (TURN_KEYS.has(action)) {
        turnKeysRef.current.add(action);
      }
    };
    const onKeyUp = (e) => {
      const action = KEY_MAP[e.code];
      if (!action) return;
      if (MOVEMENT_KEYS.has(action)) {
        movementKeysRef.current.delete(action);
        sendMove();
      } else if (TURN_KEYS.has(action)) {
        turnKeysRef.current.delete(action);
      }
    };
    const onBlur = () => {
      movementKeysRef.current.clear();
      turnKeysRef.current.clear();
      sendMove();
    };
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    window.addEventListener("blur", onBlur);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("blur", onBlur);
    };
  }, [sendMove, usePower, handleTabTarget]);

  useEffect(() => {
    const conn = new GameConnection({
      gameServerUrl,
      instanceId,
      slotId,
      slotToken,
      onOpen: () => { setDisconnected(false); addLog("Connected to game server."); },
      onClose: () => { setDisconnected(true); addLog("Disconnected."); },
      onStateChange: ({ units: u, combatEvents = [], lootEvents = [], lootFailures = [] }) => {
        unitsRef.current = u;
        setUnits(u);
        const tgt = targetIdRef.current ? u[targetIdRef.current] : null;
        if (tgt) {
          const self = Object.values(u).find(un => un.zone_unit_identifier === selfIdentifierRef.current);
          if (self) {
            const dx = tgt.position.x - self.position.x;
            const dy = tgt.position.y - self.position.y;
            if (Math.sqrt(dx * dx + dy * dy) > 60) {
              targetIdRef.current = null;
              setTargetId(null);
              connRef.current?.send({ direction: "up", type: "target", target_id: null });
            }
          }
        }
        for (const ev of lootEvents) {
          addLog(`Lootable: ${ev.items.map(i => i.name).join(", ")} — right-click to open`);
        }
        const self = Object.values(u).find(un => un.zone_unit_identifier === selfIdentifierRef.current);
        for (const failure of lootFailures) {
          if (self && failure.claimed_by === self.id) {
            addLog(`Failed to loot ${failure.item.name} - please try again.`);
          }
        }
        for (const ev of combatEvents) {
          const attacker = u[ev.attacker_id];
          const target = u[ev.target_id];
          if (!attacker || !target) continue;
          const powersByName = npcPowersByZoneIdRef.current[attacker.zone_unit_identifier];
          if (!powersByName) continue;
          const power = powersByName[ev.power_name];
          if (!power?.graphicEffects?.length) continue;
          canvasRef.current?.playGraphicEffects(
            power.graphicEffects,
            { self: attacker.position, target: target.position },
            zoneSourceUrl,
          );
        }
      },
    });
    conn.connect();
    connRef.current = conn;
    return () => conn.close();
  }, []);

  const selfIdentifier = `player:${characterName}`;
  const selfEntry = Object.entries(units).find(([, u]) => u.zone_unit_identifier === selfIdentifier);
  const selfUnit = selfEntry?.[1];
  const selfUnitId = selfEntry?.[0];

  const initialFacingSetRef = useRef(false);
  useEffect(() => {
    if (selfUnit && !initialFacingSetRef.current) {
      facingRef.current = ((selfUnit.position.angle % 360) + 360) % 360;
      initialFacingSetRef.current = true;
    }
  }, [selfUnit?.zone_unit_identifier]);

  // Reconcile local GCD to the server's authoritative value when a power
  // actually fires. The server's epoch ms is ~100ms later than our optimistic
  // estimate (network latency) so this also corrects the timing slightly.
  // If the server rejected the command (no delta update), local GCD expires
  // naturally — client-side checks in usePower prevent most false-positive sets.
  useEffect(() => {
    const serverMs = selfUnit?.global_cooldown_ends_at;
    if (serverMs) setGcd(serverMs);
  }, [selfUnit?.global_cooldown_ends_at]);

  const [deathTime, setDeathTime] = useState(null);
  const prevSelfStatusRef = useRef(null);
  useEffect(() => {
    const status = selfUnit?.status ?? null;
    if (status === "dead" && prevSelfStatusRef.current !== "dead") setDeathTime(Date.now());
    if (status !== "dead" && prevSelfStatusRef.current === "dead") setDeathTime(null);
    prevSelfStatusRef.current = status;
  }, [selfUnit?.status]);

  const handleRespawn = useCallback(() => {
    connRef.current?.send({ type: "respawn" });
  }, []);

  const handleUnitRightClick = useCallback((id) => {
    const selfEntry = Object.entries(unitsRef.current).find(([, u]) => u.zone_unit_identifier === selfIdentifierRef.current);
    const selfId = selfEntry?.[0];
    if (unitHasLootClaim(unitsRef.current[id]?.loot_items, selfId)) {
      setLootWindowUnitId(id);
    }
  }, []);

  const handleTakeItem = useCallback((targetUnitId, itemIndex) => {
    connRef.current?.send({ type: "loot_item", target_unit_id: targetUnitId, item_index: itemIndex });
  }, []);

  const targetUnit = targetId ? units[targetId] : null;
  const targetRange = (selfUnit && targetUnit)
    ? Math.sqrt(
        (targetUnit.position.x - selfUnit.position.x) ** 2 +
        (targetUnit.position.y - selfUnit.position.y) ** 2
      ).toFixed(1)
    : null;

  return (
    <div style={styles.root}>
      <div style={styles.frames}>
        <div style={styles.selfFrame}>
          <strong>{characterName ?? "—"}</strong>
          {selfUnit && (
            <>
              <UnitBar label="MP" current={selfUnit.resource} max={selfUnit.max_resource} />
              <HealthBar current={selfUnit.health} max={selfUnit.max_health} />
            </>
          )}
          {selfUnit?.status === "dead" && <span style={styles.deadBadge}>DEAD</span>}
        </div>
        <div style={styles.targetFrame}>
          {targetUnit ? (
            <>
              <strong>{formatUnitName(targetUnit)}</strong>
              {targetRange != null && <span style={styles.targetRange}>{targetRange} ft</span>}
              <HealthBar current={targetUnit.health} max={targetUnit.max_health} />
              {targetUnit.status === "dead" && <span style={styles.deadBadge}>DEAD</span>}
            </>
          ) : (
            <span style={{ color: "#666" }}>No target</span>
          )}
        </div>
      </div>
      <div style={styles.canvasWrapper}>
        <Canvas
          ref={canvasRef}
          zoneSourceUrl={zoneSourceUrl}
          units={units}
          selfIdentifier={selfIdentifier}
          characterTokenUrl={characterTokenUrl}
          movementKeysRef={movementKeysRef}
          turnKeysRef={turnKeysRef}
          onFacingChange={handleFacingChange}
          onSelfPosition={handleSelfPosition}
          onUnitClick={handleTargetUnit}
          onUnitRightClick={handleUnitRightClick}
          onUnitHover={setHoveredUnitId}
          lootableUnitIds={new Set(Object.entries(units).filter(([, u]) => u.loot_items?.some(i => i.claims?.find(c => c.character_unit_id === selfUnitId)?.state === "available")).map(([id]) => id))}
          targetId={targetId}
        />
        <UnitTooltip unit={hoveredUnitId ? units[hoveredUnitId] : null} selfUnitId={selfUnitId} />
        <RespawnOverlay deathTime={deathTime} onRespawn={handleRespawn} />
        <LootWindow
          unitId={lootWindowUnitId}
          items={units[lootWindowUnitId]?.loot_items}
          selfUnitId={selfUnitId}
          onTake={handleTakeItem}
          onClose={() => setLootWindowUnitId(null)}
        />
        <CharacterSheet
          open={charSheetOpen}
          equippedItems={equippedItems}
          characterItemsUrl={characterItemsUrl}
          onClose={() => setCharSheetOpen(false)}
        />
      </div>
      <div style={styles.actionBar}>
        <button
          style={styles.charSheetButton}
          title="Character sheet (P)"
          onClick={() => setCharSheetOpen(o => !o)}
        >
          Char
        </button>
        {Array.from({ length: 10 }, (_, i) => {
          const slot = i + 1;
          const key = slot === 10 ? "0" : String(slot);
          const power = powers[i];
          const iconUrl = power?.iconURL
            ? new URL(power.iconURL, classConfigUrl).href
            : null;
          let inRange = true;
          let isFacing = true;
          if (power && targetUnit && selfUnit) {
            const range = powerMaxRange(power);
            if (range != null) {
              const dx = targetUnit.position.x - selfUnit.position.x;
              const dy = targetUnit.position.y - selfUnit.position.y;
              inRange = Math.sqrt(dx * dx + dy * dy) <= range + (selfUnit.radius ?? 0) + (targetUnit.radius ?? 0);
              if (power.frontal !== false) {
                const toTarget = Math.atan2(dx, dy) * 180 / Math.PI;
                let diff = toTarget - selfUnit.position.angle;
                while (diff > 180) diff -= 360;
                while (diff < -180) diff += 360;
                isFacing = Math.abs(diff) <= 75;
              }
            }
          }
          const now = Date.now();
          const pcEndsAt = power?.name ? (selfUnit?.power_cooldowns?.[power.name] ?? 0) : 0;
          // Show whichever cooldown ends later; GCD total is used when GCD is dominant.
          const cdEndsAt = Math.max(gcdEndsAt, pcEndsAt);
          const onCooldown = power && cdEndsAt > now;
          const remainingMs = onCooldown ? cdEndsAt - now : 0;
          const usingGcd = gcdEndsAt >= pcEndsAt;
          const totalMs = usingGcd ? (gcdTotalMsRef.current || 1) : (power?.cooldown ?? 1) * 1000;
          const fraction = onCooldown ? remainingMs / totalMs : 0;
          const revealedDeg = (1 - fraction) * 360;
          const cdSecs = (onCooldown && totalMs > 2000) ? Math.ceil(remainingMs / 1000) : null;

          return (
            <div
              key={slot}
              style={{...styles.actionButton, ...(flashSlot === i ? styles.actionButtonFlash : {}), cursor: power ? "pointer" : "default", opacity: (inRange && isFacing) ? 1 : 0.3}}
              title={power?.name}
              onClick={power ? () => usePower(i) : undefined}
            >
              {iconUrl && <img src={iconUrl} alt={power.name} style={styles.actionIcon}/>}
              {onCooldown && (
                <div style={{
                  position: "absolute", inset: 0, borderRadius: 4, pointerEvents: "none",
                  background: `conic-gradient(from -90deg, transparent ${revealedDeg}deg, rgba(0,0,0,0.65) ${revealedDeg}deg)`,
                }}/>
              )}
              {cdSecs && (
                <div style={styles.actionCooldownOverlay}>
                  <span style={styles.actionCooldownText}>{cdSecs}</span>
                </div>
              )}
              <span style={styles.actionKeybind}>{key}</span>
            </div>
          );
        })}
      </div>
      <div style={styles.log}>
        {log.map((line, i) => (
          <div key={i}>{line}</div>
        ))}
      </div>
      {disconnected && (
        <div style={{
          position: "fixed", inset: 0, display: "flex",
          alignItems: "center", justifyContent: "center",
          pointerEvents: "none",
        }}>
          <div style={{
            color: "#ff2222", fontSize: 48, fontWeight: "bold",
            textShadow: "0 0 20px #ff0000, 0 2px 4px #000",
            letterSpacing: 4,
          }}>
            DISCONNECTED
          </div>
        </div>
      )}
    </div>
  );
}
