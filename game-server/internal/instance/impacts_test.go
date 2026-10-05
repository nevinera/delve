package instance_test

import (
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/delve-mmo/game-server/internal/instance"
	"github.com/delve-mmo/game-server/internal/instanceconfig"
	"github.com/delve-mmo/game-server/internal/instancestate"
)

// boltZone is bombZone("bTarget") with a projectile speed of 10 ft/s.
func boltZone() instanceconfig.Zone {
	zone := bombZone("bTarget")
	ut := zone.UnitTypes["goblin"]
	ut.Powers[0].Speed = 10
	zone.UnitTypes["goblin"] = ut
	return zone
}

func TestImpacts_NPCProjectileLandsWhenItArrivesNotAtCast(t *testing.T) {
	zone := boltZone()
	state, g1, _, _, player := packState(t) // player 4ft from g1: a 0.4s flight

	instance.ApplyUnitBehaviorsForTest(state, zone, dt)

	require.Len(t, state.PendingImpacts, 1, "the bolt is in flight")
	assert.Equal(t, 100.0, player.Health, "nothing lands at cast")
	assert.Contains(t, g1.PowerCooldowns, "Bomb", "the cast itself happened")

	instance.ResolveImpactsForTest(state, zone, time.Now())
	assert.Len(t, state.PendingImpacts, 1, "not there yet")

	instance.ResolveImpactsForTest(state, zone, time.Now().Add(time.Second))
	assert.Empty(t, state.PendingImpacts, "landed")
}

func TestImpacts_NPCProjectileDealsDamageOnArrival(t *testing.T) {
	zone := boltZone()
	state, g1, _, _, player := packState(t)
	for i := 0; i < 20 && player.Health == 100.0; i++ {
		g1.GlobalCooldownEndsAt = time.Time{}
		g1.PowerCooldowns = nil
		instance.ApplyUnitBehaviorsForTest(state, zone, dt)
		instance.ResolveImpactsForTest(state, zone, time.Now().Add(time.Second))
	}
	assert.Less(t, player.Health, 100.0)
}

func TestImpacts_FizzlesIfTheTargetDiedInFlight(t *testing.T) {
	zone := boltZone()
	state, _, _, _, player := packState(t)
	instance.ApplyUnitBehaviorsForTest(state, zone, dt)
	require.Len(t, state.PendingImpacts, 1)
	player.Status = instancestate.UnitStatusDead
	player.Health = 0

	instance.ResolveImpactsForTest(state, zone, time.Now().Add(time.Second))

	assert.Empty(t, state.PendingImpacts)
	assert.Equal(t, 0.0, player.Health)
}
