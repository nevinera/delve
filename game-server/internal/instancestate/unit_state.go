package instancestate

import (
	"time"

	"github.com/google/uuid"

	"github.com/delve-mmo/game-server/internal/instanceconfig"
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
	StatusIdentifier string
	ExpiresAt        time.Time
}

// MovementIntent holds the player-commanded movement keys for a unit.
// Zero value means not moving. Only meaningful for player character units;
// NPC movement is driven by BehaviorState instead.
type MovementIntent struct {
	Forward     bool
	Backward    bool
	StrafeLeft  bool
	StrafeRight bool
}

// BehaviorState tracks tick-loop progress for a unit's movement and tactics.
// Zero value is valid for units with "still" movement and non-phased/scripted tactics.
type BehaviorState struct {
	// NPC movement state machine.
	// MovementPhase == "" means still or not yet initialized.
	MovementPhase    string  // "", "moving", "waiting", "turning"
	PatrolStepIndex  int     // current waypoint index for patrol
	PatrolDir        int     // 1 or -1; direction of travel for "return" patrol mode
	PendingStepIndex int     // step index to apply when a turn completes (patrol only)
	TargetX          float64 // map-coord movement target
	TargetY          float64
	MoveRate         float64 // fraction of base speed for this leg
	WaitRemaining    float64 // seconds remaining in a wait
	TurnElapsed      float64 // seconds elapsed in a turning animation
	TurnStartAngle   float64 // degrees at turn start
	TurnEndAngle     float64 // degrees at turn end

	// last known position of the chase target, in this unit's map coordinates.
	// Updated each tick the target is visible (same map). Used to navigate
	// toward the connection the target crossed when they leave this map.
	LastSeenX float64
	LastSeenY float64

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
	Hostility          string              // "hostile", "neutral", "friendly", or "" for players
	Position           instanceconfig.Position
	SpawnPoint         instanceconfig.Position // initial position; used for respawn

	Health      float64
	MaxHealth   float64 // cached from UnitType.MaxHP at spawn
	Resource    float64 // current resource value
	MaxResource float64 // cached from UnitType.Resource.Max at spawn
	Speed       float64 // movement speed in feet per second
	Radius      float64 // collision radius in feet; 0 means no collision (NPCs for now)

	Status                 UnitStatus
	Target                 *uuid.UUID
	GlobalCooldownEndsAt   time.Time
	PowerCooldowns         map[string]time.Time // keyed by power name; zero/missing means ready
	ActiveStatusEffects    []ActiveStatusEffect
	Behavior            BehaviorState
	MovementIntent      MovementIntent
}
