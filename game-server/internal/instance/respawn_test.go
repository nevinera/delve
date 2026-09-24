package instance_test

import (
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"

	"github.com/delve-mmo/game-server/internal/instance"
	"github.com/delve-mmo/game-server/internal/instanceconfig"
	"github.com/delve-mmo/game-server/internal/instancestate"
)

func deadUnit(respawn instanceconfig.RespawnConfig) *instancestate.UnitState {
	return &instancestate.UnitState{
		Status:             instancestate.UnitStatusDead,
		Respawn:            respawn,
		Health:             0,
		MaxHealth:          100,
		Position:           instanceconfig.Position{X: 5, Y: 5, Angle: 0},
		SpawnPoint:         instanceconfig.Position{X: 10, Y: 20, Angle: 90},
		MapIdentifier:      "battlefield",
		SpawnMapIdentifier: "home",
	}
}

func TestScheduleRespawns_SchedulesADeadUnitWithATimer(t *testing.T) {
	now := time.Now()
	unit := deadUnit(instanceconfig.RespawnConfig{Type: "timer", DelaySeconds: 120})
	state := &instancestate.InstanceState{Units: map[uuid.UUID]*instancestate.UnitState{uuid.New(): unit}}

	instance.ScheduleRespawnsForTest(state, now)

	assert.WithinDuration(t, now.Add(120*time.Second), unit.RespawnAt, time.Millisecond)
}

func TestScheduleRespawns_DoesNotScheduleWhenRespawnIsNone(t *testing.T) {
	now := time.Now()
	unit := deadUnit(instanceconfig.RespawnConfig{Type: "none"})
	state := &instancestate.InstanceState{Units: map[uuid.UUID]*instancestate.UnitState{uuid.New(): unit}}

	instance.ScheduleRespawnsForTest(state, now)

	assert.True(t, unit.RespawnAt.IsZero())
}

func TestScheduleRespawns_DoesNotScheduleWhenRespawnIsUnset(t *testing.T) {
	now := time.Now()
	unit := deadUnit(instanceconfig.RespawnConfig{})
	state := &instancestate.InstanceState{Units: map[uuid.UUID]*instancestate.UnitState{uuid.New(): unit}}

	instance.ScheduleRespawnsForTest(state, now)

	assert.True(t, unit.RespawnAt.IsZero())
}

func TestScheduleRespawns_DoesNotRescheduleAnAlreadyScheduledUnit(t *testing.T) {
	now := time.Now()
	unit := deadUnit(instanceconfig.RespawnConfig{Type: "timer", DelaySeconds: 120})
	firstSchedule := now.Add(10 * time.Second)
	unit.RespawnAt = firstSchedule
	state := &instancestate.InstanceState{Units: map[uuid.UUID]*instancestate.UnitState{uuid.New(): unit}}

	instance.ScheduleRespawnsForTest(state, now)

	assert.Equal(t, firstSchedule, unit.RespawnAt, "already scheduled - shouldn't be recomputed from now")
}

func TestScheduleRespawns_IgnoresNonDeadUnits(t *testing.T) {
	now := time.Now()
	unit := deadUnit(instanceconfig.RespawnConfig{Type: "timer", DelaySeconds: 120})
	unit.Status = instancestate.UnitStatusIdle
	state := &instancestate.InstanceState{Units: map[uuid.UUID]*instancestate.UnitState{uuid.New(): unit}}

	instance.ScheduleRespawnsForTest(state, now)

	assert.True(t, unit.RespawnAt.IsZero())
}

func TestTickRespawns_DeadUnitNotYetDueStaysDead(t *testing.T) {
	now := time.Now()
	unit := deadUnit(instanceconfig.RespawnConfig{Type: "timer", DelaySeconds: 120})
	unit.RespawnAt = now.Add(10 * time.Second)
	state := &instancestate.InstanceState{Units: map[uuid.UUID]*instancestate.UnitState{uuid.New(): unit}}

	instance.TickRespawnsForTest(state, now)

	assert.Equal(t, instancestate.UnitStatusDead, unit.Status)
}

func TestTickRespawns_DueDeadUnitTeleportsAndStartsRespawning(t *testing.T) {
	now := time.Now()
	unit := deadUnit(instanceconfig.RespawnConfig{Type: "timer", DelaySeconds: 120})
	unit.RespawnAt = now.Add(-time.Second) // already due
	tagger := uuid.New()
	unit.TaggedBy = &tagger
	unit.LootItems = []instancestate.PendingLootItem{{}}
	unit.ActiveStatusEffects = []instancestate.ActiveStatusEffect{{}}
	state := &instancestate.InstanceState{Units: map[uuid.UUID]*instancestate.UnitState{uuid.New(): unit}}

	instance.TickRespawnsForTest(state, now)

	assert.Equal(t, instancestate.UnitStatusRespawning, unit.Status)
	assert.Equal(t, unit.SpawnPoint, unit.Position)
	assert.Equal(t, unit.SpawnMapIdentifier, unit.MapIdentifier)
	assert.True(t, unit.RespawnAt.IsZero(), "consumed")
	assert.Nil(t, unit.TaggedBy)
	assert.Nil(t, unit.LootItems)
	assert.Nil(t, unit.ActiveStatusEffects)
	window := unit.RespawningUntil.Sub(now)
	assert.GreaterOrEqual(t, window.Seconds(), 2.0)
	assert.LessOrEqual(t, window.Seconds(), 5.0)
}

func TestTickRespawns_RespawningUnitNotYetDoneStaysRespawning(t *testing.T) {
	now := time.Now()
	unit := deadUnit(instanceconfig.RespawnConfig{Type: "timer", DelaySeconds: 120})
	unit.Status = instancestate.UnitStatusRespawning
	unit.RespawningUntil = now.Add(time.Second)
	state := &instancestate.InstanceState{Units: map[uuid.UUID]*instancestate.UnitState{uuid.New(): unit}}

	instance.TickRespawnsForTest(state, now)

	assert.Equal(t, instancestate.UnitStatusRespawning, unit.Status)
}

func TestTickRespawns_RespawningUnitBecomesIdleWithFullHealthOnceDone(t *testing.T) {
	now := time.Now()
	targetID := uuid.New()
	unit := deadUnit(instanceconfig.RespawnConfig{Type: "timer", DelaySeconds: 120})
	unit.Status = instancestate.UnitStatusRespawning
	unit.RespawningUntil = now.Add(-time.Millisecond) // already due
	unit.Health = 0
	unit.Target = &targetID
	unit.Attacking = true
	unit.Behavior = instancestate.BehaviorState{MovementPhase: "moving"}
	state := &instancestate.InstanceState{Units: map[uuid.UUID]*instancestate.UnitState{uuid.New(): unit}}

	instance.TickRespawnsForTest(state, now)

	assert.Equal(t, instancestate.UnitStatusIdle, unit.Status)
	assert.Equal(t, unit.MaxHealth, unit.Health)
	assert.Nil(t, unit.Target)
	assert.False(t, unit.Attacking)
	assert.Equal(t, instancestate.BehaviorState{}, unit.Behavior)
	assert.True(t, unit.RespawningUntil.IsZero())
}

func TestUnitStatus_IsTargetable(t *testing.T) {
	assert.True(t, instancestate.UnitStatusIdle.IsTargetable())
	assert.True(t, instancestate.UnitStatusEngaged.IsTargetable())
	assert.True(t, instancestate.UnitStatusLeashing.IsTargetable())
	assert.False(t, instancestate.UnitStatusDead.IsTargetable())
	assert.False(t, instancestate.UnitStatusRespawning.IsTargetable())
}
