package instanceconfig

// Unit is a placed instance of a UnitType on a map.
type Unit struct {
	UnitType          string         `json:"unitType"`                    // Required: key into zone's UnitTypes map
	Position          Position       `json:"position"`                    // Required: initial placement and facing
	Hostility         string         `json:"hostility"`                   // Required: "hostile", "neutral", or "friendly"
	CurrentHPFraction float64        `json:"currentHpFraction,omitempty"` // Default 1.0
	Movement          UnitMovement   `json:"movement,omitempty"`
	Identifier        string         `json:"identifier,omitempty"`
	GroupIdentifier   string         `json:"groupIdentifier,omitempty"` // units on the same map sharing this aggro together
	LootTable         map[string]int `json:"lootTable,omitempty"`       // identifier → weight
	LootCount         *ValueRange    `json:"lootCount,omitempty"`       // items to award per kill; default 1
	Respawn           *RespawnConfig `json:"respawn,omitempty"`         // overrides the map's/zone's respawn for this unit - see Zone.UnitRespawn
	Noncombat         bool           `json:"noncombat,omitempty"`       // can't be targeted/damaged, never aggros
	Dialogue          []string       `json:"dialogue,omitempty"`        // lines a player clicks through; read by the client only
}

// UnitMovement defines how an un-aggro'd unit moves.
// Type discriminator: "still", "patrol", or "wander".
//
// still fields:  (none)
// patrol fields: Choose, Steps
// wander fields: Location, Radius, Speed, WaitTime
type UnitMovement struct {
	Type string `json:"type"` // Required: "still", "patrol", or "wander"

	// patrol
	Choose string         `json:"choose,omitempty"` // Required for patrol: "return", "loop", or "random"
	Steps  []MovementStep `json:"steps,omitempty"`  // Required for patrol: ≥2

	// wander
	Location *Location   `json:"location,omitempty"` // Required for wander: center of wander zone
	Radius   float64     `json:"radius,omitempty"`   // Required for wander: feet
	Speed    *ValueRange `json:"speed,omitempty"`    // Required for wander: fraction of base speed, 0.1-1.0
	WaitTime *ValueRange `json:"waitTime,omitempty"` // Required for wander: seconds between moves
}

// MovementStep is one position in a patrol route.
type MovementStep struct {
	Position     Position   `json:"position"`     // Required
	MovementRate float64    `json:"movementRate"` // Required: fraction of unit speed, 0.0-1.0
	WaitTime     ValueRange `json:"waitTime"`     // Required: seconds to wait at this position
}
