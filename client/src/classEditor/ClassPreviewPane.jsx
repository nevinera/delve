import {useEffect, useMemo, useRef, useState} from "react";
import {firePowerEffects} from "../game/effectPlayback";
import {AbilityTooltip} from "../AbilityTooltip";
import AbilityPreviewCanvas from "../editor/AbilityPreviewCanvas";
import {resolveAbilityForPlayback} from "../editor/resolveAbilityForPlayback";
import {abilityKeyForRef} from "./powerRefs";
import {SLOT_COUNT} from "./classFieldOptions";

const DEFAULT_MAX_RANGE = 10;
const DEFAULT_SELF_TOKEN_URL = "/tokens/male-elf-guard.webp";
const DEFAULT_TARGET_TOKEN_URL = "/tokens/goblin-1.webp";

function maxEffectRange(effects) {
  const ranges = (effects ?? [])
    .map((e) => e.range)
    .filter((r) => r != null)
    .map((r) => (Array.isArray(r) ? r[1] : r));
  return ranges.length ? Math.max(...ranges) : null;
}

function abilityRange(ability) {
  return ability.maxRange ?? maxEffectRange(ability.effects) ?? DEFAULT_MAX_RANGE;
}

// Resolves every filled slot's referenced ability (already fetched, with its
// own asset thumbnails, by Build::ClassesController#load_available_abilities)
// into a playable form, padded out to SLOT_COUNT with nulls for the
// always-visible empty slots.
function resolveSlots(classKey, powers, availableAbilities, stockAssets) {
  const resolved = powers.map((entry) => {
    const key = abilityKeyForRef(classKey, entry);
    if (!key || !availableAbilities[key]) return null;
    const {ability, assetMap} = availableAbilities[key];
    return resolveAbilityForPlayback(ability, assetMap, {}, stockAssets);
  });
  while (resolved.length < SLOT_COUNT) resolved.push(null);
  return resolved;
}

export default function ClassPreviewPane({classKey, powers, availableAbilities, stockAssets}) {
  const canvasRef = useRef(null);
  const [status, setStatus] = useState("");
  const [firing, setFiring] = useState(false);

  const resolvedSlots = useMemo(
    () => resolveSlots(classKey, powers, availableAbilities, stockAssets),
    [classKey, powers, availableAbilities, stockAssets]
  );

  const maxRange = useMemo(() => {
    const ranges = resolvedSlots.filter(Boolean).map(abilityRange);
    return ranges.length ? Math.max(...ranges) : DEFAULT_MAX_RANGE;
  }, [resolvedSlots]);
  const [targetDistanceFt, setTargetDistanceFt] = useState(maxRange);

  useEffect(() => {
    setTargetDistanceFt((current) => Math.min(current, maxRange));
  }, [maxRange]);

  // Unlike AbilityPreviewPane (one ability, one slider clamped to its own
  // range - the target is always moved into range), here one slider is
  // shared across every slot's differently-ranged ability, so it can't
  // clamp to all of them at once. Out-of-range abilities are disabled
  // instead of firing regardless. `<img>` has no native disabled state, so
  // this check has to happen here too, not just in the disabled CSS class
  // applied below - a click still reaches onClick either way.
  function play(resolvedAbility) {
    if (firing || !resolvedAbility) return;
    if (targetDistanceFt > abilityRange(resolvedAbility)) return;
    setFiring(true);
    setStatus(`"${resolvedAbility.name}" fired!`);
    const positions = canvasRef.current?.positions();
    firePowerEffects(resolvedAbility, {positions, baseUrl: window.location.href, sceneManager: canvasRef.current});
    const castMs = (resolvedAbility.castTime ?? 0) * 1000;
    setTimeout(() => setFiring(false), castMs + 50);
  }

  return (
    <div style={{display: "flex", flexDirection: "column", height: "100%"}}>
      <div className="class-preview-canvas-area">
        <AbilityPreviewCanvas
          ref={canvasRef}
          selfTokenUrl={DEFAULT_SELF_TOKEN_URL}
          targetTokenUrl={DEFAULT_TARGET_TOKEN_URL}
          targetDistanceFt={targetDistanceFt}
        />
      </div>
      <div className="preview-controls" style={{background: "transparent", borderTop: "none", padding: "10px 14px"}}>
        <label>
          Target distance: {targetDistanceFt.toFixed(1)} ft
          <input
            type="range"
            min="0"
            max={maxRange}
            step="0.5"
            value={targetDistanceFt}
            onChange={(e) => setTargetDistanceFt(parseFloat(e.target.value))}
          />
        </label>
      </div>
      <div className="preview-status">{status}</div>
      <div className="power-slots">
        {resolvedSlots.map((resolvedAbility, i) => {
          if (!resolvedAbility) return <div className="power-slot" key={i}><div className="power-slot-icon empty" /></div>;

          const outOfRange = targetDistanceFt > abilityRange(resolvedAbility);
          const disabled = firing || outOfRange;
          return (
            <div className="power-slot" key={i}>
              <AbilityTooltip ability={resolvedAbility} hint={outOfRange ? "Out of range" : "Use ability"}>
                <img
                  src={resolvedAbility.iconURL}
                  alt={resolvedAbility.name}
                  className={`power-slot-icon${disabled ? " disabled" : ""}`}
                  onClick={() => play(resolvedAbility)}
                />
              </AbilityTooltip>
            </div>
          );
        })}
      </div>
    </div>
  );
}
