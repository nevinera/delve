package instance_test

import (
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/delve-mmo/game-server/internal/areashape"
	"github.com/delve-mmo/game-server/internal/instance"
	"github.com/delve-mmo/game-server/internal/instanceconfig"
	"github.com/delve-mmo/game-server/internal/instancestate"
)

func areaTickEffect() instanceconfig.PowerEffect {
	a := instanceconfig.ValueRange{5, 5}
	return instanceconfig.PowerEffect{Type: "harm", Amount: &a, School: "magic"}
}

// areaFixture is a goblin caster at the origin and a player 4ft away, with a
// circle area (radius 10) from the goblin that ticks once a second for 3s.
func areaFixture(affects string) (*instancestate.InstanceState, instanceconfig.Zone, *instancestate.UnitState, *instancestate.UnitState, time.Time) {
	zone := packZone()
	caster, state := npcState("g1", pos(0, 0))
	casterID := uuid.Nil
	for id, u := range state.Units {
		if u == caster {
			casterID = id
		}
	}
	_, player := addPlayer(state, "map1", 4, 0)
	now := time.Now()
	state.GroundAreas = []instancestate.GroundArea{{
		ID: uuid.New(), CasterID: casterID, MapIdentifier: "map1",
		Shape:   areashape.Shape{Kind: areashape.Circle, Radius: 10},
		Affects: affects, OnTick: []instanceconfig.PowerEffect{areaTickEffect()},
		TimeBudget: 1, TickInterval: time.Second,
		NextTickAt: now.Add(time.Second), ExpiresAt: now.Add(3 * time.Second),
	}}
	return state, zone, caster, player, now
}

func TestGroundArea_NotDueDoesNothing(t *testing.T) {
	state, zone, _, player, now := areaFixture("bAll")

	instance.TickGroundAreasForTest(state, zone, now.Add(500*time.Millisecond))

	assert.Equal(t, 100.0, player.Health)
	assert.Len(t, state.GroundAreas, 1)
}

func TestGroundArea_DueHarmsPlayerInside(t *testing.T) {
	state, zone, _, player, now := areaFixture("bAll")

	for i := 0; i < 20 && player.Health == 100; i++ {
		state.GroundAreas[0].NextTickAt = now
		instance.TickGroundAreasForTest(state, zone, now.Add(time.Second))
	}

	assert.Less(t, player.Health, 100.0)
}

func TestGroundArea_AdvancesNextTickByInterval(t *testing.T) {
	state, zone, _, _, _ := areaFixture("bAll")
	due := state.GroundAreas[0].NextTickAt

	instance.TickGroundAreasForTest(state, zone, due)

	assert.Equal(t, due.Add(time.Second), state.GroundAreas[0].NextTickAt)
}

func TestGroundArea_OutsideShapeUnharmed(t *testing.T) {
	state, zone, _, player, now := areaFixture("bAll")
	player.Position = pos(30, 0)

	for i := 0; i < 20; i++ {
		state.GroundAreas[0].NextTickAt = now
		instance.TickGroundAreasForTest(state, zone, now.Add(time.Second))
	}

	assert.Equal(t, 100.0, player.Health)
}

func TestGroundArea_GAllDoesNotHarmHostiles(t *testing.T) {
	state, zone, _, player, now := areaFixture("gAll")

	for i := 0; i < 20; i++ {
		state.GroundAreas[0].NextTickAt = now
		instance.TickGroundAreasForTest(state, zone, now.Add(time.Second))
	}

	assert.Equal(t, 100.0, player.Health)
}

func TestGroundArea_ExpiredIsRemoved(t *testing.T) {
	state, zone, _, _, now := areaFixture("bAll")

	instance.TickGroundAreasForTest(state, zone, now.Add(4*time.Second))

	assert.Empty(t, state.GroundAreas)
}

func TestGroundArea_RemovedWhenCasterGone(t *testing.T) {
	state, zone, _, _, now := areaFixture("bAll")
	delete(state.Units, state.GroundAreas[0].CasterID)

	instance.TickGroundAreasForTest(state, zone, now.Add(time.Second))

	require.Empty(t, state.GroundAreas)
}

func TestShapedEffect_NPCHarmsPlayersInShapeOnly(t *testing.T) {
	state, zone, caster, near, now := areaFixture("bAll")
	state.GroundAreas = nil
	_, far := addPlayer(state, "map1", 30, 0)
	far.Position = pos(30, 0)
	casterID := uuid.Nil
	for id, u := range state.Units {
		if u == caster {
			casterID = id
		}
	}
	eff := areaTickEffect()
	eff.Affects = "bAll"
	eff.Shape = &instanceconfig.AreaShape{Type: "circle", At: "self", Radius: 10}

	for i := 0; i < 20 && near.Health == 100; i++ {
		instance.ApplyNPCShapedEffectForTest(casterID, caster, nil, eff, zone, now, state)
	}

	assert.Less(t, near.Health, 100.0)
	assert.Equal(t, 100.0, far.Health)
}
