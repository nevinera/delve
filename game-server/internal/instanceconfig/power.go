package instanceconfig

// Power is an active ability a unit can use in combat.
//
// Client-only fields (present in JSON, ignored by the server):
//   - iconURL:        URL of the action bar icon image
//   - graphicEffects: visual effects played on cast/impact
//   - soundEffects:   audio effects played on cast/impact
//
// Tags is parsed but not currently used by any server-side logic.
type Power struct {
	Name           string        `json:"name"` // Required
	Description    string        `json:"description,omitempty"`
	MaxRange       float64       `json:"maxRange,omitempty"`   // Feet to valid target; omit for self/melee
	CastTime       *float64      `json:"castTime"`             // Required: seconds, or null for instant
	GlobalCooldown float64       `json:"globalCooldown"`       // Required: seconds
	Cooldown       float64       `json:"cooldown,omitempty"`   // Per-power cooldown in seconds
	Frontal        *bool         `json:"frontal,omitempty"`    // nil/true = 150° arc required; false = any facing
	CostType       string        `json:"costType,omitempty"`   // Resource name required
	CostAmount     float64       `json:"costAmount,omitempty"` // Minimum resource required
	Tags           []string      `json:"tags,omitempty"`       // Free-form labels, e.g. "harmful", "class_druid"
	Effects        []PowerEffect `json:"effects"`              // Required (may be empty)
}

// IsFrontal returns true when the power requires the caster to face the target
// within a 150° arc (±75° from straight ahead). Defaults to true when omitted.
func (p Power) IsFrontal() bool {
	return p.Frontal == nil || *p.Frontal
}

// PowerEffect describes one mechanical outcome applied when a power fires.
// Type discriminator: "harm", "heal", "resource", or "status".
//
// harm fields:     Affects, Range, Amount, School, Tags
// heal fields:     Affects, Range (unless self), Amount, Tags
// resource fields: Affects, ResourceName, Delta, Range (unless self), Tags
// status fields:   Affects, Duration, Status, Range (unless self), Tags
type PowerEffect struct {
	Type string   `json:"type"` // Required
	Tags []string `json:"tags,omitempty"`

	// harm, heal, resource, status
	Affects string `json:"affects,omitempty"` // "bTarget", "gTarget", "bAll", "gAll", or "self"

	// harm, heal
	Amount *ValueRange `json:"amount,omitempty"` // Required for harm/heal

	// harm only: "physical" (default) or "magic" - picks which of the
	// target's Avoidance/Defence Rating pools mitigates it, same as
	// UnitType.BasicAttackSchool does for a basic attack. See docs/stats.md.
	School string `json:"school,omitempty"`

	// harm, heal, resource, status (omitted when affects is "self")
	Range *ZeroBasedValueRange `json:"range,omitempty"`

	// resource
	ResourceName string  `json:"resourceName,omitempty"` // Required for resource
	Delta        float64 `json:"delta,omitempty"`        // Required for resource; negative consumes

	// status
	Duration float64 `json:"duration,omitempty"` // Required for status: seconds
	Status   *Status `json:"status,omitempty"`   // Required for status
}

// Status is a named effect applied to a unit for a fixed duration.
type Status struct {
	Name        string         `json:"name"`                  // Required
	Description string         `json:"description,omitempty"` // Short description shown in UI.
	ShortName   string         `json:"shortName"`             // Required: <=6 chars, compact UI badge (no status icons yet)
	TreatAs     string         `json:"treatAs"`               // Required: "buff", "debuff", or "inherent"
	Stacking    string         `json:"stacking"`              // Required: "extend", "replace", or "stack"
	MaxStacks   int            `json:"maxStacks,omitempty"`   // Only meaningful when stacking is "stack"
	Effects     []StatusEffect `json:"effects"`               // Required (may be empty)
}

// StatusEffect describes one mechanical outcome of a status being active.
// Type discriminator: "stat", "recurring", or "none".
//
// none fields:      (none)
// stat fields:      StatName, ModifierType, Amount
// recurring fields: TickRate, OnTick, Amount, School
type StatusEffect struct {
	Type string `json:"type"` // Required

	// stat
	StatName     string  `json:"statName,omitempty"`     // Required for stat
	ModifierType string  `json:"modifierType,omitempty"` // Required for stat: "multiply" or "add"
	Amount       float64 `json:"amount,omitempty"`       // Required for stat and recurring

	// recurring
	TickRate float64 `json:"tickRate,omitempty"` // Required for recurring: seconds between ticks
	OnTick   string  `json:"onTick,omitempty"`   // Required for recurring: "heal" or "harm"

	// recurring only: "physical" (default) or "magic" - same as
	// PowerEffect.School. Picks which haste pool scales the tick interval,
	// and (for onTick: "harm") which of the target's Avoidance/Defence
	// Rating pools mitigates each tick. Ignored (always magic) for
	// onTick: "heal", same as a heal PowerEffect.
	School string `json:"school,omitempty"`

	// Condition gates whether this effect is mechanically live right now -
	// nil means always live. See docs/schema/status.md#statuseffectcondition.
	Condition *StatusEffectCondition `json:"condition,omitempty"`

	// triggered
	Trigger          *StatusTrigger   `json:"trigger,omitempty"`          // Required for triggered
	InternalCooldown float64          `json:"internalCooldown,omitempty"` // Required for triggered: minimum seconds between fires
	TriggeredEffect  *TriggeredEffect `json:"effect,omitempty"`           // Required for triggered
}

// StatusTrigger is what causes a "triggered" StatusEffect to fire. Type
// discriminator: "healthAbove", "healthBelow", "takesDamage", or
// "dealsDamage" - always evaluated against the unit holding the status (see
// docs/schema/status.md#triggered).
type StatusTrigger struct {
	Type string `json:"type"` // Required

	// healthAbove, healthBelow
	Threshold float64 `json:"threshold,omitempty"` // Required for healthAbove/healthBelow: 0-100
}

// TriggeredEffect is what happens when a "triggered" StatusEffect fires.
// Deliberately smaller than PowerEffect - no range/LOS check (this fires
// reactively, from combat that's already happening, not a fresh cast), and
// Affects is only "self" or "target" (the holder's own current target).
// Type discriminator: "harm", "heal", "resource", or "status" - same
// meanings as PowerEffect.
type TriggeredEffect struct {
	Type    string `json:"type"`    // Required
	Affects string `json:"affects"` // Required: "self" or "target"

	// harm, heal
	Amount *ValueRange `json:"amount,omitempty"` // Required for harm/heal

	// harm only: "physical" (default) or "magic" - same meaning as
	// PowerEffect.School.
	School string `json:"school,omitempty"`

	// resource
	ResourceName string  `json:"resourceName,omitempty"` // Required for resource
	Delta        float64 `json:"delta,omitempty"`        // Required for resource; negative consumes

	// status
	Duration float64 `json:"duration,omitempty"` // Required for status: seconds
	Status   *Status `json:"status,omitempty"`   // Required for status
}

// StatusEffectCondition gates a single StatusEffect on live combat state.
// Type discriminator: "hasStatus", "selfHealthPct", "targetHealthPct", or
// "casterResource". Evaluated by command.ConditionMet, cached once per
// server tick on ActiveStatusEffect.ConditionsMet rather than recomputed on
// every read (see instance/status_conditions.go).
type StatusEffectCondition struct {
	Type string `json:"type"` // Required

	// hasStatus
	StatusName string `json:"statusName,omitempty"` // Required for hasStatus

	// selfHealthPct, targetHealthPct, casterResource
	Comparison string  `json:"comparison,omitempty"` // Required: "above" or "below"
	Threshold  float64 `json:"threshold,omitempty"`  // Required: 0-100 for the healthPct variants; a raw resource value for casterResource

	// casterResource
	ResourceName string `json:"resourceName,omitempty"` // Required for casterResource
}
