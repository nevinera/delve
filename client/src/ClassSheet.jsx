import IconImage from "./IconImage";
import {resolveStockAssetUrl} from "./resolveStockAssetUrl";
import {describeEffects, hastedCastTime} from "./abilityEffectText";
import {GameWindow} from "./GameWindow";

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
    <GameWindow title={className || "Class"} closeLabel="Close class" onClose={onClose} portrait={portrait} landscape={landscape}
      wrapperClassName="game-class-sheet-wrapper" panelClassName="game-class-sheet">
      {classDescription && <div className="game-class-description">{classDescription}</div>}
      <div className="game-class-section-title">Abilities</div>
      {powers.length === 0 ? (
        <div className="game-window-empty">No abilities.</div>
      ) : (
        <ul className="game-class-abilities">
          {powers.map((ability, i) => {
            const url = iconUrl(ability);
            const effects = describeEffects(ability, {combatStats});
            return (
              <li key={`${ability.name}-${i}`} className="game-class-ability">
                {url ? <IconImage src={url} color={ability.iconColor} alt={ability.name} className="game-class-ability-icon" /> : <span className="game-class-ability-icon" />}
                <div>
                  <div className="game-class-ability-name">{ability.name}</div>
                  <div className="game-class-ability-summary">{statSummary(ability, combatStats)}</div>
                  {ability.description && <div className="game-class-ability-description">{ability.description}</div>}
                  {effects.length > 0 && (
                    <ul className="game-class-ability-effects">
                      {effects.flatMap((lines, ei) => lines.map((line, li) => (
                        <li key={`${ei}-${li}`}>{line}</li>
                      )))}
                    </ul>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </GameWindow>
  );
}
