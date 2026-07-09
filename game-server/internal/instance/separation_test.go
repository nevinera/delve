package instance_test

import (
	"testing"

	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"

	"github.com/delve-mmo/game-server/internal/instance"
	"github.com/delve-mmo/game-server/internal/instancestate"
)

func separationState(units ...*instancestate.UnitState) *instancestate.InstanceState {
	s := &instancestate.InstanceState{Units: make(map[uuid.UUID]*instancestate.UnitState)}
	for _, u := range units {
		s.Units[uuid.New()] = u
	}
	return s
}

func npc(x, y float64) *instancestate.UnitState {
	return &instancestate.UnitState{
		ZoneUnitIdentifier: "goblin_" + uuid.New().String(),
		MapIdentifier:      "map1",
		Position:           pos(x, y),
		Status:             instancestate.UnitStatusIdle,
	}
}

func TestNPCSeparation_PushesOverlappingUnitsApart(t *testing.T) {
	a := npc(0, 0)
	b := npc(1, 0) // 1ft apart, well inside separationRadius
	s := separationState(a, b)

	instance.ApplyNPCSeparationForTest(s, dt)

	// a should move west (negative X), b should move east (positive X).
	assert.Less(t, a.Position.X, 0.0)
	assert.Greater(t, b.Position.X, 1.0)
}

func TestNPCSeparation_NoEffectBeyondRadius(t *testing.T) {
	a := npc(0, 0)
	b := npc(10, 0) // 10ft apart, beyond separationRadius of 5ft
	s := separationState(a, b)

	instance.ApplyNPCSeparationForTest(s, dt)

	assert.InDelta(t, 0.0, a.Position.X, 1e-9)
	assert.InDelta(t, 10.0, b.Position.X, 1e-9)
}

func TestNPCSeparation_SymmetricForce(t *testing.T) {
	// Two identical units equidistant from origin should push symmetrically.
	a := npc(-1, 0)
	b := npc(1, 0)
	s := separationState(a, b)

	instance.ApplyNPCSeparationForTest(s, dt)

	assert.InDelta(t, -a.Position.X, b.Position.X, 1e-9)
}

func TestNPCSeparation_PlayersNotPushed(t *testing.T) {
	player := &instancestate.UnitState{
		ZoneUnitIdentifier: "player:Aldric",
		MapIdentifier:      "map1",
		Position:           pos(0, 0),
		Status:             instancestate.UnitStatusIdle,
	}
	g := npc(1, 0)
	s := separationState(player, g)

	instance.ApplyNPCSeparationForTest(s, dt)

	// Player should not be moved by separation.
	assert.InDelta(t, 0.0, player.Position.X, 1e-9)
}

func TestNPCSeparation_DeadUnitsSkipped(t *testing.T) {
	a := npc(0, 0)
	a.Status = instancestate.UnitStatusDead
	b := npc(1, 0)
	s := separationState(a, b)

	instance.ApplyNPCSeparationForTest(s, dt)

	// Dead unit should not be pushed, and b should not be pushed away from a dead unit.
	assert.InDelta(t, 0.0, a.Position.X, 1e-9)
	assert.InDelta(t, 1.0, b.Position.X, 1e-9)
}

func TestNPCSeparation_StrongerWhenCloser(t *testing.T) {
	// Unit at 0.5ft should push harder than unit at 1.5ft (both inside 2ft radius).
	a1 := npc(0, 0)
	b1 := npc(0.5, 0)
	s1 := separationState(a1, b1)
	instance.ApplyNPCSeparationForTest(s1, dt)
	push1 := b1.Position.X - 0.5

	a2 := npc(0, 0)
	b2 := npc(1.5, 0)
	s2 := separationState(a2, b2)
	instance.ApplyNPCSeparationForTest(s2, dt)
	push2 := b2.Position.X - 1.5

	assert.Greater(t, push1, push2)
}
