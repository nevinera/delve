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

// packZone is a pack of three goblins (g1 the caster, g2, g3) whose type
// has a single power made of the given effects.
func packZone(effects ...instanceconfig.PowerEffect) instanceconfig.Zone {
	units := []instanceconfig.Unit{}
	for i, id := range []string{"g1", "g2", "g3"} {
		units = append(units, instanceconfig.Unit{
			Identifier: id, UnitType: "goblin", Position: pos(float64(i)*3, 0),
			Hostility: "hostile", GroupIdentifier: "pack",
		})
	}
	return instanceconfig.Zone{
		UnitTypes: map[string]instanceconfig.UnitType{
			"goblin": {
				Name: "Goblin", SpeedFactor: 1.0, MaxHP: 10, TokenRadius: 2.0, AggroRadius: 0.5,
				Powers: []instanceconfig.Power{{Name: "Mend", GlobalCooldown: 1.5, Cooldown: 100, Effects: effects}},
			},
		},
		Maps: []instanceconfig.Map{{Identifier: "map1", Units: units}},
	}
}

func packState(t *testing.T) (state *instancestate.InstanceState, g1, g2, g3, player *instancestate.UnitState) {
	g1, state = npcState("g1", pos(0, 0))
	g1.Radius = 2.0
	mk := func(id string, x float64) *instancestate.UnitState {
		u := &instancestate.UnitState{
			ZoneUnitIdentifier: id, UnitTypeIdentifier: "goblin", MapIdentifier: "map1",
			Position: pos(x, 0), Status: instancestate.UnitStatusIdle,
			Health: 10, MaxHealth: 10, Radius: 2.0,
		}
		state.Units[uuid.New()] = u
		return u
	}
	g2, g3 = mk("g2", 3), mk("g3", 6)
	playerID, player := addPlayer(state, "map1", 0, 4)
	manualEngage(g1, playerID)
	return
}

func healEffect(affects string, rangeFt float64) instanceconfig.PowerEffect {
	amount := instanceconfig.ValueRange{5, 5}
	r := instanceconfig.ZeroBasedValueRange{0, rangeFt}
	return instanceconfig.PowerEffect{Type: "heal", Affects: affects, Amount: &amount, Range: &r}
}

func TestNPCAllies_SelfHealHealsTheCaster(t *testing.T) {
	zone := packZone(healEffect("self", 0))
	state, g1, _, _, _ := packState(t)
	g1.Health = 2

	instance.ApplyUnitBehaviorsForTest(state, zone, dt)

	assert.GreaterOrEqual(t, g1.Health, 7.0) // a crit can heal more
}

func TestNPCAllies_GTargetHealPicksMostWoundedPackmateInRange(t *testing.T) {
	zone := packZone(healEffect("gTarget", 20))
	state, g1, g2, g3, player := packState(t)
	g1.Health, g2.Health, g3.Health = 6, 8, 3

	instance.ApplyUnitBehaviorsForTest(state, zone, dt)

	assert.Equal(t, 6.0, g1.Health)
	assert.Equal(t, 8.0, g2.Health)
	assert.GreaterOrEqual(t, g3.Health, 8.0)
	assert.Equal(t, 100.0, player.Health)
}

func TestNPCAllies_GTargetHealSkipsPackmatesOutOfRange(t *testing.T) {
	zone := packZone(healEffect("gTarget", 0))
	state, g1, g2, g3, _ := packState(t)
	g1.Health, g2.Health, g3.Health = 10, 9, 1

	instance.ApplyUnitBehaviorsForTest(state, zone, dt)

	assert.Equal(t, 10.0, g2.Health, "g2 healed to its max")
	assert.Equal(t, 1.0, g3.Health, "g3 is out of range")
}

func TestNPCAllies_GAllHealHealsEveryWoundedPackmateInRange(t *testing.T) {
	zone := packZone(healEffect("gAll", 20))
	state, g1, g2, g3, _ := packState(t)
	g1.Health, g2.Health, g3.Health = 1, 2, 10

	instance.ApplyUnitBehaviorsForTest(state, zone, dt)

	assert.GreaterOrEqual(t, g1.Health, 6.0)
	assert.GreaterOrEqual(t, g2.Health, 7.0)
	assert.Equal(t, 10.0, g3.Health)
}

func TestNPCAllies_HealDoesNotFireWhenEveryoneIsUnhurt(t *testing.T) {
	zone := packZone(healEffect("gAll", 20))
	state, g1, _, _, _ := packState(t)

	instance.ApplyUnitBehaviorsForTest(state, zone, dt)

	assert.NotContains(t, g1.PowerCooldowns, "Mend")
}

func TestNPCAllies_GAllStatusBuffsPackmatesNotTheHostileTarget(t *testing.T) {
	r := instanceconfig.ZeroBasedValueRange{0, 20}
	rally := instanceconfig.PowerEffect{
		Type: "status", Affects: "gAll", Range: &r, Duration: 10,
		Status: &instanceconfig.Status{Name: "Rally", ShortName: "Rally", TreatAs: "buff", Stacking: "extend"},
	}
	zone := packZone(rally)
	state, g1, g2, g3, player := packState(t)

	instance.ApplyUnitBehaviorsForTest(state, zone, dt)

	assert.Len(t, g1.ActiveStatusEffects, 1)
	assert.Len(t, g2.ActiveStatusEffects, 1)
	assert.Len(t, g3.ActiveStatusEffects, 1)
	assert.Empty(t, player.ActiveStatusEffects)
}

func bombZone(affects string) instanceconfig.Zone {
	zone := packZone()
	amount := instanceconfig.ValueRange{3, 3}
	r := instanceconfig.ZeroBasedValueRange{0, 10}
	ut := zone.UnitTypes["goblin"]
	ut.Powers = []instanceconfig.Power{{Name: "Bomb", GlobalCooldown: 1.5, Cooldown: 100, Effects: []instanceconfig.PowerEffect{
		{Type: "harm", Affects: affects, Amount: &amount, Range: &r},
	}}}
	zone.UnitTypes["goblin"] = ut
	return zone
}

// fireBombs ticks g1 repeatedly, clearing its cooldowns each time, so the
// per-hit avoidance roll can't make an assertion flaky.
func fireBombs(state *instancestate.InstanceState, g1 *instancestate.UnitState, zone instanceconfig.Zone) {
	for i := 0; i < 60; i++ {
		g1.GlobalCooldownEndsAt = time.Time{}
		g1.PowerCooldowns = nil
		instance.ApplyUnitBehaviorsForTest(state, zone, dt)
	}
}

func TestNPCHostile_BAllHitsEveryPlayerInRange(t *testing.T) {
	state, g1, _, _, near := packState(t)
	_, second := addPlayer(state, "map1", 4, 0)
	_, far := addPlayer(state, "map1", 60, 0)

	fireBombs(state, g1, bombZone("bAll"))

	assert.Less(t, near.Health, 100.0)
	assert.Less(t, second.Health, 100.0)
	assert.Equal(t, 100.0, far.Health)
}

func TestNPCHostile_BTargetStillHitsOnlyTheTarget(t *testing.T) {
	state, g1, _, _, near := packState(t)
	_, second := addPlayer(state, "map1", 4, 0)

	fireBombs(state, g1, bombZone("bTarget"))

	assert.Less(t, near.Health, 100.0)
	assert.Equal(t, 100.0, second.Health)
}

func splashBombZone(radius float64) instanceconfig.Zone {
	zone := bombZone("bTarget")
	ut := zone.UnitTypes["goblin"]
	ut.Powers[0].Effects[0].Radius = radius
	zone.UnitTypes["goblin"] = ut
	return zone
}

func TestNPCHostile_BTargetRadiusSplashesPlayersAroundTheTarget(t *testing.T) {
	state, g1, _, _, target := packState(t)     // target 4ft from g1
	_, beside := addPlayer(state, "map1", 0, 9) // 5ft past the target
	_, far := addPlayer(state, "map1", 0, 18)   // 14ft past it

	fireBombs(state, g1, splashBombZone(6))

	assert.Less(t, target.Health, 100.0)
	assert.Less(t, beside.Health, 100.0, "within the radius of the target")
	assert.Equal(t, 100.0, far.Health)
}

func TestNPCAllies_GTargetRadiusHealsPackmatesAroundTheMostWounded(t *testing.T) {
	heal := healEffect("gTarget", 20)
	heal.Radius = 2
	zone := packZone(heal)
	state, g1, g2, g3, _ := packState(t) // g1 at 0, g2 at 3, g3 at 6
	g1.Health, g2.Health, g3.Health = 5, 6, 1

	instance.ApplyUnitBehaviorsForTest(state, zone, dt)

	assert.GreaterOrEqual(t, g3.Health, 6.0, "the most wounded is healed")
	assert.GreaterOrEqual(t, g2.Health, 10.0, "so is the packmate 3ft from it")
	assert.Equal(t, 5.0, g1.Health, "the one 6ft away isn't")
}
