// Builds a preview-only copy of the ability with iconURL/sourceURL fields
// swapped for their resolved (data: or blob:) URLs from assetMap, so the
// preview pane can play it without ever touching GitHub. The canonical draft
// state (what would eventually get saved) keeps the original relative-path
// strings untouched - this is a derived view, not a mutation.
//
// assetOverrides holds locally-"uploaded" replacements, keyed by top-level
// field name (currently just "iconURL") rather than by URL value, so an
// upload works even before the ability has any iconURL set at all. It takes
// priority over assetMap.
function resolveUrl(value, assetMap) {
  return assetMap[value] ?? value;
}

function resolveEffect(effect, assetMap) {
  if (!effect.sourceURL) return effect;
  return {...effect, sourceURL: resolveUrl(effect.sourceURL, assetMap)};
}

export function resolveAbilityForPlayback(ability, assetMap, assetOverrides = {}) {
  return {
    ...ability,
    iconURL: assetOverrides.iconURL ?? (ability.iconURL ? resolveUrl(ability.iconURL, assetMap) : ability.iconURL),
    graphicEffects: (ability.graphicEffects ?? []).map((e) => resolveEffect(e, assetMap)),
    soundEffects: (ability.soundEffects ?? []).map((e) => resolveEffect(e, assetMap)),
  };
}
