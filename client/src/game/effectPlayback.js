// Fires a power's graphicEffects/soundEffects, honoring `when`, the tool-only
// `speed` extension (projectile travel time), and the tool-only `impactTiming`
// extension on impact sounds. Mirrors tools/ability.html's resolvePower/
// scheduleImpactSound so the real client and the preview tool agree on timing.

function distanceFeet(a, b) {
  if (!a || !b) return 0;
  const dx = b.x - a.x, dy = b.y - a.y;
  return Math.sqrt(dx * dx + dy * dy);
}

// positions: { self: {x,y}, target: {x,y} } in map coords.
// sceneManager: the object exposing playGraphicEffects(effects, positions, baseUrl, travelOverrideMs) — may be null/undefined.
export function firePowerEffects(power, { positions, baseUrl, sceneManager }) {
  const distanceFt = distanceFeet(positions.self, positions.target);
  const travelMs = power.speed ? (distanceFt / power.speed) * 1000 : 0;

  const graphicEffects = power.graphicEffects ?? [];
  const soundEffects = power.soundEffects ?? [];
  const immediateGraphics = graphicEffects.filter((e) => e.when !== "impact");
  const impactGraphics = graphicEffects.filter((e) => e.when === "impact");
  const immediateSounds = soundEffects.filter((e) => e.when !== "impact");
  const impactSounds = soundEffects.filter((e) => e.when === "impact");

  if (immediateGraphics.length) {
    sceneManager?.playGraphicEffects(immediateGraphics, positions, baseUrl, travelMs);
  }
  playSoundEffects(immediateSounds, baseUrl);
  impactSounds.forEach((effect) => scheduleImpactSound(effect, travelMs, baseUrl));

  if (impactGraphics.length) {
    const fire = () => sceneManager?.playGraphicEffects(impactGraphics, positions, baseUrl);
    if (travelMs > 0) setTimeout(fire, travelMs);
    else fire();
  }
}

// impactTiming controls when a `when: "impact"` sound starts relative to impact,
// based on the sound's own `duration`: "after" (default) starts at impact time;
// "before" schedules playback to *end* at impact time (starts immediately if the
// travel time is shorter than the sound); "centered" lines up the sound's
// midpoint with impact time.
function scheduleImpactSound(effect, travelMs, baseUrl) {
  const durMs = (effect.duration ?? 0) * 1000;
  const timing = effect.impactTiming ?? "after";
  let atMs;
  if (timing === "before") atMs = Math.max(0, travelMs - durMs);
  else if (timing === "centered") atMs = Math.max(0, travelMs - durMs / 2);
  else atMs = travelMs;

  if (atMs <= 0) playSoundEffects([effect], baseUrl);
  else setTimeout(() => playSoundEffects([effect], baseUrl), atMs);
}

export function playSoundEffects(effects, baseUrl) {
  for (const effect of effects) {
    const url = new URL(effect.sourceURL, baseUrl).href;
    const audio = new Audio(url);
    audio.volume = Math.max(0, Math.min(1, effect.volumeScale ?? 1.0));
    audio.playbackRate = effect.pitchScale ?? 1.0;
    audio.play().catch((e) => console.warn(`Failed to play sound effect: ${e.message}`));
  }
}
