package instance_test

import (
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/delve-mmo/game-server/internal/command"
	"github.com/delve-mmo/game-server/internal/instance"
	"github.com/delve-mmo/game-server/internal/instanceconfig"
	"github.com/delve-mmo/game-server/internal/instancestate"
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

func TestNPCTargeting_NearestWaitsOutItsRetargetCooldown(t *testing.T) {
	u, s := npcState("g1", pos(0, 0))
	farID, _ := addPlayer(s, "map1", 15, 0)
	nearID, _ := addPlayer(s, "map1", 6, 0)
	manualEngage(u, farID)
	u.Behavior.LastRetargetAt = time.Now()

	instance.ApplyUnitBehaviorsForTest(s, targetingZone("nearest"), dt)
	assert.Equal(t, farID, *u.Target, "still cooling down")

	u.Behavior.LastRetargetAt = time.Now().Add(-7 * time.Second)
	instance.ApplyUnitBehaviorsForTest(s, targetingZone("nearest"), dt)
	assert.Equal(t, nearID, *u.Target)
}

func TestNPCTargeting_AggroTableKeepsItsTargetWithoutThreat(t *testing.T) {
	u, s := npcState("g1", pos(0, 0))
	farID, _ := addPlayer(s, "map1", 15, 0)
	addPlayer(s, "map1", 6, 0)
	manualEngage(u, farID)

	instance.ApplyUnitBehaviorsForTest(s, targetingZone("aggroTable"), dt)

	assert.Equal(t, farID, *u.Target)
}

func TestNPCTargeting_AggroTableSwitchesToWhoeverOutThreatsTheTarget(t *testing.T) {
	u, s := npcState("g1", pos(0, 0))
	tankID, _ := addPlayer(s, "map1", 6, 0)
	dpsID, _ := addPlayer(s, "map1", 15, 0)
	manualEngage(u, tankID)
	command.AddThreat(u, tankID, 100)
	command.AddThreat(u, dpsID, 111)

	instance.ApplyUnitBehaviorsForTest(s, targetingZone("aggroTable"), dt)

	assert.Equal(t, dpsID, *u.Target)
}

func TestNPCTargeting_AggroTableHoldsUntilThreatPassesTheMargin(t *testing.T) {
	u, s := npcState("g1", pos(0, 0))
	tankID, _ := addPlayer(s, "map1", 6, 0)
	dpsID, _ := addPlayer(s, "map1", 15, 0)
	manualEngage(u, tankID)
	command.AddThreat(u, tankID, 100)
	command.AddThreat(u, dpsID, 105)

	instance.ApplyUnitBehaviorsForTest(s, targetingZone("aggroTable"), dt)

	assert.Equal(t, tankID, *u.Target)
}

func TestNPCTargeting_AggroTablePicksTheNextHighestWhenTheTargetDies(t *testing.T) {
	u, s := npcState("g1", pos(0, 0))
	tankID, tank := addPlayer(s, "map1", 6, 0)
	nearID, _ := addPlayer(s, "map1", 7, 0)
	topID, _ := addPlayer(s, "map1", 15, 0)
	manualEngage(u, tankID)
	command.AddThreat(u, nearID, 10)
	command.AddThreat(u, topID, 50)
	tank.Status = instancestate.UnitStatusDead

	instance.ApplyUnitBehaviorsForTest(s, targetingZone("aggroTable"), dt)

	assert.Equal(t, topID, *u.Target)
}

func TestNPCTargeting_HealingBuildsThreatOnEngagedNPCs(t *testing.T) {
	u, s := npcState("g1", pos(0, 0))
	tankID, _ := addPlayer(s, "map1", 6, 0)
	healerID, healer := addPlayer(s, "map1", 15, 0)
	manualEngage(u, tankID)
	healer.HealingThreatPending = 40

	instance.ApplyUnitBehaviorsForTest(s, targetingZone("aggroTable"), dt)

	assert.Equal(t, 20.0, u.Behavior.Threat[healerID])
	assert.Zero(t, healer.HealingThreatPending)
}

func TestNPCTargeting_HealerAggroWaitsOutItsRetargetCooldown(t *testing.T) {
	u, s := npcState("g1", pos(0, 0))
	tankID, _ := addPlayer(s, "map1", 6, 0)
	healerID, healer := addPlayer(s, "map1", 15, 0)
	healer.RecentHealing = 50
	manualEngage(u, tankID)
	u.Behavior.LastRetargetAt = time.Now()

	instance.ApplyUnitBehaviorsForTest(s, targetingZone("healerAggro"), dt)
	assert.Equal(t, tankID, *u.Target, "still cooling down")

	u.Behavior.LastRetargetAt = time.Now().Add(-7 * time.Second)
	instance.ApplyUnitBehaviorsForTest(s, targetingZone("healerAggro"), dt)
	assert.Equal(t, healerID, *u.Target)
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
