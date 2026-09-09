import {useEffect, useMemo, useRef, useState} from "react";
import {firePowerEffects} from "../game/effectPlayback";
import {AbilityTooltip} from "../AbilityTooltip";
import AbilityPreviewCanvas from "./AbilityPreviewCanvas";
import {resolveAbilityForPlayback} from "./resolveAbilityForPlayback";

const DEFAULT_MAX_RANGE = 10;
const DEFAULT_SELF_TOKEN_URL = "/tokens/male-elf-guard.webp";
const DEFAULT_TARGET_TOKEN_URL = "/tokens/goblin-1.webp";

// power.maxRange is often omitted for melee abilities - fall back to the
// largest `range` (a number, or a [min, max] pair) found across its effects,
// same convention tools/ability.html uses.
function maxEffectRange(effects) {
  const ranges = (effects ?? [])
    .map((e) => e.range)
    .filter((r) => r != null)
    .map((r) => (Array.isArray(r) ? r[1] : r));
  return ranges.length ? Math.max(...ranges) : null;
}

export default function AbilityPreviewPane({ability, assetMap, assetOverrides, stockAssets}) {
  const canvasRef = useRef(null);
  const [status, setStatus] = useState("");
  const [firing, setFiring] = useState(false);

  const maxRange = ability.maxRange ?? maxEffectRange(ability.effects) ?? DEFAULT_MAX_RANGE;
  const [targetDistanceFt, setTargetDistanceFt] = useState(maxRange);

  // Keep the slider in range as maxRange changes (e.g. via the editable field).
  useEffect(() => {
    setTargetDistanceFt((current) => Math.min(current, maxRange));
  }, [maxRange]);

  const resolvedAbility = useMemo(
    () => resolveAbilityForPlayback(ability, assetMap, assetOverrides, stockAssets),
    [ability, assetMap, assetOverrides, stockAssets]
  );

  function play() {
    if (firing) return;
    setFiring(true);
    setStatus(`"${ability.name}" fired!`);
    const positions = canvasRef.current?.positions();
    firePowerEffects(resolvedAbility, {positions, baseUrl: window.location.href, sceneManager: canvasRef.current});
    const castMs = (ability.castTime ?? 0) * 1000;
    setTimeout(() => setFiring(false), castMs + 50);
  }

  useEffect(() => {
    function onKeydown(e) {
      if (e.code !== "Space") return;
      const tag = document.activeElement?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "BUTTON") return;
      e.preventDefault();
      play();
    }
    window.addEventListener("keydown", onKeydown);
    return () => window.removeEventListener("keydown", onKeydown);
  });

  return (
    <div style={{display: "flex", flexDirection: "column", height: "100%"}}>
      <div className="ability-preview-canvas-area">
        <AbilityPreviewCanvas
          ref={canvasRef}
          selfTokenUrl={DEFAULT_SELF_TOKEN_URL}
          targetTokenUrl={DEFAULT_TARGET_TOKEN_URL}
          targetDistanceFt={targetDistanceFt}
        />
        {resolvedAbility.iconURL && (
          <AbilityTooltip ability={ability} hint="Use Ability (space)">
            <img
              src={resolvedAbility.iconURL}
              alt="ability icon"
              className={`ability-icon-button${firing ? " disabled" : ""}`}
              onClick={play}
            />
          </AbilityTooltip>
        )}
      </div>
      <div className="preview-controls">
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
        <div className="preview-status">{status}</div>
      </div>
    </div>
  );
}
