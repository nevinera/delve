// Field-widget registry for graphicEffects/soundEffects/effects entries (see
// Validators::GraphicEffectValidator, SoundEffectValidator, PowerEffectValidator).
// Keyed by field name rather than by section+effect-type, since the enum
// fields (from/to/when/condition/location/impactTiming) mean the same thing
// wherever they appear.

const SELECT_OPTIONS = {
  from: ["self", "affected"],
  to: ["", "self", "affected"],
  when: ["immediate", "impact"],
  condition: ["always", "onHit", "onMiss"],
  location: ["self", "affected"],
  impactTiming: ["", "after", "before", "centered"],
  type: ["harm", "heal", "resource", "status"],
  affects: ["bTarget", "gTarget", "bAll", "gAll", "self"],
};

// amount/range may be a single number or a [min, max] pair (see
// Validators::Helpers#validate_float_or_range!) - edited as two number
// inputs, same approach as Content::FloatOrRange server-side.
const RANGE_FIELDS = new Set(["amount", "range"]);

const NUMBER_FIELDS = new Set([
  "duration", "scale", "spriteColumns", "spriteRows", "spriteFrameCount",
  "spriteFrameRate", "volumeScale", "delta",
]);

// The nested "status" object isn't editable yet (see Content::Effect::Status).
const READONLY_FIELDS = new Set(["status"]);

export function widgetFor(field) {
  if (SELECT_OPTIONS[field]) return "select";
  if (RANGE_FIELDS.has(field)) return "range";
  if (field === "tags") return "tags";
  if (NUMBER_FIELDS.has(field)) return "number";
  if (READONLY_FIELDS.has(field)) return "readonly";
  return "text";
}

export function selectOptions(field) {
  return SELECT_OPTIONS[field] ?? [];
}
