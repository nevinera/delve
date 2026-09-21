// Builds the entry-field patch for picking a stock graphic/sound from the
// editor's pulldowns (see AbilityFieldsPanel's StockAssetPicker). Always
// writes every sprite field explicitly (undefined when the new pick doesn't
// have one), rather than only the fields present on the new asset -
// otherwise switching from an animated pick to a static one (or vice versa)
// would leave stale spriteColumns/spriteRows/etc. from the previous pick
// mixed in with the new sourceURL. `undefined`, not `null`: the server-side
// validators (see Validators::Helpers#validate_graphic_sprite_sheet!) treat
// a *present* spriteColumns/spriteRows/spriteFrameCount/spriteFrameRate as
// required to be an actual number, key presence alone - not its
// nullness - is what they check, so a literal `null` fails validation where
// an omitted key doesn't. JSON.stringify drops undefined-valued keys
// entirely, which is what clears a stale value here.
export function graphicFieldsFor(name, meta) {
  return {
    sourceURL: `:${name}:`,
    spriteColumns: meta.spriteColumns,
    spriteRows: meta.spriteRows,
    spriteFrameCount: meta.spriteFrameCount,
    spriteFrameRate: meta.spriteFrameRate,
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
