package instanceconfig

// NCU is a non-combat unit placed on a map: it moves and talks, but has no
// UnitType and never takes part in combat. See docs/schema/ncu.md.
type NCU struct {
	Identifier    string       `json:"identifier"`            // Required: unique among the zone's NCUs
	Name          string       `json:"name"`                  // Required
	TokenImageURL string       `json:"tokenImageUrl"`         // Required; client-only
	TokenRadius   float64      `json:"tokenRadius"`           // Required: feet
	SpeedFactor   float64      `json:"speedFactor,omitempty"` // Default 1.0
	Position      Position     `json:"position"`              // Required
	Movement      UnitMovement `json:"movement,omitempty"`
	// dialogue is client-only content the server never reads - omitted
	// here entirely rather than typed, so its shape can evolve freely;
	// encoding/json silently ignores unknown JSON fields by default.
}
