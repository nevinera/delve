package instance_test

import (
	"testing"

	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/delve-mmo/game-server/internal/instance"
	"github.com/delve-mmo/game-server/internal/instanceconfig"
	"github.com/delve-mmo/game-server/internal/instancestate"
)

// deathZone is packZone with its single power ("Mend") renamed "Last Gasp"
// and named as the goblins' onDeath power.
func deathZone(effects ...instanceconfig.PowerEffect) instanceconfig.Zone {
	zone := packZone(effects...)
	ut := zone.UnitTypes["goblin"]
	ut.Powers[0].Name = "Last Gasp"
	ut.OnDeath = "Last Gasp"
	zone.UnitTypes["goblin"] = ut
	return zone
}

func harmEffect(affects string, rangeFt, amount float64) instanceconfig.PowerEffect {
	a := instanceconfig.ValueRange{amount, amount}
	r := instanceconfig.ZeroBasedValueRange{0, rangeFt}
	return instanceconfig.PowerEffect{Type: "harm", Affects: affects, Amount: &a, Range: &r, School: "magic"}
}

// kill marks u dead the way the combat code does, after prev was snapshotted.
func kill(u *instancestate.UnitState) {
	u.Health = 0
	u.Status = instancestate.UnitStatusDead
	u.Target = nil
}

// dieRepeatedly kills g1 (engaged on target) and fires its death effects
// several times, reviving it in between, so the per-hit avoidance roll can't
// make a harm assertion flaky. Returns the last tick's events.
func dieRepeatedly(state *instancestate.InstanceState, g1 *instancestate.UnitState, target uuid.UUID, zone instanceconfig.Zone) []instance.CombatEvent {
	var events []instance.CombatEvent
	for i := 0; i < 20; i++ {
		g1.Health = g1.MaxHealth
		manualEngage(g1, target)
		prev := state.Clone()
		kill(g1)
		events = instance.FireDeathEffectsForTest(state, prev, zone)
	}
	return events
}

func unitID(state *instancestate.InstanceState, u *instancestate.UnitState) uuid.UUID {
	for id, v := range state.Units {
		if v == u {
			return id
		}
	}
	return uuid.Nil
}

func TestOnDeath_BAllHitsPlayersAroundTheCorpse(t *testing.T) {
	zone := deathZone(harmEffect("bAll", 10, 1))
	state, g1, _, _, near := packState(t) // near is 4ft from g1
	_, far := addPlayer(state, "map1", 40, 0)

	events := dieRepeatedly(state, g1, unitID(state, near), zone)

	assert.Less(t, near.Health, 100.0, "the nearby player is hit")
	assert.Equal(t, 100.0, far.Health, "a player out of range isn't")
	require.Len(t, events, 1)
	assert.Equal(t, "Last Gasp", events[0].PowerName)
	assert.Equal(t, unitID(state, g1).String(), events[0].AttackerID)
}

func TestOnDeath_BTargetHitsWhoeverItWasFighting(t *testing.T) {
	zone := deathZone(harmEffect("bTarget", 10, 1))
	state, g1, _, _, player := packState(t)
	_, bystander := addPlayer(state, "map1", 0, -4)

	events := dieRepeatedly(state, g1, unitID(state, player), zone)

	assert.Less(t, player.Health, 100.0)
	assert.Equal(t, 100.0, bystander.Health, "only its target is hit")
	require.Len(t, events, 1)
	assert.Equal(t, unitID(state, player).String(), events[0].TargetID)
}

func TestOnDeath_GAllHealsLivingPackmatesNotTheCorpse(t *testing.T) {
	zone := deathZone(healEffect("gAll", 20))
	state, g1, g2, g3, _ := packState(t)
	g2.Health, g3.Health = 2, 3
	prev := state.Clone()
	kill(g1)

	instance.FireDeathEffectsForTest(state, prev, zone)

	assert.Equal(t, 0.0, g1.Health, "the dead caster stays dead")
	assert.GreaterOrEqual(t, g2.Health, 7.0)
	assert.GreaterOrEqual(t, g3.Health, 8.0)
}

func TestOnDeath_FiresOnlyOnTheTickTheUnitDies(t *testing.T) {
	zone := deathZone(harmEffect("bAll", 10, 20))
	state, g1, _, _, player := packState(t)
	kill(g1)
	prev := state.Clone() // already dead last tick

	events := instance.FireDeathEffectsForTest(state, prev, zone)

	assert.Empty(t, events)
	assert.Equal(t, 100.0, player.Health)
}

func TestOnDeath_UnitWithoutOnDeathDoesNothing(t *testing.T) {
	zone := packZone(harmEffect("bAll", 10, 20))
	state, g1, _, _, player := packState(t)
	prev := state.Clone()
	kill(g1)

	assert.Empty(t, instance.FireDeathEffectsForTest(state, prev, zone))
	assert.Equal(t, 100.0, player.Health)
}

func TestOnDeath_TacticsNeverUseTheDeathPowerWhileAlive(t *testing.T) {
	zone := deathZone(harmEffect("bTarget", 10, 20))
	state, g1, _, _, player := packState(t)

	instance.ApplyUnitBehaviorsForTest(state, zone, dt)

	assert.NotContains(t, g1.PowerCooldowns, "Last Gasp")
	assert.Equal(t, 100.0, player.Health)
}
