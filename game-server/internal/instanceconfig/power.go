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
	// Speed is projectile speed in feet/sec. When set, effects aimed at a
	// target land once the projectile arrives (distance / Speed) rather than
	// at cast - see ImpactDelay.
	Speed float64 `json:"speed,omitempty"`
}

// IsImpactAffects reports whether an effect with this affects value rides a
// projectile (lands at impact) on a power with a Speed: anything aimed at a
// target. self, bAll and gAll effects always land at cast.
func IsImpactAffects(affects string) bool {
	return affects != "self" && affects != "bAll" && affects != "gAll"
}

// IsFrontal returns true when the power requires the caster to face the target
// within a 150° arc (±75° from straight ahead). Defaults to true when omitted.
func (p Power) IsFrontal() bool {
	return p.Frontal == nil || *p.Frontal
}

// PowerEffect describes one mechanical outcome applied when a power fires.
// Type discriminator: "harm", "heal", "resource", "status", or "groundArea".
//
// harm fields:     Affects, Range, Amount, School, Tags
// heal fields:     Affects, Range (unless self), Amount, Tags
// resource fields: Affects, ResourceName, Delta, Range (unless self), Tags
// status fields:   Affects, Duration, Status, Range (unless self), Tags
// groundArea fields: Shape, Affects ("bAll", "gAll" or "all"), Range (when the
// shape is anchored on the target), Duration, TickInterval, OnTick, Graphic, Tags
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

	// Radius (feet), bTarget/gTarget only: the effect also lands on every
	// other hostile (bTarget) or friendly (gTarget) unit within Radius of the
	// target - a splash centered on the target rather than the caster. 0
	// means just the target.
	Radius float64 `json:"radius,omitempty"`

	// resource
	ResourceName string  `json:"resourceName,omitempty"` // Required for resource
	Delta        float64 `json:"delta,omitempty"`        // Required for resource; negative consumes

	// status
	Duration float64 `json:"duration,omitempty"` // Required for status: seconds
	Status   *Status `json:"status,omitempty"`   // Required for status

	// groundArea
	Shape        *AreaShape         `json:"shape,omitempty"`        // Required for groundArea
	TickInterval float64            `json:"tickInterval,omitempty"` // Seconds between ticks; DefaultAreaTickInterval when omitted
	OnTick       []PowerEffect      `json:"onTick,omitempty"`       // Required for groundArea: harm/heal/resource/status, without affects or range
	Graphic      *GroundAreaGraphic `json:"graphic,omitempty"`      // Client-only; ignored by the server except to relay it
}

// DefaultAreaTickInterval is a groundArea's tickInterval when it sets none.
const DefaultAreaTickInterval = 1.0

// AreaShape is a groundArea's footprint, before it is placed on a map. Type
// is "circle", "ring", "line" or "cone"; see docs/schema/power_effect.md.
type AreaShape struct {
	Type        string  `json:"type"`
	At          string  `json:"at,omitempty"`          // circle, ring: "self" or "target"
	Radius      float64 `json:"radius,omitempty"`      // circle
	InnerRadius float64 `json:"innerRadius,omitempty"` // ring
	OuterRadius float64 `json:"outerRadius,omitempty"` // ring
	Length      float64 `json:"length,omitempty"`      // line, cone
	Width       float64 `json:"width,omitempty"`       // line, cone
	Offset      float64 `json:"offset,omitempty"`      // cone
	Direction   string  `json:"direction,omitempty"`   // line, cone: "target" or "facing"
}

// GroundAreaGraphic is how the client draws a groundArea. The server only
// relays it.
type GroundAreaGraphic struct {
	Color        string   `json:"color,omitempty"`
	TextureURL   string   `json:"textureURL,omitempty"`
	TextureScale float64  `json:"textureScale,omitempty"`
	Opacity      *float64 `json:"opacity,omitempty"`
}

// IsGroundArea reports whether the effect creates a ground area.
func (e PowerEffect) IsGroundArea() bool { return e.Type == "groundArea" }

// AreaTickSeconds is the effect's tick interval, with the default applied.
func (e PowerEffect) AreaTickSeconds() float64 {
	if e.TickInterval > 0 {
		return e.TickInterval
	}
	return DefaultAreaTickInterval
}

// AreaAimsAtTarget reports whether a line or cone points toward the target:
// by default it does when the effect has a range (and so needs one anyway).
func (e PowerEffect) AreaAimsAtTarget() bool {
	if e.Shape == nil || (e.Shape.Type != "line" && e.Shape.Type != "cone") {
		return false
	}
	return e.Shape.Direction == "target" || (e.Shape.Direction == "" && e.Range != nil)
}

// AreaNeedsTarget reports whether a groundArea's footprint is anchored on, or
// aimed at, the caster's target.
func (e PowerEffect) AreaNeedsTarget() bool {
	return e.Shape != nil && (e.Shape.At == "target" || e.AreaAimsAtTarget())
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
