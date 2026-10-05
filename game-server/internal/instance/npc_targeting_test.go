package instance_test

import (
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/delve-mmo/game-server/internal/instance"
	"github.com/delve-mmo/game-server/internal/instanceconfig"
)

func targetingZone(targetingType string) instanceconfig.Zone {
	zone := behaviorZone(20, instanceconfig.UnitMovement{Type: "still"})
	ut := zone.UnitTypes["goblin"]
	ut.Targeting = instanceconfig.UnitTargeting{Type: targetingType}
	zone.UnitTypes["goblin"] = ut
	return zone
}

func TestNPCTargeting_NearestSwitchesToACloserPlayer(t *testing.T) {
	u, s := npcState("g1", pos(0, 0))
	farID, _ := addPlayer(s, "map1", 15, 0)
	nearID, _ := addPlayer(s, "map1", 6, 0)
	manualEngage(u, farID)

	instance.ApplyUnitBehaviorsForTest(s, targetingZone("nearest"), dt)

	require.NotNil(t, u.Target)
	assert.Equal(t, nearID, *u.Target)
}

func TestNPCTargeting_NearestIgnoresAnEquallyCloseOtherPlayer(t *testing.T) {
	u, s := npcState("g1", pos(0, 0))
	firstID, _ := addPlayer(s, "map1", 10, 0)
	addPlayer(s, "map1", 0, 10)
	manualEngage(u, firstID)

	instance.ApplyUnitBehaviorsForTest(s, targetingZone("nearest"), dt)

	assert.Equal(t, firstID, *u.Target)
}

func TestNPCTargeting_AggroTableKeepsItsTarget(t *testing.T) {
	u, s := npcState("g1", pos(0, 0))
	farID, _ := addPlayer(s, "map1", 15, 0)
	addPlayer(s, "map1", 6, 0)
	manualEngage(u, farID)

	instance.ApplyUnitBehaviorsForTest(s, targetingZone("aggroTable"), dt)

	assert.Equal(t, farID, *u.Target)
}

func TestNPCTargeting_HealerAggroSwitchesToTheHealer(t *testing.T) {
	u, s := npcState("g1", pos(0, 0))
	tankID, _ := addPlayer(s, "map1", 6, 0)
	healerID, healer := addPlayer(s, "map1", 15, 0)
	healer.RecentHealing = 50
	manualEngage(u, tankID)

	instance.ApplyUnitBehaviorsForTest(s, targetingZone("healerAggro"), dt)

	assert.Equal(t, healerID, *u.Target)
}

func TestNPCTargeting_HealerAggroKeepsTargetWhenNobodyHeals(t *testing.T) {
	u, s := npcState("g1", pos(0, 0))
	tankID, _ := addPlayer(s, "map1", 6, 0)
	addPlayer(s, "map1", 15, 0)
	manualEngage(u, tankID)

	instance.ApplyUnitBehaviorsForTest(s, targetingZone("healerAggro"), dt)

	assert.Equal(t, tankID, *u.Target)
}

func TestNPCTargeting_RecentHealingDecays(t *testing.T) {
	u, s := npcState("g1", pos(0, 0))
	pid, p := addPlayer(s, "map1", 6, 0)
	p.RecentHealing = 100
	manualEngage(u, pid)

	for i := 0; i < 100; i++ { // 10 simulated seconds
		instance.ApplyUnitBehaviorsForTest(s, targetingZone("aggroTable"), dt)
	}

	assert.InDelta(t, 50, p.RecentHealing, 1)
}
