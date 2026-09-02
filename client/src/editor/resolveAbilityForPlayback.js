// Builds a preview-only copy of the ability with iconURL/sourceURL fields
// swapped for their resolved (data: or blob:) URLs from assetMap, so the
// preview pane can play it without ever touching GitHub. The canonical draft
// state (what would eventually get saved) keeps the original relative-path
// strings untouched - this is a derived view, not a mutation.
function resolveUrl(value, assetMap) {
  return assetMap[value] ?? value;
}

function resolveEffect(effect, assetMap) {
  if (!effect.sourceURL) return effect;
  return {...effect, sourceURL: resolveUrl(effect.sourceURL, assetMap)};
}

export function resolveAbilityForPlayback(ability, assetMap) {
  return {
    ...ability,
    iconURL: ability.iconURL ? resolveUrl(ability.iconURL, assetMap) : ability.iconURL,
    graphicEffects: (ability.graphicEffects ?? []).map((e) => resolveEffect(e, assetMap)),
    soundEffects: (ability.soundEffects ?? []).map((e) => resolveEffect(e, assetMap)),
  };
}
