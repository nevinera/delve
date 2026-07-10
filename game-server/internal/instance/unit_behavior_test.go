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

// ---------------------------------------------------------------------------
// helpers shared by behavior tests
// ---------------------------------------------------------------------------

// behaviorZone builds a zone with one hostile NPC unit with a given aggro radius.
func behaviorZone(aggroRadius float64, mv instanceconfig.UnitMovement) instanceconfig.Zone {
	return instanceconfig.Zone{
		UnitTypes: map[string]instanceconfig.UnitType{
			"goblin": {Name: "Goblin", SpeedFactor: 1.0, MaxHP: 10, AggroRadius: aggroRadius},
		},
		Maps: []instanceconfig.Map{{
			Identifier: "map1",
			Units: []instanceconfig.Unit{{
				Identifier: "g1",
				UnitType:   "goblin",
				Position:   pos(0, 0),
				Hostility:  "hostile",
				Movement:   mv,
			}},
		}},
	}
}

// addPlayer inserts a live player into state on the given map and returns its ID and state.
func addPlayer(s *instancestate.InstanceState, mapID string, x, y float64) (uuid.UUID, *instancestate.UnitState) {
	p := &instancestate.UnitState{
		ZoneUnitIdentifier: "player:Alice",
		MapIdentifier:      mapID,
		Position:           pos(x, y),
		Status:             instancestate.UnitStatusIdle,
		Health:             100,
		MaxHealth:          100,
		Radius:             instance.BasePlayerRadius,
	}
	id := uuid.New()
	s.Units[id] = p
	return id, p
}

// manualEngage puts a unit into the engaged state targeting a given ID.
func manualEngage(unit *instancestate.UnitState, targetID uuid.UUID) {
	id := targetID
	unit.Target = &id
	unit.Status = instancestate.UnitStatusEngaged
}

// ---------------------------------------------------------------------------
// aggro detection
// ---------------------------------------------------------------------------

func TestUnitBehavior_Aggro_PlayerInRange(t *testing.T) {
	zone := behaviorZone(20.0, instanceconfig.UnitMovement{Type: "still"})
	u, s := npcState("g1", pos(0, 0))
	playerID, _ := addPlayer(s, "map1", 10, 0) // 10ft away, inside 20ft radius

	instance.ApplyUnitBehaviorsForTest(s, zone, dt)

	assert.Equal(t, instancestate.UnitStatusEngaged, u.Status)
	require.NotNil(t, u.Target)
	assert.Equal(t, playerID, *u.Target)
}

func TestUnitBehavior_Aggro_PlayerOutOfRange(t *testing.T) {
	zone := behaviorZone(10.0, instanceconfig.UnitMovement{Type: "still"})
	u, s := npcState("g1", pos(0, 0))
	addPlayer(s, "map1", 15, 0) // 15ft away, outside 10ft radius

	instance.ApplyUnitBehaviorsForTest(s, zone, dt)

	assert.Equal(t, instancestate.UnitStatusIdle, u.Status)
	assert.Nil(t, u.Target)
}

func TestUnitBehavior_Aggro_ZeroRadius_DefaultsTo20(t *testing.T) {
	// aggroRadius: 0 in config means "use default 20ft", not "never aggro".
	zone := behaviorZone(0.0, instanceconfig.UnitMovement{Type: "still"})
	u, s := npcState("g1", pos(0, 0))
	addPlayer(s, "map1", 15, 0) // 15ft — inside default 20ft radius

	instance.ApplyUnitBehaviorsForTest(s, zone, dt)

	assert.Equal(t, instancestate.UnitStatusEngaged, u.Status)
}

func TestUnitBehavior_Aggro_DifferentMap_NeverAggros(t *testing.T) {
	zone := behaviorZone(20.0, instanceconfig.UnitMovement{Type: "still"})
	u, s := npcState("g1", pos(0, 0))
	addPlayer(s, "map2", 5, 0) // same coords but different map

	instance.ApplyUnitBehaviorsForTest(s, zone, dt)

	assert.Equal(t, instancestate.UnitStatusIdle, u.Status)
}

func TestUnitBehavior_Aggro_NeutralHostility_NeverAggros(t *testing.T) {
	zone := instanceconfig.Zone{
		UnitTypes: map[string]instanceconfig.UnitType{
			"goblin": {Name: "Goblin", SpeedFactor: 1.0, MaxHP: 10, AggroRadius: 20},
		},
		Maps: []instanceconfig.Map{{
			Identifier: "map1",
			Units: []instanceconfig.Unit{{
				Identifier: "g1", UnitType: "goblin",
				Position:  pos(0, 0),
				Hostility: "neutral", // not hostile
			}},
		}},
	}
	u, s := npcState("g1", pos(0, 0))
	addPlayer(s, "map1", 5, 0)

	instance.ApplyUnitBehaviorsForTest(s, zone, dt)

	assert.Equal(t, instancestate.UnitStatusIdle, u.Status)
}

func TestUnitBehavior_Aggro_NearestPlayerChosen(t *testing.T) {
	zone := behaviorZone(50.0, instanceconfig.UnitMovement{Type: "still"})
	u, s := npcState("g1", pos(0, 0))
	addPlayer(s, "map1", 30, 0) // farther
	nearID, _ := addPlayer(s, "map1", 10, 0) // nearer

	instance.ApplyUnitBehaviorsForTest(s, zone, dt)

	require.NotNil(t, u.Target)
	assert.Equal(t, nearID, *u.Target)
}

// ---------------------------------------------------------------------------
// linked aggro
// ---------------------------------------------------------------------------

func linkedAggroZone(g1Links, g2Links []string) instanceconfig.Zone {
	return instanceconfig.Zone{
		UnitTypes: map[string]instanceconfig.UnitType{
			"goblin": {Name: "Goblin", SpeedFactor: 1.0, MaxHP: 10, AggroRadius: 20},
		},
		Maps: []instanceconfig.Map{{
			Identifier: "map1",
			Units: []instanceconfig.Unit{
				{Identifier: "g1", UnitType: "goblin", Position: pos(0, 0), Hostility: "hostile", Links: g1Links},
				{Identifier: "g2", UnitType: "goblin", Position: pos(100, 0), Hostility: "hostile", Links: g2Links},
			},
		}},
	}
}

func linkedAggroState() (*instancestate.UnitState, *instancestate.UnitState, *instancestate.InstanceState) {
	g1 := &instancestate.UnitState{ZoneUnitIdentifier: "g1", MapIdentifier: "map1", Position: pos(0, 0), Status: instancestate.UnitStatusIdle, Health: 10, MaxHealth: 10}
	g2 := &instancestate.UnitState{ZoneUnitIdentifier: "g2", MapIdentifier: "map1", Position: pos(100, 0), Status: instancestate.UnitStatusIdle, Health: 10, MaxHealth: 10}
	s := &instancestate.InstanceState{Units: map[uuid.UUID]*instancestate.UnitState{uuid.New(): g1, uuid.New(): g2}}
	return g1, g2, s
}

func TestUnitBehavior_Aggro_LinkedUnitAlsoEngages_ForwardLink(t *testing.T) {
	// g1 lists g2 in its links; when g1 aggros, g2 should engage.
	zone := linkedAggroZone([]string{"g2"}, nil)
	g1, g2, s := linkedAggroState()
	playerID, _ := addPlayer(s, "map1", 5, 0) // within g1's range only

	instance.ApplyUnitBehaviorsForTest(s, zone, dt)

	assert.Equal(t, instancestate.UnitStatusEngaged, g1.Status)
	assert.Equal(t, instancestate.UnitStatusEngaged, g2.Status)
	require.NotNil(t, g2.Target)
	assert.Equal(t, playerID, *g2.Target)
}

func TestUnitBehavior_Aggro_LinkedUnitAlsoEngages_ReverseLink(t *testing.T) {
	// g2 lists g1 in its links (not the other way); links are symmetric,
	// so when g1 aggros the player, g2 should still engage.
	zone := linkedAggroZone(nil, []string{"g1"})
	g1, g2, s := linkedAggroState()
	playerID, _ := addPlayer(s, "map1", 5, 0) // within g1's range only

	instance.ApplyUnitBehaviorsForTest(s, zone, dt)

	assert.Equal(t, instancestate.UnitStatusEngaged, g1.Status)
	assert.Equal(t, instancestate.UnitStatusEngaged, g2.Status)
	require.NotNil(t, g2.Target)
	assert.Equal(t, playerID, *g2.Target)
}

// ---------------------------------------------------------------------------
// chase movement
// ---------------------------------------------------------------------------

func TestUnitBehavior_Chase_MovesTowardTarget(t *testing.T) {
	zone := behaviorZone(0, instanceconfig.UnitMovement{Type: "still"})
	u, s := npcState("g1", pos(0, 0))
	playerID, _ := addPlayer(s, "map1", 0, 30)
	manualEngage(u, playerID)

	instance.ApplyUnitBehaviorsForTest(s, zone, dt)

	// Speed=10, dt=0.1 → moves 1ft toward (0,30).
	assert.InDelta(t, 0.0, u.Position.X, 1e-9)
	assert.InDelta(t, 1.0, u.Position.Y, 1e-9)
}

func TestUnitBehavior_Chase_FacesTarget(t *testing.T) {
	zone := behaviorZone(0, instanceconfig.UnitMovement{Type: "still"})
	u, s := npcState("g1", pos(0, 0))
	playerID, _ := addPlayer(s, "map1", 10, 0) // east
	manualEngage(u, playerID)

	instance.ApplyUnitBehaviorsForTest(s, zone, dt)

	assert.InDelta(t, 90.0, u.Position.Angle, 1e-9) // facing east
}

func TestUnitBehavior_Chase_StopsAtMeleeRange(t *testing.T) {
	zone := behaviorZone(0, instanceconfig.UnitMovement{Type: "still"})
	u, s := npcState("g1", pos(0, 0))
	playerID, _ := addPlayer(s, "map1", 0, 4) // 4ft center-to-center — inside effective stop range (2ft gap + radii)
	manualEngage(u, playerID)

	instance.ApplyUnitBehaviorsForTest(s, zone, dt)

	assert.InDelta(t, 0.0, u.Position.X, 1e-9)
	assert.InDelta(t, 0.0, u.Position.Y, 1e-9)
}

func TestUnitBehavior_Chase_DropsAggroOnDeadTarget(t *testing.T) {
	zone := behaviorZone(0, instanceconfig.UnitMovement{Type: "still"})
	u, s := npcState("g1", pos(0, 0))
	playerID, p := addPlayer(s, "map1", 0, 20)
	p.Status = instancestate.UnitStatusDead
	manualEngage(u, playerID)

	instance.ApplyUnitBehaviorsForTest(s, zone, dt)

	assert.Equal(t, instancestate.UnitStatusIdle, u.Status)
	assert.Nil(t, u.Target)
}

func TestUnitBehavior_Chase_DropsAggroOnMissingTarget(t *testing.T) {
	zone := behaviorZone(0, instanceconfig.UnitMovement{Type: "still"})
	u, s := npcState("g1", pos(0, 0))
	manualEngage(u, uuid.New()) // target not in state

	instance.ApplyUnitBehaviorsForTest(s, zone, dt)

	assert.Equal(t, instancestate.UnitStatusIdle, u.Status)
	assert.Nil(t, u.Target)
}

// ---------------------------------------------------------------------------
// aggro-then-chase same tick
// ---------------------------------------------------------------------------

func TestUnitBehavior_AggroAndChaseInSameTick(t *testing.T) {
	// A unit that aggros should also begin chasing in the same tick.
	zone := behaviorZone(20.0, instanceconfig.UnitMovement{Type: "still"})
	u, s := npcState("g1", pos(0, 0))
	addPlayer(s, "map1", 0, 15) // in range

	instance.ApplyUnitBehaviorsForTest(s, zone, dt)

	// Engaged this tick AND has moved toward target.
	assert.Equal(t, instancestate.UnitStatusEngaged, u.Status)
	assert.Greater(t, u.Position.Y, 0.0)
}
