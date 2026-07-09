package instanceconfig

// UnitType is a template from which individual units are created.
// tokenImageUrl is client-only and omitted.
type UnitType struct {
	Name        string       `json:"name"`        // Required
	Description string       `json:"description,omitempty"`
	TokenRadius  float64      `json:"tokenRadius"`  // Required: collision radius in feet, 1.0-20.0
	SpeedFactor  float64      `json:"speedFactor"`  // Default 1.0; movement speed multiplier
	AggroRadius  float64      `json:"aggroRadius"`  // Feet; omitted/0 defaults to 20ft
	MaxHP       int          `json:"maxHP"`       // Required
	Resource    ResourceType `json:"resource"`    // Required
	Powers      []Power      `json:"powers,omitempty"`
	Targeting   UnitTargeting `json:"targeting,omitempty"`
	Tactics     UnitTactics  `json:"tactics,omitempty"`
}

// ResourceType defines the resource used to power a unit's abilities.
// color is client-only and omitted.
type ResourceType struct {
	Name         string  `json:"name"`         // Required
	Max          float64 `json:"max"`          // Required
	DefaultValue float64 `json:"defaultValue"` // Required: starting value and passive return target
	ReturnRate   float64 `json:"returnRate"`   // Default 0.0: units per second toward defaultValue
	IsFluid      bool    `json:"isFluid"`      // Required: true=quantitative, false=discrete
}

// UnitTargeting determines how a unit selects its target once aggro'd.
// Type discriminator: "aggroTable", "nearest", or "healerAggro".
// No additional fields beyond Type for any current variant.
type UnitTargeting struct {
	Type string `json:"type"` // Required: "aggroTable", "nearest", or "healerAggro"
}

// UnitTactics determines how a unit decides which power to use.
// Type discriminator: "randomAvailable", "rotation", "priorityRotation", "scripted", or "phased".
//
// randomAvailable fields: (none)
// rotation fields:        Powers
// priorityRotation fields: Powers
// scripted fields:        Duration, Events
// phased fields:          Phases
type UnitTactics struct {
	Type string `json:"type"` // Required

	// rotation, priorityRotation
	Powers []string `json:"powers,omitempty"`

	// scripted
	Duration float64       `json:"duration,omitempty"` // Required for scripted: window length in seconds
	Events   []ScriptEvent `json:"events,omitempty"`   // Required for scripted

	// phased
	Phases []Phase `json:"phases,omitempty"` // Required for phased: ≥2
}

// ScriptEvent fires a specific power at a specific time within a scripted window.
type ScriptEvent struct {
	Power string  `json:"power"` // Required: power name
	At    float64 `json:"at"`    // Required: seconds into the window
}

// Phase is one stage in a phased tactics sequence.
type Phase struct {
	Tactics    UnitTactics      `json:"tactics"`              // Required; may not be "phased"
	Transition *PhaseTransition `json:"transition,omitempty"` // Required unless last phase
}

// PhaseTransition describes the condition that ends a phase and advances to
// the next. Exactly one field should be set.
type PhaseTransition struct {
	TimeElapsed *float64 `json:"timeElapsed,omitempty"` // Seconds since phase started
	HealthBelow *float64 `json:"healthBelow,omitempty"` // Fraction of maxHP, 0.0-1.0
}
