// Resolves a ":name:" stock asset reference (see docs/schema/common.md
// #stock-asset-reference) to this app's own origin, regardless of whatever
// baseUrl the caller would otherwise resolve a relative sourceURL/iconURL
// against (a zone's or class's config_url, or a content repo file) - stock
// assets are server-hosted, not content-authored. Returns null when `value`
// isn't a stock reference, so callers fall back to their own normal
// relative-URL resolution.
//
// stockAssets is the {icons, graphics, sounds} shape injected server-side by
// Content::StockAssets.client_json - each entry has at least a `url`.
export function resolveStockAssetUrl(value, kind, stockAssets) {
  const match = typeof value === "string" && value.match(/^:(.+):$/);
  if (!match) return null;
  const entry = stockAssets?.[kind]?.[match[1]];
  return entry ? new URL(entry.url, window.location.origin).href : null;
}
