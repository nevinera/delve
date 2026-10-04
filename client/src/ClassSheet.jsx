import IconImage from "./IconImage";
import {resolveStockAssetUrl} from "./resolveStockAssetUrl";
import {describeEffects, hastedCastTime} from "./abilityEffectText";

const wrapperBase = {
  position: "fixed",
  zIndex: 25,
  background: "rgba(20,16,12,0.97)",
  border: "1px solid #7a5a2a",
  borderRadius: 6,
  display: "flex",
  flexDirection: "column",
  overflow: "hidden",
};

const styles = {
  wrapper: {position: "absolute", zIndex: 25, right: 20, top: "50%", transform: "translateY(-50%)", display: "flex", alignItems: "flex-start", gap: 8},
  wrapperPortrait: {...wrapperBase, left: 8, right: 8, top: 100, bottom: 110 + 34},
  wrapperLandscape: {...wrapperBase, top: 16, left: 16, right: 16, bottom: 16},
  panel: {background: "rgba(20,16,12,0.97)", border: "1px solid #7a5a2a", borderRadius: 6, padding: "10px 16px 14px", width: 480, maxHeight: "70vh", overflowY: "auto", pointerEvents: "auto"},
  scrollArea: {flex: 1, minHeight: 0, overflowY: "auto", padding: "10px 16px 14px"},
  header: {display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10},
  title: {fontSize: 15, fontWeight: "bold", color: "#d4a84b", letterSpacing: 1, textTransform: "uppercase"},
  close: {background: "none", border: "none", color: "#aaa", cursor: "pointer", fontSize: 14},
  list: {listStyle: "none", margin: 0, padding: 0},
  row: {display: "flex", gap: 12, alignItems: "flex-start", marginBottom: 12},
  icon: {width: 40, height: 40, flexShrink: 0},
  iconBlank: {width: 40, height: 40, flexShrink: 0},
  name: {color: "#cce", fontWeight: "bold", fontSize: 14},
  summary: {color: "#889", fontSize: 11},
  description: {color: "#aaa", fontSize: 12, marginTop: 2},
  effects: {margin: "4px 0 0", padding: 0, listStyle: "none", color: "#c9b98a", fontSize: 12},
  classDescription: {color: "#aaa", fontSize: 12, marginBottom: 12},
  sectionTitle: {color: "#d4a84b", fontSize: 12, fontWeight: "bold", letterSpacing: 1, textTransform: "uppercase", marginBottom: 8},
  empty: {color: "#889", fontStyle: "italic"},
};

function fmt(value) {
  return Number.isInteger(value) ? String(value) : String(Math.round(value * 100) / 100);
}

// Port of ClassAbility#stat_summary (app/models/class_ability.rb), with the
// cast time shown hasted.
export function statSummary(ability, combatStats) {
  const cost = ability.costType && ability.costAmount != null ? `${fmt(ability.costAmount)} ${ability.costType}` : null;
  const cast = ability.castTime > 0 ? `${fmt(hastedCastTime(ability, combatStats))}s cast` : "Instant";
  const timing = [
    [ability.globalCooldown, "s GCD"],
    [ability.cooldown, "s cooldown"],
    [ability.maxRange, " range"],
  ]
    .filter(([value]) => value !== undefined && value !== null)
    .map(([value, suffix]) => `${fmt(value)}${suffix}`);
  return [cost, cast, ...timing].filter(Boolean).join(" · ");
}

export function ClassSheet({open, className, classDescription, powers = [], combatStats, classConfigUrl, stockAssets, onClose, portrait = false, landscape = false}) {
  if (!open) return null;

  function iconUrl(ability) {
    if (!ability.iconURL) return null;
    return resolveStockAssetUrl(ability.iconURL, "icons", stockAssets) ?? new URL(ability.iconURL, classConfigUrl).href;
  }

  return (
    <div style={portrait ? styles.wrapperPortrait : landscape ? styles.wrapperLandscape : styles.wrapper}>
      <div style={(portrait || landscape) ? styles.scrollArea : styles.panel}>
        <div style={styles.header}>
          <span style={styles.title}>{className || "Class"}</span>
          <button style={styles.close} aria-label="Close class" onClick={onClose}>✕</button>
        </div>
        {classDescription && <div style={styles.classDescription}>{classDescription}</div>}
        <div style={styles.sectionTitle}>Abilities</div>
        {powers.length === 0 ? (
          <div style={styles.empty}>No abilities.</div>
        ) : (
          <ul style={styles.list}>
            {powers.map((ability, i) => {
              const url = iconUrl(ability);
              const effects = describeEffects(ability, {combatStats});
              return (
                <li key={`${ability.name}-${i}`} style={styles.row}>
                  {url ? <IconImage src={url} color={ability.iconColor} alt={ability.name} style={styles.icon} /> : <span style={styles.iconBlank} />}
                  <div>
                    <div style={styles.name}>{ability.name}</div>
                    <div style={styles.summary}>{statSummary(ability, combatStats)}</div>
                    {ability.description && <div style={styles.description}>{ability.description}</div>}
                    {effects.length > 0 && (
                      <ul style={styles.effects}>
                        {effects.flatMap((lines, ei) => lines.map((line, li) => (
                          <li key={`${ei}-${li}`} style={{whiteSpace: "pre-wrap"}}>{line}</li>
                        )))}
                      </ul>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
