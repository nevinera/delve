package instancestate

import "github.com/delve-mmo/game-server/internal/instanceconfig"

// NCUState is the runtime state of one non-combat unit. NCUs live apart from
// Units so combat code never sees them; they only move and sync.
type NCUState struct {
	ZoneNCUIdentifier string
	MapIdentifier     string
	Position          instanceconfig.Position
	Radius            float64
	SpeedFactor       float64 // multiplier on the base mob speed; defaulted to 1.0 at spawn
	MovementConfig    instanceconfig.UnitMovement
	Movement          MovementState
}
