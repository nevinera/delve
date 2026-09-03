// Builds the entry-field patch for picking a stock graphic/sound from the
// editor's pulldowns (see AbilityFieldsPanel's StockAssetPicker). Always
// writes every sprite field explicitly (null when the new pick doesn't have
// one), rather than only the fields present on the new asset - otherwise
// switching from an animated pick to a static one (or vice versa) would
// leave stale spriteColumns/spriteRows/etc. from the previous pick mixed in
// with the new sourceURL.
export function graphicFieldsFor(name, meta) {
  return {
    sourceURL: `:${name}:`,
    spriteColumns: meta.spriteColumns ?? null,
    spriteRows: meta.spriteRows ?? null,
    spriteFrameCount: meta.spriteFrameCount ?? null,
    spriteFrameRate: meta.spriteFrameRate ?? null,
  };
}

// duration is required on a SoundEffect (see Validators::SoundEffectValidator),
// so it's only overwritten when the stock sound actually specifies one,
// rather than ever being cleared to null like the graphic sprite fields.
export function soundFieldsFor(name, meta) {
  const fields = {sourceURL: `:${name}:`};
  if (meta.duration != null) fields.duration = meta.duration;
  return fields;
}
