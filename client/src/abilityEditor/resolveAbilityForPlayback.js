import {resolveStockAssetUrl} from "../resolveStockAssetUrl";

// Builds a preview-only copy of the ability with iconURL/sourceURL fields
// swapped for their resolved (data:, blob:, or stock-asset) URLs, so the
// preview pane can play it without ever touching GitHub. The canonical draft
// state (what would eventually get saved) keeps the original relative-path/
// ":name:" strings untouched - this is a derived view, not a mutation.
//
// assetOverrides holds locally-"uploaded" replacements. Top-level fields are
// keyed by field name ("iconURL"); entry fields are keyed by
// assetOverrideKey(section, index, field) so each graphicEffects/soundEffects
// entry's own sourceURL can be overridden independently. Overrides take
// priority over assetMap, and work even before the field has a value at all.
export function assetOverrideKey(section, index, field) {
  return `${section}[${index}].${field}`;
}

// Looks up an override key's live value on the ability draft - the inverse
// of assetOverrideKey. Used at save time to find the real destination path
// (the field's current relative-path string) for each uploaded file.
export function currentFieldValue(ability, overrideKey) {
  const match = overrideKey.match(/^(.+)\[(\d+)\]\.(.+)$/);
  if (!match) return ability[overrideKey];
  const [, section, indexStr, field] = match;
  return ability[section]?.[Number(indexStr)]?.[field];
}

function resolveUrl(value, kind, assetMap, stockAssets) {
  return resolveStockAssetUrl(value, kind, stockAssets) ?? assetMap[value] ?? value;
}

function resolveEffect(effect, section, index, kind, assetMap, assetOverrides, stockAssets) {
  const override = assetOverrides[assetOverrideKey(section, index, "sourceURL")];
  if (override) return {...effect, sourceURL: override};
  if (!effect.sourceURL) return effect;
  return {...effect, sourceURL: resolveUrl(effect.sourceURL, kind, assetMap, stockAssets)};
}

// A status-type effect's auraEffect.sourceURL gets the same relative-path/
// ":name:" resolution as graphicEffects/soundEffects, so the preview can
// display it - no upload-override support for it, since that's not exposed
// anywhere in the editor for aura effects.
function resolvePowerEffect(effect, assetMap, stockAssets) {
  const auraSourceURL = effect.status?.auraEffect?.sourceURL;
  if (effect.type !== "status" || !auraSourceURL) return effect;
  return {
    ...effect,
    status: {
      ...effect.status,
      auraEffect: {...effect.status.auraEffect, sourceURL: resolveUrl(auraSourceURL, "graphics", assetMap, stockAssets)},
    },
  };
}

export function resolveAbilityForPlayback(ability, assetMap, assetOverrides = {}, stockAssets = {}) {
  return {
    ...ability,
    iconURL: assetOverrides.iconURL ?? (ability.iconURL ? resolveUrl(ability.iconURL, "icons", assetMap, stockAssets) : ability.iconURL),
    graphicEffects: (ability.graphicEffects ?? []).map((e, i) => resolveEffect(e, "graphicEffects", i, "graphics", assetMap, assetOverrides, stockAssets)),
    soundEffects: (ability.soundEffects ?? []).map((e, i) => resolveEffect(e, "soundEffects", i, "sounds", assetMap, assetOverrides, stockAssets)),
    effects: (ability.effects ?? []).map((e) => resolvePowerEffect(e, assetMap, stockAssets)),
  };
}
