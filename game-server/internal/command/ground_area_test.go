package command_test

import (
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/delve-mmo/game-server/internal/command"
	"github.com/delve-mmo/game-server/internal/instanceconfig"
	"github.com/delve-mmo/game-server/internal/instancestate"
)

func unitAt(x, y, angle float64) *instancestate.UnitState {
	return &instancestate.UnitState{
		MapIdentifier: "map1",
		Position:      instanceconfig.Position{X: x, Y: y, Angle: angle},
	}
}

func areaEffect(shape instanceconfig.AreaShape, rng *instanceconfig.ZeroBasedValueRange) instanceconfig.PowerEffect {
	a := instanceconfig.ValueRange{1, 1}
	return instanceconfig.PowerEffect{
		Type: "groundArea", Affects: "bAll", Shape: &shape, Range: rng, Duration: 5,
		OnTick: []instanceconfig.PowerEffect{{Type: "harm", Amount: &a}},
	}
}

func TestPlaceAreaShape_SelfCircleUsesCasterPosition(t *testing.T) {
	caster := unitAt(3, 4, 0)
	eff := areaEffect(instanceconfig.AreaShape{Type: "circle", At: "self", Radius: 8}, nil)

	sh, ok := command.PlaceAreaShape(caster, nil, eff)

	require.True(t, ok)
	assert.Equal(t, 3.0, sh.X)
	assert.Equal(t, 4.0, sh.Y)
	assert.Equal(t, 8.0, sh.Radius)
}

func TestPlaceAreaShape_TargetCircleUsesTargetPosition(t *testing.T) {
	caster, target := unitAt(0, 0, 0), unitAt(10, 5, 0)
	eff := areaEffect(instanceconfig.AreaShape{Type: "circle", At: "target", Radius: 8}, &instanceconfig.ZeroBasedValueRange{0, 30})

	sh, ok := command.PlaceAreaShape(caster, target, eff)

	require.True(t, ok)
	assert.Equal(t, 10.0, sh.X)
	assert.Equal(t, 5.0, sh.Y)
}

func TestPlaceAreaShape_TargetAnchorWithoutTargetFails(t *testing.T) {
	eff := areaEffect(instanceconfig.AreaShape{Type: "circle", At: "target", Radius: 8}, &instanceconfig.ZeroBasedValueRange{0, 30})

	_, ok := command.PlaceAreaShape(unitAt(0, 0, 0), nil, eff)

	assert.False(t, ok)
}

func TestPlaceAreaShape_LineAimsAtTarget(t *testing.T) {
	caster, target := unitAt(0, 0, 0), unitAt(10, 0, 0) // due +x is 90 degrees
	eff := areaEffect(instanceconfig.AreaShape{Type: "line", At: "self", Length: 20, Width: 4, Direction: "target"}, &instanceconfig.ZeroBasedValueRange{0, 30})

	sh, ok := command.PlaceAreaShape(caster, target, eff)

	require.True(t, ok)
	assert.InDelta(t, 90.0, sh.Angle, 1e-9)
}

func TestPlaceAreaShape_LineFacesCasterWithoutRange(t *testing.T) {
	eff := areaEffect(instanceconfig.AreaShape{Type: "line", At: "self", Length: 20, Width: 4}, nil)

	sh, ok := command.PlaceAreaShape(unitAt(0, 0, 45), nil, eff)

	require.True(t, ok)
	assert.Equal(t, 45.0, sh.Angle)
}

func TestCreateGroundArea_AddsAreaWithExpiryAndInterval(t *testing.T) {
	state := &instancestate.InstanceState{}
	caster := unitAt(0, 0, 0)
	eff := areaEffect(instanceconfig.AreaShape{Type: "circle", At: "self", Radius: 8}, nil)
	eff.TickInterval = 0.5
	now := time.Now()

	ok := command.CreateGroundArea(uuid.New(), caster, nil, true, instanceconfig.Power{Name: "Fire"}, 0, eff, now, state)

	require.True(t, ok)
	require.Len(t, state.GroundAreas, 1)
	a := state.GroundAreas[0]
	assert.Equal(t, 500*time.Millisecond, a.TickInterval)
	assert.Equal(t, now.Add(500*time.Millisecond), a.NextTickAt)
	assert.Equal(t, now.Add(5*time.Second), a.ExpiresAt)
}

func TestCreateGroundArea_ClampsTinyInterval(t *testing.T) {
	state := &instancestate.InstanceState{}
	eff := areaEffect(instanceconfig.AreaShape{Type: "circle", At: "self", Radius: 8}, nil)
	eff.TickInterval = 0.001

	command.CreateGroundArea(uuid.New(), unitAt(0, 0, 0), nil, true, instanceconfig.Power{Name: "Fire"}, 0, eff, time.Now(), state)

	assert.Equal(t, 100*time.Millisecond, state.GroundAreas[0].TickInterval)
}

func TestCreateGroundArea_RecastAtSameSpotRefreshes(t *testing.T) {
	state := &instancestate.InstanceState{}
	casterID, caster := uuid.New(), unitAt(0, 0, 0)
	eff := areaEffect(instanceconfig.AreaShape{Type: "circle", At: "self", Radius: 8}, nil)
	power := instanceconfig.Power{Name: "Fire"}
	now := time.Now()
	command.CreateGroundArea(casterID, caster, nil, true, power, 0, eff, now, state)
	id := state.GroundAreas[0].ID

	command.CreateGroundArea(casterID, caster, nil, true, power, 0, eff, now.Add(3*time.Second), state)

	require.Len(t, state.GroundAreas, 1)
	assert.Equal(t, id, state.GroundAreas[0].ID)
	assert.Equal(t, now.Add(8*time.Second), state.GroundAreas[0].ExpiresAt)
}

func TestCreateGroundArea_RecastElsewhereAddsAnother(t *testing.T) {
	state := &instancestate.InstanceState{}
	casterID, caster := uuid.New(), unitAt(0, 0, 0)
	eff := areaEffect(instanceconfig.AreaShape{Type: "circle", At: "self", Radius: 8}, nil)
	power := instanceconfig.Power{Name: "Fire"}
	command.CreateGroundArea(casterID, caster, nil, true, power, 0, eff, time.Now(), state)
	caster.Position.X = 20

	command.CreateGroundArea(casterID, caster, nil, true, power, 0, eff, time.Now(), state)

	assert.Len(t, state.GroundAreas, 2)
}

func TestCreateGroundArea_NeedsTargetFailsWithoutOne(t *testing.T) {
	state := &instancestate.InstanceState{}
	eff := areaEffect(instanceconfig.AreaShape{Type: "circle", At: "target", Radius: 8}, &instanceconfig.ZeroBasedValueRange{0, 30})

	ok := command.CreateGroundArea(uuid.New(), unitAt(0, 0, 0), nil, true, instanceconfig.Power{Name: "Fire"}, 0, eff, time.Now(), state)

	assert.False(t, ok)
	assert.Empty(t, state.GroundAreas)
}
