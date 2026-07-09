package instance_test

import (
	"math"
	"testing"

	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"

	"github.com/delve-mmo/game-server/internal/instance"
	"github.com/delve-mmo/game-server/internal/instanceconfig"
	"github.com/delve-mmo/game-server/internal/instancestate"
)

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

func pos(x, y float64) instanceconfig.Position { return instanceconfig.Position{X: x, Y: y} }
func loc(x, y float64) instanceconfig.Location { return instanceconfig.Location{X: x, Y: y} }
func locPtr(x, y float64) *instanceconfig.Location { l := loc(x, y); return &l }

func vr(v float64) instanceconfig.ValueRange        { return instanceconfig.ValueRange{v, v} }
func vrPtr(v float64) *instanceconfig.ValueRange    { r := vr(v); return &r }

// npcZone builds a minimal zone with one map and one NPC unit.
func npcZone(identifier string, startPos instanceconfig.Position, mv instanceconfig.UnitMovement) instanceconfig.Zone {
	return instanceconfig.Zone{
		UnitTypes: map[string]instanceconfig.UnitType{
			"goblin": {Name: "Goblin", TokenRadius: 2.0, SpeedFactor: 1.0, MaxHP: 10},
		},
		Maps: []instanceconfig.Map{{
			Identifier: "map1",
			Units: []instanceconfig.Unit{{
				Identifier: identifier,
				UnitType:   "goblin",
				Position:   startPos,
				Hostility:  "hostile",
				Movement:   mv,
			}},
		}},
	}
}

// npcState builds a matching InstanceState for an npcZone.
func npcState(identifier string, startPos instanceconfig.Position) (*instancestate.UnitState, *instancestate.InstanceState) {
	u := &instancestate.UnitState{
		ZoneUnitIdentifier: identifier,
		UnitTypeIdentifier: "goblin",
		MapIdentifier:      "map1",
		Position:           startPos,
		Status:             instancestate.UnitStatusIdle,
		Health:             10,
		MaxHealth:          10,
	}
	s := &instancestate.InstanceState{
		Units: map[uuid.UUID]*instancestate.UnitState{uuid.New(): u},
	}
	return u, s
}

const dt = 0.1 // one tick in seconds

// ---------------------------------------------------------------------------
// geometry helpers
// ---------------------------------------------------------------------------

func TestFacingTowardDeg_North(t *testing.T) {
	// Moving from (0,0) to (0,1) should give 0° (north).
	assert.InDelta(t, 0.0, instance.FacingTowardDegForTest(0, 0, 0, 1), 1e-9)
}

func TestFacingTowardDeg_East(t *testing.T) {
	// Moving from (0,0) to (1,0) should give 90° (east).
	assert.InDelta(t, 90.0, instance.FacingTowardDegForTest(0, 0, 1, 0), 1e-9)
}

func TestFacingTowardDeg_South(t *testing.T) {
	assert.InDelta(t, 180.0, math.Abs(instance.FacingTowardDegForTest(0, 0, 0, -1)), 1e-9)
}

func TestFacingTowardDeg_West(t *testing.T) {
	assert.InDelta(t, 90.0, math.Abs(instance.FacingTowardDegForTest(0, 0, -1, 0)), 1e-9)
}

func TestLerpAngleDeg_Halfway(t *testing.T) {
	assert.InDelta(t, 45.0, instance.LerpAngleDegForTest(0, 90, 0.5), 1e-9)
}

func TestLerpAngleDeg_WrapsShortWay(t *testing.T) {
	// From 350° to 10° the short path is +20°, landing at 360°≡0° at t=0.5.
	result := instance.LerpAngleDegForTest(350, 10, 0.5)
	// Normalize to [0, 360) before comparing.
	normalized := math.Mod(result+360*100, 360)
	assert.InDelta(t, 0.0, normalized, 1e-9)
}

// ---------------------------------------------------------------------------
// still movement
// ---------------------------------------------------------------------------

func TestApplyNPCMovement_StillUnit_DoesNotMove(t *testing.T) {
	zone := npcZone("g1", pos(5, 5), instanceconfig.UnitMovement{Type: "still"})
	u, s := npcState("g1", pos(5, 5))
	instance.ApplyUnitBehaviorsForTest(s, zone, dt)
	assert.Equal(t, 5.0, u.Position.X)
	assert.Equal(t, 5.0, u.Position.Y)
}

func TestApplyNPCMovement_MissingMovementType_DoesNotMove(t *testing.T) {
	zone := npcZone("g1", pos(5, 5), instanceconfig.UnitMovement{})
	u, s := npcState("g1", pos(5, 5))
	instance.ApplyUnitBehaviorsForTest(s, zone, dt)
	assert.Equal(t, 5.0, u.Position.X)
	assert.Equal(t, 5.0, u.Position.Y)
}

// ---------------------------------------------------------------------------
// patrol movement
// ---------------------------------------------------------------------------

func patrolZone(choose string, steps ...instanceconfig.MovementStep) instanceconfig.Zone {
	return npcZone("g1", pos(0, 0), instanceconfig.UnitMovement{
		Type:   "patrol",
		Choose: choose,
		Steps:  steps,
	})
}

func step(x, y, rate float64, waitSec float64) instanceconfig.MovementStep {
	return instanceconfig.MovementStep{
		Position:     pos(x, y),
		MovementRate: rate,
		WaitTime:     vr(waitSec),
	}
}

func TestApplyNPCMovement_Patrol_InitializesOnFirstTick(t *testing.T) {
	zone := patrolZone("loop", step(0, 20, 1.0, 0), step(0, 40, 1.0, 0))
	u, s := npcState("g1", pos(0, 0))
	instance.ApplyUnitBehaviorsForTest(s, zone, dt)
	assert.Equal(t, "moving", u.Behavior.MovementPhase)
}

func TestApplyNPCMovement_Patrol_MovesTowardFirstStep(t *testing.T) {
	// Unit at (0,0), first patrol step at (0,20). SpeedFactor=1, BaseMobSpeed=10 ft/s.
	// One tick (0.1s) at rate 1.0 → moves 1 foot north.
	zone := patrolZone("loop", step(0, 20, 1.0, 0), step(0, 40, 1.0, 0))
	u, s := npcState("g1", pos(0, 0))
	instance.ApplyUnitBehaviorsForTest(s, zone, dt)
	assert.InDelta(t, 0.0, u.Position.X, 1e-9)
	assert.InDelta(t, 1.0, u.Position.Y, 1e-9)
}

func TestApplyNPCMovement_Patrol_FacesFirstStep(t *testing.T) {
	zone := patrolZone("loop", step(0, 20, 1.0, 0), step(20, 20, 1.0, 0))
	u, s := npcState("g1", pos(0, 0))
	instance.ApplyUnitBehaviorsForTest(s, zone, dt)
	assert.InDelta(t, 0.0, u.Position.Angle, 1e-9) // facing north toward (0,20)
}

func TestApplyNPCMovement_Patrol_ArrivesAndWaits(t *testing.T) {
	// Unit at (0,0), step at (0,0.5) with 5s wait. Speed=10, rate=1 → 1ft/tick.
	// Two ticks: first tick moves 1ft but target is only 0.5ft away, so arrives.
	zone := patrolZone("loop", step(0, 0.5, 1.0, 5.0), step(0, 10, 1.0, 0))
	u, s := npcState("g1", pos(0, 0))
	instance.ApplyUnitBehaviorsForTest(s, zone, dt)
	assert.Equal(t, "waiting", u.Behavior.MovementPhase)
	assert.InDelta(t, 0.0, u.Position.X, 1e-9)
	assert.InDelta(t, 0.5, u.Position.Y, 1e-9)
}

func TestApplyNPCMovement_Patrol_WaitExpires_BeginsTurn(t *testing.T) {
	zone := patrolZone("loop", step(0, 0.5, 1.0, 0.05), step(0, 10, 1.0, 0))
	u, s := npcState("g1", pos(0, 0))
	// Tick 1: arrives at step 0, sets wait=0.05s.
	instance.ApplyUnitBehaviorsForTest(s, zone, dt)
	assert.Equal(t, "waiting", u.Behavior.MovementPhase)
	// Tick 2: wait 0.05s expires (dt=0.1s > 0.05s), begins turning toward step 1.
	instance.ApplyUnitBehaviorsForTest(s, zone, dt)
	assert.Equal(t, "turning", u.Behavior.MovementPhase)
}

func TestApplyNPCMovement_Patrol_TurnCompletes_Moves(t *testing.T) {
	zone := patrolZone("loop", step(0, 0.5, 1.0, 0.05), step(0, 10, 1.0, 0))
	u, s := npcState("g1", pos(0, 0))
	instance.ApplyUnitBehaviorsForTest(s, zone, dt) // arrives → waiting
	instance.ApplyUnitBehaviorsForTest(s, zone, dt) // wait expires → turning
	// turnDuration=0.3s; 3 more ticks of 0.1s each should complete the turn.
	for range 3 {
		instance.ApplyUnitBehaviorsForTest(s, zone, dt)
	}
	assert.Equal(t, "moving", u.Behavior.MovementPhase)
	assert.Equal(t, 1, u.Behavior.PatrolStepIndex)
}

func TestApplyNPCMovement_Patrol_NoWait_ContinuesStraightThrough(t *testing.T) {
	// Zero-wait patrol: unit should keep moving without entering waiting/turning.
	zone := patrolZone("loop", step(0, 0.5, 1.0, 0), step(0, 20, 1.0, 0))
	u, s := npcState("g1", pos(0, 0))
	instance.ApplyUnitBehaviorsForTest(s, zone, dt) // arrives at step 0 immediately
	// Should be moving toward step 1, no waiting or turning.
	assert.Equal(t, "moving", u.Behavior.MovementPhase)
	assert.Equal(t, 1, u.Behavior.PatrolStepIndex)
}

func TestApplyNPCMovement_Patrol_LoopWraps(t *testing.T) {
	// Two steps with zero wait; loop mode should wrap back to step 0.
	zone := patrolZone("loop",
		step(0, 0.1, 1.0, 0),
		step(0, 0.2, 1.0, 0),
	)
	u, s := npcState("g1", pos(0, 0))
	instance.ApplyUnitBehaviorsForTest(s, zone, dt) // arrives step 0 → moves to step 1
	instance.ApplyUnitBehaviorsForTest(s, zone, dt) // arrives step 1 → wraps to step 0
	assert.Equal(t, 0, u.Behavior.PatrolStepIndex)
	assert.Equal(t, "moving", u.Behavior.MovementPhase)
}

func TestApplyNPCMovement_Patrol_ReturnBounces(t *testing.T) {
	// Three steps, return mode: 0→1→2→1→0→1→...
	zone := patrolZone("return",
		step(0, 0.1, 1.0, 0),
		step(0, 0.2, 1.0, 0),
		step(0, 0.3, 1.0, 0),
	)
	u, s := npcState("g1", pos(0, 0))
	for range 3 {
		instance.ApplyUnitBehaviorsForTest(s, zone, dt)
	}
	// After arriving at steps 0, 1, 2 in sequence: direction should have reversed.
	assert.Equal(t, -1, u.Behavior.PatrolDir)
}

func TestApplyNPCMovement_Patrol_InsufficientSteps_DoesNotMove(t *testing.T) {
	zone := patrolZone("loop", step(0, 10, 1.0, 0)) // only 1 step
	u, s := npcState("g1", pos(0, 0))
	instance.ApplyUnitBehaviorsForTest(s, zone, dt)
	assert.Equal(t, "", u.Behavior.MovementPhase)
	assert.Equal(t, 0.0, u.Position.X)
	assert.Equal(t, 0.0, u.Position.Y)
}

// ---------------------------------------------------------------------------
// wander movement
// ---------------------------------------------------------------------------

func TestApplyNPCMovement_Wander_InitializesOnFirstTick(t *testing.T) {
	center := locPtr(10, 10)
	zone := npcZone("g1", pos(10, 10), instanceconfig.UnitMovement{
		Type:     "wander",
		Location: center,
		Radius:   5.0,
		Speed:    vrPtr(1.0),
		WaitTime: vrPtr(0),
	})
	u, s := npcState("g1", pos(10, 10))
	instance.ApplyUnitBehaviorsForTest(s, zone, dt)
	assert.Equal(t, "moving", u.Behavior.MovementPhase)
	// Target should be within 5 feet of center.
	dx := u.Behavior.TargetX - 10
	dy := u.Behavior.TargetY - 10
	assert.LessOrEqual(t, math.Sqrt(dx*dx+dy*dy), 5.0+1e-9)
}

func TestApplyNPCMovement_Wander_MovesTowardTarget(t *testing.T) {
	center := locPtr(0, 0)
	zone := npcZone("g1", pos(0, 0), instanceconfig.UnitMovement{
		Type:     "wander",
		Location: center,
		Radius:   5.0,
		Speed:    vrPtr(1.0),
		WaitTime: vrPtr(0),
	})
	u, s := npcState("g1", pos(0, 0))
	instance.ApplyUnitBehaviorsForTest(s, zone, dt) // init + first move
	// After one tick the unit should have moved away from origin.
	dist := math.Sqrt(u.Position.X*u.Position.X + u.Position.Y*u.Position.Y)
	assert.Greater(t, dist, 0.0)
}

func TestApplyNPCMovement_Wander_MissingLocation_DoesNotMove(t *testing.T) {
	zone := npcZone("g1", pos(0, 0), instanceconfig.UnitMovement{
		Type:   "wander",
		Radius: 5.0,
		Speed:  vrPtr(1.0),
	})
	u, s := npcState("g1", pos(0, 0))
	instance.ApplyUnitBehaviorsForTest(s, zone, dt)
	assert.Equal(t, "", u.Behavior.MovementPhase)
	assert.Equal(t, 0.0, u.Position.X)
	assert.Equal(t, 0.0, u.Position.Y)
}

// ---------------------------------------------------------------------------
// player units are skipped
// ---------------------------------------------------------------------------

func TestApplyNPCMovement_PlayerUnit_IsSkipped(t *testing.T) {
	zone := patrolZone("loop", step(0, 20, 1.0, 0), step(0, 40, 1.0, 0))
	u := &instancestate.UnitState{
		ZoneUnitIdentifier: "player:Aldric",
		MapIdentifier:      "map1",
		Position:           pos(0, 0),
	}
	s := &instancestate.InstanceState{
		Units: map[uuid.UUID]*instancestate.UnitState{uuid.New(): u},
	}
	instance.ApplyUnitBehaviorsForTest(s, zone, dt)
	assert.Equal(t, 0.0, u.Position.X)
	assert.Equal(t, 0.0, u.Position.Y)
}
