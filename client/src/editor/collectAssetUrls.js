// JS port of Build::AbilitiesController#collect_asset_urls/#stock_reference? -
// walks an ability's data for every "...URL" field's relative asset path
// (icon/graphic/sound references), skipping stock references (":name:" -
// server-hosted, no repo file to resolve at all - see
// docs/schema/common.md#stock-asset-reference).
function isStockReference(value) {
  return value.startsWith(":") && value.endsWith(":");
}

export function collectAssetUrls(data) {
  if (Array.isArray(data)) return data.flatMap(collectAssetUrls);
  if (data && typeof data === "object") {
    return Object.entries(data).flatMap(([key, value]) => {
      if (key.endsWith("URL") && typeof value === "string" && !isStockReference(value)) return [value];
      return collectAssetUrls(value);
    });
  }
  return [];
}
