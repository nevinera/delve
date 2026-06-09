package instancestate

import (
	"github.com/google/uuid"

	"github.com/delve-mmo/game-server/internal/zoneconfig"
)

// UnitStatus is the lifecycle/combat state of a unit.
type UnitStatus string

const (
	UnitStatusIdle     UnitStatus = "idle"
	UnitStatusEngaged  UnitStatus = "engaged"
	UnitStatusDead     UnitStatus = "dead"
)

// ActiveStatusEffect is a status effect currently applied to a unit.
type ActiveStatusEffect struct {
	StatusIdentifier  string
	RemainingDuration float64 // seconds
}

// BehaviorState tracks tick-loop progress for a unit's movement and tactics.
// Zero value is valid for units with "still" movement and non-phased/scripted tactics.
type BehaviorState struct {
	// patrol movement
	PatrolStepIndex   int
	PatrolStepElapsed float64 // seconds elapsed waiting at the current step

	// phased tactics
	PhaseIndex   int
	PhaseElapsed float64 // seconds elapsed in the current phase

	// scripted tactics
	ScriptElapsed float64 // seconds elapsed in the current script window
}

// UnitState is the full runtime state of one unit instance.
type UnitState struct {
	ZoneUnitIdentifier string              // non-empty: Unit.Identifier from zone config
	UnitTypeIdentifier string              // key into zone.UnitTypes
	MapIdentifier      string
	Position           zoneconfig.Position
	SpawnPoint         zoneconfig.Position // initial position; used for respawn

	Health      float64
	MaxHealth   float64 // cached from UnitType.MaxHP at spawn
	Resource    float64 // current resource value
	MaxResource float64 // cached from UnitType.Resource.Max at spawn

	Status              UnitStatus
	Target              *uuid.UUID
	ActiveStatusEffects []ActiveStatusEffect
	Behavior            BehaviorState
}
