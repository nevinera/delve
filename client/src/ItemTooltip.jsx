import { useState } from "react";
import { createPortal } from "react-dom";
import "./styles/shared/itemTooltip.css";

export const STAT_GROUPS = [
  { title: "Primary", keys: ["strength", "agility", "intellect", "stamina", "basic_attack_dps"] },
  { title: "Secondary", keys: ["crit_rating", "haste_rating", "mastery_rating", "versatility_rating", "defence_rating", "recovery_rating"] },
];

export const STAT_LABELS = {
  strength: "Strength",
  agility: "Agility",
  intellect: "Intellect",
  stamina: "Stamina",
  crit_rating: "Crit Rating",
  haste_rating: "Haste Rating",
  mastery_rating: "Mastery Rating",
  versatility_rating: "Versatility Rating",
  defence_rating: "Defence Rating",
  recovery_rating: "Recovery Rating",
  basic_attack_dps: "Basic Attack DPS",
};

// Mirrors docs/stats.md's "Item coloration" table (delta up to -15/-5/+5/+15
// -> gray/green/blue/purple, above +15 -> orange), but computed against the
// player's current local elevation rather than a weighted mean.
export function itemColor(item, localElvl) {
  if (item?.elvl == null || localElvl == null) return null;
  const delta = item.elvl - localElvl;
  if (delta <= -15) return "#9d9d9d";
  if (delta <= -5) return "#1eff00";
  if (delta <= 5) return "#0070dd";
  if (delta <= 15) return "#a335ee";
  return "#ff8000";
}

// Mirrors ItemStats::ElevationMultiplier (app/services/item_stats/elevation_multiplier.rb)
// / itemstats.ElevationMultiplier (game-server/internal/itemstats/elevation_multiplier.go).
export function elevationMultiplier(ee) {
  const base = 2 / (1 + Math.pow(3, -ee / 10));
  let taper;
  if (Math.abs(ee) <= 10) taper = 1;
  else if (ee >= -20 && ee < -10) taper = (ee + 20) / 10;
  else if (ee > 10 && ee <= 20) taper = 1 + (ee - 10) / 90;
  else if (ee < -20) taper = 0;
  else taper = 10 / 9;
  return base * taper;
}

// Wraps its children in a hover target that shows a WoW-style item tooltip
// near the cursor. `item` should have {name, slot, elvl, description, stats}.
// `stats` is assumed to be raw (em=1.0, i.e. computed as if the item were
// exactly on-level with itself) - it's rescaled here against `localElvl`
// (the elevation of the map the player is currently on), not shown raw.
// pinned: skips the hover/portal machinery entirely and renders the tooltip
// body inline, always visible - for the item editor's preview pane, which
// wants a persistent live view rather than something you have to hover to
// see (see client/src/itemEditor/ItemPreviewPane.jsx).
export function ItemTooltip({ item, children, clickable, localElvl, pinned }) {
  const [pos, setPos] = useState(null); // {x, y} in viewport coords, or null when hidden

  if (!item) return children;

  const em = (localElvl != null && item.elvl != null) ? elevationMultiplier(item.elvl - localElvl) : 1;
  const color = itemColor(item, localElvl);
  const statOrder = STAT_GROUPS.flatMap(g => g.keys);
  const stats = Object.entries(item.stats || {})
    .map(([key, value]) => [key, value * em])
    .filter(([, v]) => v)
    .sort(([a], [b]) => statOrder.indexOf(a) - statOrder.indexOf(b));

  const body = (
    <div className="game-item-tooltip" style={pinned ? { position: "static" } : { left: pos?.x + 16, top: pos?.y + 16 }}>
      <div className="game-item-tooltip-name">{item.name}</div>
      {(item.slot || item.elvl != null) && (
        <div className="game-item-tooltip-meta">
          {item.elvl != null && <span style={color ? { color } : undefined}>e{item.elvl}</span>}
          {item.elvl != null && item.slot ? " " : ""}
          {item.slot}
        </div>
      )}
      {stats.length > 0 && (
        <div className="game-item-tooltip-stats">
          {stats.map(([key, value]) => (
            <div key={key} className="game-item-tooltip-stat">
              +{value.toFixed(1)} {STAT_LABELS[key] || key}
            </div>
          ))}
        </div>
      )}
      {item.description && (
        <div className="game-item-tooltip-description">{item.description}</div>
      )}
    </div>
  );

  const anchorClass = clickable ? "game-item-tooltip-anchor game-item-tooltip-anchor-clickable" : "game-item-tooltip-anchor";
  if (pinned) {
    return (
      <span className={anchorClass}>
        {children}
        {body}
      </span>
    );
  }

  return (
    <span
      className={anchorClass}
      onMouseEnter={e => setPos({ x: e.clientX, y: e.clientY })}
      onMouseMove={e => setPos({ x: e.clientX, y: e.clientY })}
      onMouseLeave={() => setPos(null)}
    >
      {children}
      {pos && createPortal(
        // Portaled to document.body: charSheetWrapper (an ancestor for the
        // character sheet / candidate pane) has a CSS transform, which makes
        // it the containing block for position:fixed descendants - without
        // the portal, this tooltip's left/top would resolve against that
        // transformed ancestor instead of the viewport.
        body,
        document.body
      )}
    </span>
  );
}
