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
  // "physical" (default) or "magic" - see Validators::PowerEffectValidator::
  // DAMAGE_SCHOOLS. Used both by a top-level harm/heal effect's own
  // `school` field and (locally, in StatusEditor) a recurring
  // StatusEffect's `school`.
  school: ["", "physical", "magic"],
};

// amount/range may be a single number or a [min, max] pair (see
// Validators::Helpers#validate_float_or_range!) - edited as two number
// inputs, same approach as Content::FloatOrRange server-side.
const RANGE_FIELDS = new Set(["amount", "range"]);

const NUMBER_FIELDS = new Set([
  "duration", "scale", "spriteColumns", "spriteRows", "spriteFrameCount",
  "spriteFrameRate", "volumeScale", "delta",
]);

export function widgetFor(field) {
  if (field === "status") return "status";
  if (SELECT_OPTIONS[field]) return "select";
  if (RANGE_FIELDS.has(field)) return "range";
  if (field === "tags") return "tags";
  if (NUMBER_FIELDS.has(field)) return "number";
  return "text";
}

export function selectOptions(field) {
  return SELECT_OPTIONS[field] ?? [];
}

// Recognized field order per section (mirrors Content::GraphicEffect /
// Content::SoundEffect server-side), shown regardless of whether the loaded
// entry happens to have them set - otherwise there'd be no way to e.g. add
// spriteColumns/spriteRows to a graphicEffect that was previously a plain,
// non-animated image. "effects" is polymorphic on "type" (harm/heal/
// resource/status each have a different field set) and isn't fully covered
// yet - status and resource are forced below (otherwise there'd be no way
// to add resourceName/delta to an effect just switched to "resource"), harm
// and heal still stay purely data-driven.
const ENTRY_FIELDS = {
  graphicEffects: [
    "sourceURL", "duration", "from", "to", "when", "condition",
    "color", "scale", "spriteColumns", "spriteRows", "spriteFrameCount", "spriteFrameRate",
  ],
  soundEffects: ["sourceURL", "duration", "location", "when", "condition", "impactTiming", "volumeScale"],
};

// resourceName is deliberately freeform (see widgetFor's default), same
// reasoning as costType on the ability itself - it just needs to match
// whatever resource name the affected unit/class actually has, not a fixed
// list.
const RESOURCE_EFFECT_FIELDS = ["type", "affects", "resourceName", "delta", "range"];

export function entryFieldsFor(section, entry) {
  if (section === "effects" && entry.type === "status") {
    const fields = Object.keys(entry);
    if (!fields.includes("status")) fields.push("status");
    if (!fields.includes("duration")) fields.push("duration");
    return fields;
  }
  if (section === "effects" && entry.type === "resource") {
    const fields = Object.keys(entry);
    for (const field of RESOURCE_EFFECT_FIELDS) {
      if (!fields.includes(field)) fields.push(field);
    }
    return fields;
  }
  return ENTRY_FIELDS[section] ?? Object.keys(entry);
}

// Starter values for a newly-added entry - the minimum each type needs to
// already be valid per the validators (e.g. harm requires affects/amount/
// range), so the new entry isn't obviously broken before it's edited.
const PLACEHOLDER_ENTRIES = {
  graphicEffects: {sourceURL: "", duration: 0.3, from: "self", when: "immediate", condition: "always"},
  soundEffects: {sourceURL: "", duration: 0.3, location: "affected", when: "immediate", condition: "always"},
  effects: {type: "harm", affects: "bTarget", amount: 10.0, range: 5.0},
};

export function placeholderEntry(section) {
  return {...PLACEHOLDER_ENTRIES[section]};
}
