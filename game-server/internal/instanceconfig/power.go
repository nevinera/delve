package instanceconfig

// Power is an active ability a unit can use in combat.
// graphicEffects and soundEffects are client-only and omitted.
type Power struct {
	Name           string       `json:"name"`                    // Required
	Description    string       `json:"description,omitempty"`
	MaxRange       float64      `json:"maxRange,omitempty"`      // Feet to valid target; omit for self/melee
	CastTime       *float64     `json:"castTime"`                // Required: seconds, or null for instant
	GlobalCooldown float64      `json:"globalCooldown"`          // Required: seconds
	Cooldown       float64      `json:"cooldown,omitempty"`      // Per-power cooldown in seconds
	CostType       string       `json:"costType,omitempty"`      // Resource name required
	CostAmount     float64      `json:"costAmount,omitempty"`    // Minimum resource required
	Effects        []PowerEffect `json:"effects"`                // Required (may be empty)
}

// PowerEffect describes one mechanical outcome applied when a power fires.
// Type discriminator: "harm", "heal", "resource", or "status".
//
// harm fields:     Affects, Range, Amount, Tags
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
	Name      string         `json:"name"`      // Required
	TreatAs   string         `json:"treatAs"`   // Required: "buff", "debuff", or "inherent"
	Stacking  string         `json:"stacking"`  // Required: "extend", "replace", or "stack"
	MaxStacks int            `json:"maxStacks,omitempty"` // Only meaningful when stacking is "stack"
	Effects   []StatusEffect `json:"effects"`   // Required (may be empty)
}

// StatusEffect describes one mechanical outcome of a status being active.
// Type discriminator: "stat", "recurring", or "none".
//
// none fields:      (none)
// stat fields:      StatName, ModifierType, Amount
// recurring fields: TickRate, OnTick, Amount
type StatusEffect struct {
	Type string `json:"type"` // Required

	// stat
	StatName     string  `json:"statName,omitempty"`     // Required for stat
	ModifierType string  `json:"modifierType,omitempty"` // Required for stat: "multiply" or "add"
	Amount       float64 `json:"amount,omitempty"`       // Required for stat and recurring

	// recurring
	TickRate float64 `json:"tickRate,omitempty"` // Required for recurring: seconds between ticks
	OnTick   string  `json:"onTick,omitempty"`   // Required for recurring: "heal" or "harm"
}
