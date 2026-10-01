package instance_test

import (
	"math"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/delve-mmo/game-server/internal/instance"
	"github.com/delve-mmo/game-server/internal/instanceconfig"
	"github.com/delve-mmo/game-server/internal/instancestate"
	"github.com/delve-mmo/game-server/internal/pathing"
)

func float(v float64) *float64 { return &v }
func boolean(v bool) *bool     { return &v }

// leashZone is one map ("map1") holding a pack of two goblins, g1 and g2,
// with optional leash settings on the map and on g1.
func leashZone(mapRadius *float64, mapHard *bool, unitRadius *float64) instanceconfig.Zone {
	unit := func(id string, unitRadius *float64) instanceconfig.Unit {
		return instanceconfig.Unit{
			Identifier: id, UnitType: "goblin", Position: pos(0, 0), Hostility: "hostile",
			Movement: instanceconfig.UnitMovement{Type: "still"}, GroupIdentifier: "pack", LeashRadius: unitRadius,
		}
	}
	return instanceconfig.Zone{
		UnitTypes: map[string]instanceconfig.UnitType{
			"goblin": {Name: "Goblin", SpeedFactor: 1.0, MaxHP: 10},
		},
		Maps: []instanceconfig.Map{{
			Identifier: "map1", LeashRadius: mapRadius, HardLeash: mapHard,
			FeetDimensions: instanceconfig.Dimensions{Width: 2000, Height: 2000},
			Units:          []instanceconfig.Unit{unit("g1", unitRadius), unit("g2", nil)},
		}},
	}
}

// engagedAt puts an NPC, pulled from (0,0), at (x, 0) chasing a player
// standing right next to it, with its last combat quietFor ago.
func engagedAt(t *testing.T, x float64, quietFor time.Duration) (*instancestate.UnitState, *instancestate.InstanceState) {
	t.Helper()
	u, s := npcState("g1", pos(0, 0))
	playerID, _ := addPlayer(s, "map1", x+1, 0)
	manualEngage(u, playerID)
	u.Position = pos(x, 0)
	u.Behavior.LastCombatAt = time.Now().Add(-quietFor)
	return u, s
}

func TestLeash_InsideRadius_KeepsFightingUntilQuietTooLong(t *testing.T) {
	zone := leashZone(nil, nil, nil)
	u, s := engagedAt(t, 50, 5*time.Second)
	instance.ApplyUnitBehaviorsForTest(s, zone, dt)
	assert.Equal(t, instancestate.UnitStatusEngaged, u.Status)

	u, s = engagedAt(t, 50, 11*time.Second)
	instance.ApplyUnitBehaviorsForTest(s, zone, dt)
	assert.Equal(t, instancestate.UnitStatusLeashing, u.Status)
}

func TestLeash_BeyondRadius_KeepsChasingWhileTheFightGoesOn(t *testing.T) {
	zone := leashZone(nil, nil, nil)
	u, s := engagedAt(t, instanceconfig.DefaultLeashRadius+30, time.Second)
	instance.ApplyUnitBehaviorsForTest(s, zone, dt)
	assert.Equal(t, instancestate.UnitStatusEngaged, u.Status)
}

func TestLeash_BeyondRadius_LeashesOnceQuietForSixSeconds(t *testing.T) {
	zone := leashZone(nil, nil, nil)
	u, s := engagedAt(t, instanceconfig.DefaultLeashRadius+30, 7*time.Second)
	instance.ApplyUnitBehaviorsForTest(s, zone, dt)
	assert.Equal(t, instancestate.UnitStatusLeashing, u.Status)
}

func TestLeash_BeyondThreeTimesTheRadius_LeashesMidFight(t *testing.T) {
	zone := leashZone(nil, nil, nil)
	u, s := engagedAt(t, instanceconfig.DefaultLeashRadius*3+10, 0)
	instance.ApplyUnitBehaviorsForTest(s, zone, dt)
	assert.Equal(t, instancestate.UnitStatusLeashing, u.Status)
}

func TestLeash_HardLeash_LeashesTheMomentItLeavesTheRadius(t *testing.T) {
	zone := leashZone(float(60), boolean(true), nil)
	u, s := engagedAt(t, 65, 0)
	instance.ApplyUnitBehaviorsForTest(s, zone, dt)
	assert.Equal(t, instancestate.UnitStatusLeashing, u.Status)
}

func TestLeash_UnitRadiusOverridesTheMap(t *testing.T) {
	zone := leashZone(float(300), boolean(true), float(40))
	u, s := engagedAt(t, 45, 0)
	instance.ApplyUnitBehaviorsForTest(s, zone, dt)
	assert.Equal(t, instancestate.UnitStatusLeashing, u.Status, "g1's own 40ft radius, hard via the map")
}

func TestLeash_ResetsTheUnit(t *testing.T) {
	zone := leashZone(nil, nil, nil)
	u, s := engagedAt(t, 50, 11*time.Second)
	var npcID uuid.UUID
	for id, unit := range s.Units {
		if unit == u {
			npcID = id
		}
	}
	tagger := uuid.New()
	u.TaggedBy = &tagger
	u.Health = 2
	u.ActiveStatusEffects = []instancestate.ActiveStatusEffect{
		{Status: instanceconfig.Status{Name: "Poisoned"}, ApplierID: uuid.New()},
		{Status: instanceconfig.Status{Name: "Enraged"}, ApplierID: npcID},
	}

	instance.ApplyUnitBehaviorsForTest(s, zone, dt)

	require.Equal(t, instancestate.UnitStatusLeashing, u.Status)
	assert.Equal(t, u.MaxHealth, u.Health)
	assert.Nil(t, u.Target)
	assert.Nil(t, u.TaggedBy)
	require.Len(t, u.ActiveStatusEffects, 1)
	assert.Equal(t, "Enraged", u.ActiveStatusEffects[0].Status.Name, "its own statuses stay")
}

func TestLeash_ThePackLeashesTogether(t *testing.T) {
	zone := leashZone(nil, nil, nil)
	u, s := engagedAt(t, 50, 11*time.Second)
	g2 := &instancestate.UnitState{
		ZoneUnitIdentifier: "g2", UnitTypeIdentifier: "goblin", MapIdentifier: "map1",
		Position: pos(10, 0), Status: instancestate.UnitStatusIdle, Health: 10, MaxHealth: 10,
	}
	s.Units[uuid.New()] = g2
	manualEngage(g2, *u.Target)
	g2.Position = pos(40, 0) // away from its leash point, so it doesn't arrive home this same tick

	instance.ApplyUnitBehaviorsForTest(s, zone, dt)

	assert.Equal(t, instancestate.UnitStatusLeashing, u.Status)
	assert.Equal(t, instancestate.UnitStatusLeashing, g2.Status, "a groupmate still in range goes home too")
}

func TestLeash_LostTargetJoinsAGroupmatesFight(t *testing.T) {
	zone := leashZone(nil, nil, nil)
	u, s := engagedAt(t, 10, 0)
	playerID := *u.Target
	g2 := &instancestate.UnitState{
		ZoneUnitIdentifier: "g2", UnitTypeIdentifier: "goblin", MapIdentifier: "map1",
		Position: pos(5, 0), Status: instancestate.UnitStatusIdle, Health: 10, MaxHealth: 10,
	}
	s.Units[uuid.New()] = g2
	manualEngage(g2, uuid.New()) // its own target is gone

	instance.ApplyUnitBehaviorsForTest(s, zone, dt)

	assert.Equal(t, instancestate.UnitStatusEngaged, g2.Status)
	require.NotNil(t, g2.Target)
	assert.Equal(t, playerID, *g2.Target)
}

func TestLeash_DistanceCarriesAcrossOneMapCrossing(t *testing.T) {
	u := &instancestate.UnitState{MapIdentifier: "map2", Position: pos(10, 0)}
	u.Behavior.LeashMapID, u.Behavior.LeashX, u.Behavior.LeashY = "map1", 0, 0

	// It left map1 at (30, 40) - 50ft from its leash point - and came out
	// on map2 at (10, 0)...
	instance.RecordLeashCrossingForTest(u, "map1", 30, 40)
	assert.InDelta(t, 50, instance.LeashDistanceForTest(u), 1e-9)

	// ...then moved 20ft further.
	u.Position = pos(30, 0)
	assert.InDelta(t, 70, instance.LeashDistanceForTest(u), 1e-9)
}

func TestLeash_CrossingBackHomeDropsTheCarriedDistance(t *testing.T) {
	u := &instancestate.UnitState{MapIdentifier: "map2", Position: pos(10, 0)}
	u.Behavior.LeashMapID = "map1"
	instance.RecordLeashCrossingForTest(u, "map1", 30, 40)

	u.MapIdentifier, u.Position = "map1", pos(3, 4)
	instance.RecordLeashCrossingForTest(u, "map2", 10, 0)
	assert.InDelta(t, 5, instance.LeashDistanceForTest(u), 1e-9)
}

func TestLeash_AThirdMapIsTooFar(t *testing.T) {
	u := &instancestate.UnitState{MapIdentifier: "map2", Position: pos(10, 0)}
	u.Behavior.LeashMapID = "map1"
	instance.RecordLeashCrossingForTest(u, "map1", 0, 0)

	u.MapIdentifier = "map3"
	instance.RecordLeashCrossingForTest(u, "map2", 10, 0)
	assert.True(t, math.IsInf(instance.LeashDistanceForTest(u), 1))
}

func TestUpdateCombatClocks_StampsUnitsThatDealtOrTookDamage(t *testing.T) {
	hit, idle := &instancestate.UnitState{DamageTakenThisTick: true}, &instancestate.UnitState{}
	s := &instancestate.InstanceState{Units: map[uuid.UUID]*instancestate.UnitState{uuid.New(): hit, uuid.New(): idle}}
	now := time.Now()

	instance.UpdateCombatClocksForTest(s, now)

	assert.Equal(t, now, hit.Behavior.LastCombatAt)
	assert.True(t, idle.Behavior.LastCombatAt.IsZero())
}

func TestLeash_WalksHomeAroundAWall(t *testing.T) {
	zone := basicAttackZone(4.0, 1.0)
	zone.Maps[0].Barriers = []instanceconfig.Barrier{{
		Type: "wall", Locations: []instanceconfig.Location{{X: -3, Y: 5}, {X: 3, Y: 5}},
	}}
	graph, err := pathing.Build(zone, 1.0)
	require.NoError(t, err)

	u, s := npcState("g1", pos(0, 10))
	u.Radius = 2.0
	manualLeash(u, 0, 0) // home is on the far side of the wall

	instance.ApplyUnitBehaviorsWithPathGraphForTest(s, zone, dt, graph)

	assert.NotEqual(t, 0.0, u.Position.X, "heads for the wall's open end, not straight through it")
	assert.Equal(t, instancestate.UnitStatusLeashing, u.Status)
}

func TestLeash_WalksBackAcrossAMapConnection(t *testing.T) {
	zone := twoMapZone()
	for i := range zone.Maps {
		zone.Maps[i].FeetDimensions = instanceconfig.Dimensions{Width: 100, Height: 100}
		for j := range zone.Maps[i].Connections {
			zone.Maps[i].Connections[j].FuzzRadius = 1.5
		}
	}
	zone.Maps[0].Connections[0].Position = &instanceconfig.Position{X: 50, Y: 60}
	zone.Maps[1].Connections[0].Position = &instanceconfig.Position{X: 50, Y: 40}
	graph, err := pathing.Build(zone, 1.0)
	require.NoError(t, err)

	u, s := npcState("g1", pos(50, 50))
	manualLeash(u, 50, 50)                            // home on map1...
	u.MapIdentifier, u.Position = "map2", pos(50, 70) // ...but it chased someone onto map2

	for tick := 0; tick < 200 && u.Status == instancestate.UnitStatusLeashing; tick++ {
		prev := s.Clone()
		instance.ApplyUnitBehaviorsWithPathGraphForTest(s, zone, dt, graph)
		instance.ApplyMapTransitionsForTest(s, prev, zone)
	}

	assert.Equal(t, instancestate.UnitStatusIdle, u.Status)
	assert.Equal(t, "map1", u.MapIdentifier, "walked back through the connection rather than teleporting")
	assert.InDelta(t, 50, u.Position.X, 1e-9)
	assert.InDelta(t, 50, u.Position.Y, 1e-9)
}

func TestLeash_WithNoRouteHomeIsSnappedBack(t *testing.T) {
	zone := basicAttackZone(4.0, 1.0)
	// Wall the leash point in completely.
	zone.Maps[0].Barriers = []instanceconfig.Barrier{{
		Type: "wall", Locations: []instanceconfig.Location{{X: -5, Y: -5}, {X: 5, Y: -5}, {X: 5, Y: 5}, {X: -5, Y: 5}, {X: -5, Y: -5}},
	}}
	graph, err := pathing.Build(zone, 1.0)
	require.NoError(t, err)

	u, s := npcState("g1", pos(20, 20))
	manualLeash(u, 0, 0)

	instance.ApplyUnitBehaviorsWithPathGraphForTest(s, zone, dt, graph)

	assert.Equal(t, instancestate.UnitStatusIdle, u.Status)
	assert.Equal(t, pos(0, 0).X, u.Position.X)
	assert.Equal(t, pos(0, 0).Y, u.Position.Y)
}
