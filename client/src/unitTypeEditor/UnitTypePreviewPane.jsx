import {useEffect, useMemo, useRef, useState} from "react";
import {firePowerEffects} from "../game/effectPlayback";
import {AbilityTooltip} from "../AbilityTooltip";
import AbilityPreviewCanvas from "../editor/AbilityPreviewCanvas";
import {resolveAbilityForPlayback} from "../editor/resolveAbilityForPlayback";
import {abilityKeyForRef} from "./abilityRefs";

const DEFAULT_MAX_RANGE = 10;
const FALLBACK_SELF_TOKEN_URL = "/tokens/goblin-1.webp";
// The elf token stands in as the player everywhere else in the build tools
// (ability/class editor previews use it as the *actor*) - here the unit
// type is the actor, so it becomes the target instead.
const TARGET_TOKEN_URL = "/tokens/male-elf-guard.webp";

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

function isSelfOnly(ability) {
  return (ability.effects ?? []).every((e) => e.affects === "self");
}

function inRange(ability, targetDistanceFt) {
  return isSelfOnly(ability) || targetDistanceFt <= abilityRange(ability);
}

// Resolves every attached power's $ref (already fetched, with its own asset
// thumbnails, by Build::UnitTypesController#load_available_abilities) into
// a playable form. Unlike a class's action bar, a unit type has no fixed
// slot count - just however many powers it actually has.
function resolvePowers(unitTypeKey, powers, availableAbilities, stockAssets) {
  return (powers ?? [])
    .map((entry) => {
      const key = abilityKeyForRef(unitTypeKey, entry);
      if (!key || !availableAbilities[key]) return null;
      const {ability, assetMap} = availableAbilities[key];
      return resolveAbilityForPlayback(ability, assetMap, {}, stockAssets);
    })
    .filter(Boolean);
}

// The unit's own tokenImageUrl entries are its actual saved appearance -
// pick one at random, the same way the game server does when spawning a
// unit from this type (see docs/schema/unit_type.md#tokenimageurl). Falls
// back to the stock goblin token when none are set yet, so a brand new
// draft is still previewable before any art is attached.
function pickSelfToken(tokenImageUrl) {
  const urls = (tokenImageUrl ?? []).filter(Boolean);
  if (!urls.length) return FALLBACK_SELF_TOKEN_URL;
  return urls[Math.floor(Math.random() * urls.length)];
}

export default function UnitTypePreviewPane({unitTypeKey, unitTypeData, availableAbilities, stockAssets}) {
  const canvasRef = useRef(null);
  const [status, setStatus] = useState("");
  const [firing, setFiring] = useState(false);

  // Re-rolled only when the actual token list content changes, not on every
  // render - JSON.stringify as the dependency key avoids re-picking a token
  // (and flickering the preview) for unrelated edits elsewhere in the form.
  const tokenImageUrlKey = JSON.stringify(unitTypeData.tokenImageUrl ?? []);
  const selfTokenUrl = useMemo(() => pickSelfToken(unitTypeData.tokenImageUrl), [tokenImageUrlKey]);

  const resolvedPowers = useMemo(
    () => resolvePowers(unitTypeKey, unitTypeData.powers, availableAbilities, stockAssets),
    [unitTypeKey, unitTypeData.powers, availableAbilities, stockAssets]
  );

  const maxRange = useMemo(() => {
    const ranges = resolvedPowers.filter((a) => !isSelfOnly(a)).map(abilityRange);
    return ranges.length ? Math.max(...ranges) : DEFAULT_MAX_RANGE;
  }, [resolvedPowers]);
  const [targetDistanceFt, setTargetDistanceFt] = useState(maxRange);

  useEffect(() => {
    setTargetDistanceFt((current) => Math.min(current, maxRange));
  }, [maxRange]);

  function play(resolvedAbility) {
    if (firing || !resolvedAbility) return;
    if (!inRange(resolvedAbility, targetDistanceFt)) return;
    setFiring(true);
    setStatus(`"${resolvedAbility.name}" fired!`);
    const positions = canvasRef.current?.positions();
    firePowerEffects(resolvedAbility, {positions, baseUrl: window.location.href, sceneManager: canvasRef.current});
    const castMs = (resolvedAbility.castTime ?? 0) * 1000;
    setTimeout(() => setFiring(false), castMs + 50);
  }

  return (
    <div style={{display: "flex", flexDirection: "column", height: "100%"}}>
      <div className="unit-type-preview-canvas-area">
        <AbilityPreviewCanvas
          ref={canvasRef}
          selfTokenUrl={selfTokenUrl}
          targetTokenUrl={TARGET_TOKEN_URL}
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
        {resolvedPowers.length === 0 && (
          <div className="power-slot"><div className="power-slot-icon empty" /></div>
        )}
        {resolvedPowers.map((resolvedAbility, i) => {
          const outOfRange = !inRange(resolvedAbility, targetDistanceFt);
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
