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
)

func farFuture() time.Time { return time.Now().Add(time.Hour) }

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

// manualEngage puts a unit into the engaged state targeting a given ID,
// recording the current position as the leash point as engageUnit does.
func manualEngage(unit *instancestate.UnitState, targetID uuid.UUID) {
	unit.Behavior.LeashX = unit.Position.X
	unit.Behavior.LeashY = unit.Position.Y
	unit.Behavior.LeashMapID = unit.MapIdentifier
	id := targetID
	unit.Target = &id
	unit.Attacking = true
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
	assert.True(t, u.Attacking)
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
	addPlayer(s, "map1", 30, 0)              // farther
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
	playerID, _ := addPlayer(s, "map1", 0, 4) // 4ft center-to-center — inside effective stop range (default basicAttackRange 5.0 - 1ft buffer + radii)
	manualEngage(u, playerID)

	instance.ApplyUnitBehaviorsForTest(s, zone, dt)

	assert.InDelta(t, 0.0, u.Position.X, 1e-9)
	assert.InDelta(t, 0.0, u.Position.Y, 1e-9)
}

func TestUnitBehavior_Chase_StartsLeashingOnDeadTarget(t *testing.T) {
	zone := behaviorZone(0, instanceconfig.UnitMovement{Type: "still"})
	u, s := npcState("g1", pos(0, 0))
	playerID, p := addPlayer(s, "map1", 0, 20)
	p.Status = instancestate.UnitStatusDead
	manualEngage(u, playerID)

	instance.ApplyUnitBehaviorsForTest(s, zone, dt)

	assert.Equal(t, instancestate.UnitStatusLeashing, u.Status)
	assert.Nil(t, u.Target)
	assert.False(t, u.Attacking)
}

func TestUnitBehavior_Chase_StartsLeashingOnMissingTarget(t *testing.T) {
	zone := behaviorZone(0, instanceconfig.UnitMovement{Type: "still"})
	u, s := npcState("g1", pos(0, 0))
	manualEngage(u, uuid.New()) // target not in state

	instance.ApplyUnitBehaviorsForTest(s, zone, dt)

	assert.Equal(t, instancestate.UnitStatusLeashing, u.Status)
	assert.Nil(t, u.Target)
}

// ---------------------------------------------------------------------------
// NPC attacks
// ---------------------------------------------------------------------------

func stabZone() instanceconfig.Zone {
	amount := instanceconfig.ValueRange{2.0, 3.0}
	rng := instanceconfig.ZeroBasedValueRange{0, 5.0}
	return instanceconfig.Zone{
		UnitTypes: map[string]instanceconfig.UnitType{
			"goblin": {
				Name: "Goblin", SpeedFactor: 1.0, MaxHP: 10, TokenRadius: 2.0,
				Powers: []instanceconfig.Power{{
					Name: "Stab", GlobalCooldown: 1.5,
					Effects: []instanceconfig.PowerEffect{
						{Type: "harm", Amount: &amount, Range: &rng},
					},
				}},
			},
		},
		Maps: []instanceconfig.Map{{
			Identifier: "map1",
			Units: []instanceconfig.Unit{{
				Identifier: "g1", UnitType: "goblin",
				Position: pos(0, 0), Hostility: "hostile",
			}},
		}},
	}
}

// fixedStabZone is stabZone with a fixed (non-random) amount and the given
// school, so mitigation math is deterministic to test.
func fixedStabZone(amount float64, school string) instanceconfig.Zone {
	amountRange := instanceconfig.ValueRange{amount, amount}
	rng := instanceconfig.ZeroBasedValueRange{0, 5.0}
	return instanceconfig.Zone{
		UnitTypes: map[string]instanceconfig.UnitType{
			"goblin": {
				Name: "Goblin", SpeedFactor: 1.0, MaxHP: 10, TokenRadius: 2.0,
				Powers: []instanceconfig.Power{{
					Name: "Stab", GlobalCooldown: 1.5,
					Effects: []instanceconfig.PowerEffect{
						{Type: "harm", Amount: &amountRange, Range: &rng, School: school},
					},
				}},
			},
		},
		Maps: []instanceconfig.Map{{
			Identifier: "map1",
			Units: []instanceconfig.Unit{{
				Identifier: "g1", UnitType: "goblin",
				Position: pos(0, 0), Hostility: "hostile",
			}},
		}},
	}
}

func TestUnitBehavior_Attack_AppliesPlayerTargetsDefenceRating(t *testing.T) {
	zone := fixedStabZone(20.0, "physical")

	// r=30 -> physicalDR = 0.6*30/128 = 0.140625 -> 20*(1-0.140625) = 17.1875
	// dmg on a non-crit; the NPC caster has a 5% base crit chance (no
	// itemized stats to raise it), so retry past an occasional crit roll to
	// keep this deterministic.
	const wantHealth = 100.0 - 17.1875
	for i := 0; i < 200; i++ {
		u, s := npcState("g1", pos(0, 0))
		u.Radius = 2.0
		playerID, p := addPlayer(s, "map1", 0, 4)
		p.EquippedItems = map[string]instanceconfig.EquippedItem{
			"neck": {Slot: "neck", SecondaryStats: []string{"defence_rating", "defence_rating", "defence_rating"}},
		}
		manualEngage(u, playerID)

		instance.ApplyUnitBehaviorsForTest(s, zone, dt)

		if math.Abs(p.Health-wantHealth) < 0.01 {
			return
		}
	}
	t.Fatal("stab crit 200 times in a row - crit chance may be miscalibrated")
}

func TestUnitBehavior_Attack_DamagesPlayerInRange(t *testing.T) {
	zone := stabZone()

	// NPC power harm effects roll the universal 5% miss chance now - retry
	// past an occasional miss to keep this deterministic.
	for i := 0; i < 200; i++ {
		u, s := npcState("g1", pos(0, 0))
		u.Radius = 2.0
		playerID, p := addPlayer(s, "map1", 0, 4) // 4ft away, within effective range (5+2+2.2)
		manualEngage(u, playerID)

		instance.ApplyUnitBehaviorsForTest(s, zone, dt)

		if p.Health < 100.0 {
			return
		}
	}
	t.Fatal("NPC power missed 200 times in a row - miss chance may be miscalibrated")
}

func TestUnitBehavior_Attack_BlockedByGCD(t *testing.T) {
	zone := stabZone()
	u, s := npcState("g1", pos(0, 0))
	u.Radius = 2.0
	u.GlobalCooldownEndsAt = farFuture()
	playerID, p := addPlayer(s, "map1", 0, 4)
	manualEngage(u, playerID)

	instance.ApplyUnitBehaviorsForTest(s, zone, dt)

	assert.Equal(t, 100.0, p.Health)
}

func TestUnitBehavior_Attack_OutOfRangeIsNoOp(t *testing.T) {
	zone := stabZone()
	u, s := npcState("g1", pos(0, 0))
	u.Radius = 2.0
	playerID, p := addPlayer(s, "map1", 0, 20) // 20ft away, outside 5+2+2.2 range
	manualEngage(u, playerID)

	instance.ApplyUnitBehaviorsForTest(s, zone, dt)

	assert.Equal(t, 100.0, p.Health)
}

func TestUnitBehavior_Attack_SetsGCD(t *testing.T) {
	zone := stabZone()
	u, s := npcState("g1", pos(0, 0))
	u.Radius = 2.0
	playerID, _ := addPlayer(s, "map1", 0, 4)
	manualEngage(u, playerID)

	instance.ApplyUnitBehaviorsForTest(s, zone, dt)

	assert.True(t, u.GlobalCooldownEndsAt.After(time.Now().Add(time.Second)))
}

func TestUnitBehavior_Attack_KillsSetsDeadAndClearsTarget(t *testing.T) {
	zone := stabZone()

	// NPC power harm effects roll the universal 5% miss chance now - retry
	// past an occasional miss to keep this deterministic.
	for i := 0; i < 200; i++ {
		u, s := npcState("g1", pos(0, 0))
		u.Radius = 2.0
		playerID, p := addPlayer(s, "map1", 0, 4)
		p.Health = 1.0
		manualEngage(u, playerID)

		instance.ApplyUnitBehaviorsForTest(s, zone, dt)

		if p.Health != 1.0 {
			assert.Equal(t, 0.0, p.Health)
			assert.Equal(t, instancestate.UnitStatusDead, p.Status)
			assert.Nil(t, p.Target)
			return
		}
	}
	t.Fatal("NPC power missed 200 times in a row - miss chance may be miscalibrated")
}

// ---------------------------------------------------------------------------
// NPC basic attacks
// ---------------------------------------------------------------------------

func basicAttackZone(dps, attackSpeed float64) instanceconfig.Zone {
	return instanceconfig.Zone{
		UnitTypes: map[string]instanceconfig.UnitType{
			"goblin": {
				Name: "Goblin", SpeedFactor: 1.0, MaxHP: 10, TokenRadius: 2.0,
				DPS: dps, AttackSpeed: attackSpeed,
			},
		},
		Maps: []instanceconfig.Map{{
			Identifier: "map1",
			Units: []instanceconfig.Unit{{
				Identifier: "g1", UnitType: "goblin",
				Position: pos(0, 0), Hostility: "hostile",
			}},
		}},
	}
}

func rangedBasicAttackZone(dps, attackSpeed, attackRange float64) instanceconfig.Zone {
	return instanceconfig.Zone{
		UnitTypes: map[string]instanceconfig.UnitType{
			"goblin": {
				Name: "Goblin", SpeedFactor: 1.0, MaxHP: 10, TokenRadius: 2.0,
				DPS: dps, AttackSpeed: attackSpeed, BasicAttackRange: attackRange,
			},
		},
		Maps: []instanceconfig.Map{{
			Identifier: "map1",
			Units: []instanceconfig.Unit{{
				Identifier: "g1", UnitType: "goblin",
				Position: pos(0, 0), Hostility: "hostile",
			}},
		}},
	}
}

// withWallAt adds a wall barrier to zone's first (only) map, running the full
// width of the map at the given y - splitting the origin from anything
// beyond it in y.
func withWallAt(zone instanceconfig.Zone, wallY float64) instanceconfig.Zone {
	zone.Maps[0].Barriers = []instanceconfig.Barrier{{
		Type: "wall",
		Locations: []instanceconfig.Location{
			{X: -100, Y: wallY}, {X: 100, Y: wallY},
		},
	}}
	return zone
}

func TestUnitBehavior_BasicAttack_BlockedByWallIsNoOp(t *testing.T) {
	zone := withWallAt(basicAttackZone(4.0, 1.0), 2)
	u, s := npcState("g1", pos(0, 0))
	u.Radius = 2.0
	playerID, p := addPlayer(s, "map1", 0, 4) // in range, but wall at y=2 is between them
	manualEngage(u, playerID)
	before := p.Health

	instance.ApplyUnitBehaviorsForTest(s, zone, dt)

	assert.Equal(t, before, p.Health)
}

func TestUnitBehavior_Aggro_BlockedByWallDoesNotBlockAttackElsewhere(t *testing.T) {
	zone := withWallAt(basicAttackZone(4.0, 1.0), 200) // far outside either unit's path

	// NPC basic attacks roll the universal 5% miss chance now - retry past
	// an occasional miss to keep this deterministic.
	for i := 0; i < 200; i++ {
		u, s := npcState("g1", pos(0, 0))
		u.Radius = 2.0
		playerID, p := addPlayer(s, "map1", 0, 4)
		manualEngage(u, playerID)
		before := p.Health

		instance.ApplyUnitBehaviorsForTest(s, zone, dt)

		if p.Health < before {
			return
		}
	}
	t.Fatal("NPC attack missed 200 times in a row - miss chance may be miscalibrated")
}

func TestUnitBehavior_Chase_ContinuesClosingWhenLOSBlocked(t *testing.T) {
	zone := withWallAt(rangedBasicAttackZone(2.0, 1.0, 30.0), 10)
	u, s := npcState("g1", pos(0, 0))
	u.Radius = 2.0
	// Well within the 30ft ranged stop distance, so a normal ranged mob would
	// hold position here - but the wall at y=10 blocks the shot, so it should
	// keep closing in instead of standing still doing nothing.
	playerID, _ := addPlayer(s, "map1", 0, 20)
	manualEngage(u, playerID)

	instance.ApplyUnitBehaviorsForTest(s, zone, dt)

	assert.Greater(t, u.Position.Y, 0.0)
}

func TestUnitBehavior_Chase_StopsShortOfBasicAttackRange(t *testing.T) {
	zone := basicAttackZone(4.0, 1.0) // default (melee) basicAttackRange = 5.0
	u, s := npcState("g1", pos(0, 0))
	u.Radius = 2.0
	// stopDist = (5 - 1 buffer) + 2.0 + 2.2 = 8.2ft; 6ft is inside that, so the
	// NPC should already consider itself in range and not close in further,
	// even though 6ft is well beyond the old fixed 2ft melee stop distance.
	playerID, _ := addPlayer(s, "map1", 0, 6)
	manualEngage(u, playerID)

	instance.ApplyUnitBehaviorsForTest(s, zone, dt)

	assert.Equal(t, 0.0, u.Position.Y)
}

func TestUnitBehavior_Chase_RangedStopsFartherThanMelee(t *testing.T) {
	zone := rangedBasicAttackZone(2.0, 1.0, 30.0)
	u, s := npcState("g1", pos(0, 0))
	u.Radius = 2.0
	// Well outside melee's stop distance but inside the archer's ranged one
	// (stopDist = (30 - 1) + 2.0 + 2.2 = 33.2ft).
	playerID, _ := addPlayer(s, "map1", 0, 20)
	manualEngage(u, playerID)

	instance.ApplyUnitBehaviorsForTest(s, zone, dt)

	assert.Equal(t, 0.0, u.Position.Y)
}

func TestUnitBehavior_BasicAttack_UsesUnitTypeRangeOverride(t *testing.T) {
	zone := rangedBasicAttackZone(2.0, 1.0, 30.0)

	// NPC basic attacks roll the universal 5% miss chance now - retry past
	// an occasional miss to keep this deterministic.
	for i := 0; i < 200; i++ {
		u, s := npcState("g1", pos(0, 0))
		u.Radius = 2.0
		playerID, p := addPlayer(s, "map1", 0, 20) // out of default 5ft range, within the 30ft override
		manualEngage(u, playerID)

		instance.ApplyUnitBehaviorsForTest(s, zone, dt)

		if p.Health < 100.0 {
			return
		}
	}
	t.Fatal("NPC attack missed 200 times in a row - miss chance may be miscalibrated")
}

func TestUnitBehavior_BasicAttack_DamagesPlayerInRange(t *testing.T) {
	zone := basicAttackZone(4.0, 1.0)

	// NPC basic attacks roll the universal 5% miss chance now - retry past
	// an occasional miss to keep this deterministic.
	for i := 0; i < 200; i++ {
		u, s := npcState("g1", pos(0, 0))
		u.Radius = 2.0
		playerID, p := addPlayer(s, "map1", 0, 4) // 4ft away, within effective range (5+2+2.2)
		manualEngage(u, playerID)

		instance.ApplyUnitBehaviorsForTest(s, zone, dt)

		if p.Health < 100.0 {
			return
		}
	}
	t.Fatal("NPC attack missed 200 times in a row - miss chance may be miscalibrated")
}

func TestUnitBehavior_BasicAttack_DefenceRatingReducesDamageToPlayer(t *testing.T) {
	zone := basicAttackZone(100.0, 1.0) // high flat DPS so DR's reduction is unmistakable

	// NPC basic attacks roll the universal 5% miss chance now - retry past
	// an occasional miss (which would leave p.Health at 100, failing the
	// "meaningfully reduced" assertion below for the wrong reason).
	for i := 0; i < 200; i++ {
		u, s := npcState("g1", pos(0, 0))
		u.Radius = 2.0
		playerID, p := addPlayer(s, "map1", 0, 4)
		p.EquippedItems = map[string]instanceconfig.EquippedItem{
			"neck": {Slot: "neck", SecondaryStats: []string{"defence_rating", "defence_rating", "defence_rating"}},
		}
		manualEngage(u, playerID)

		instance.ApplyUnitBehaviorsForTest(s, zone, dt)

		if p.Health == 100.0 {
			continue // missed - retry
		}
		// unmitigated hits land in [85,115] (100 +/- 15% variance); 30 raw
		// Defence Rating's ~14% physical DR should pull that down to
		// roughly [73,99].
		assert.GreaterOrEqual(t, p.Health, 0.0)
		assert.Less(t, p.Health, 40.0, "expected the player's Defence Rating to meaningfully reduce the 100-dps hit")
		return
	}
	t.Fatal("NPC attack missed 200 times in a row - miss chance may be miscalibrated")
}

func TestUnitBehavior_BasicAttack_NotAttackingIsNoOp(t *testing.T) {
	zone := basicAttackZone(4.0, 1.0)
	u, s := npcState("g1", pos(0, 0))
	u.Radius = 2.0
	playerID, p := addPlayer(s, "map1", 0, 4)
	manualEngage(u, playerID)
	u.Attacking = false

	instance.ApplyUnitBehaviorsForTest(s, zone, dt)

	assert.Equal(t, 100.0, p.Health)
}

func TestUnitBehavior_BasicAttack_BlockedBySwingTimer(t *testing.T) {
	zone := basicAttackZone(4.0, 1.0)
	u, s := npcState("g1", pos(0, 0))
	u.Radius = 2.0
	u.NextBasicAttackAt = farFuture()
	playerID, p := addPlayer(s, "map1", 0, 4)
	manualEngage(u, playerID)

	instance.ApplyUnitBehaviorsForTest(s, zone, dt)

	assert.Equal(t, 100.0, p.Health)
}

func TestUnitBehavior_BasicAttack_OutOfRangeIsNoOp(t *testing.T) {
	zone := basicAttackZone(4.0, 1.0)
	u, s := npcState("g1", pos(0, 0))
	u.Radius = 2.0
	playerID, p := addPlayer(s, "map1", 0, 20) // 20ft away, outside 5+2+2.2 range
	manualEngage(u, playerID)

	instance.ApplyUnitBehaviorsForTest(s, zone, dt)

	assert.Equal(t, 100.0, p.Health)
}

func TestUnitBehavior_BasicAttack_SetsSwingTimer(t *testing.T) {
	zone := basicAttackZone(4.0, 2.0) // attackSpeed 2.0 -> 0.5s between swings
	u, s := npcState("g1", pos(0, 0))
	u.Radius = 2.0
	playerID, _ := addPlayer(s, "map1", 0, 4)
	manualEngage(u, playerID)

	before := time.Now()
	instance.ApplyUnitBehaviorsForTest(s, zone, dt)

	assert.True(t, u.NextBasicAttackAt.After(before.Add(400*time.Millisecond)))
	assert.True(t, u.NextBasicAttackAt.Before(before.Add(600*time.Millisecond)))
}

func TestUnitBehavior_BasicAttack_KillsSetsDeadAndClearsTarget(t *testing.T) {
	zone := basicAttackZone(4.0, 1.0)

	// NPC basic attacks roll the universal 5% miss chance now - retry past
	// an occasional miss to keep this deterministic.
	for i := 0; i < 200; i++ {
		u, s := npcState("g1", pos(0, 0))
		u.Radius = 2.0
		playerID, p := addPlayer(s, "map1", 0, 4)
		p.Health = 1.0
		manualEngage(u, playerID)

		instance.ApplyUnitBehaviorsForTest(s, zone, dt)

		if p.Health != 1.0 {
			assert.Equal(t, 0.0, p.Health)
			assert.Equal(t, instancestate.UnitStatusDead, p.Status)
			assert.Nil(t, p.Target)
			return
		}
	}
	t.Fatal("NPC attack missed 200 times in a row - miss chance may be miscalibrated")
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

// ---------------------------------------------------------------------------
// cross-map chase
// ---------------------------------------------------------------------------

func twoMapZone() instanceconfig.Zone {
	return instanceconfig.Zone{
		UnitTypes: map[string]instanceconfig.UnitType{
			"goblin": {Name: "Goblin", SpeedFactor: 1.0, MaxHP: 10, AggroRadius: 5.0},
		},
		Maps: []instanceconfig.Map{
			{
				Identifier: "map1",
				Units: []instanceconfig.Unit{{
					Identifier: "g1",
					UnitType:   "goblin",
					Position:   pos(0, 0),
					Hostility:  "hostile",
				}},
			},
			{Identifier: "map2"},
		},
	}
}

func TestUnitBehavior_Chase_UpdatesLastSeenWhenOnSameMap(t *testing.T) {
	zone := twoMapZone()
	u, s := npcState("g1", pos(0, 0))
	playerID, _ := addPlayer(s, "map1", 0, 3)
	manualEngage(u, playerID)

	instance.ApplyUnitBehaviorsForTest(s, zone, dt)

	assert.InDelta(t, 0.0, u.Behavior.LastSeenX, 1e-9)
	assert.InDelta(t, 3.0, u.Behavior.LastSeenY, 1e-9)
}

func TestUnitBehavior_Chase_MovesTowardLastSeenWhenTargetOnDifferentMap(t *testing.T) {
	zone := twoMapZone()
	u, s := npcState("g1", pos(0, 0))
	u.Behavior.LastSeenX = 0
	u.Behavior.LastSeenY = 10
	playerID, p := addPlayer(s, "map2", 0, 0) // player on different map
	manualEngage(u, playerID)

	instance.ApplyUnitBehaviorsForTest(s, zone, dt)

	assert.Equal(t, instancestate.UnitStatusEngaged, u.Status)
	assert.Equal(t, p.MapIdentifier, "map2") // player unchanged
	assert.Greater(t, u.Position.Y, 0.0)     // NPC moved toward last seen
}

func TestUnitBehavior_Chase_ResumesDirectChaseWhenTargetReturns(t *testing.T) {
	zone := twoMapZone()
	u, s := npcState("g1", pos(0, 8))
	u.Behavior.LastSeenX = 0
	u.Behavior.LastSeenY = 10                  // "last seen" is in the opposite direction (up) from the actual player (down)
	playerID, p := addPlayer(s, "map1", 0, -5) // player back on same map, well outside chase stop range
	manualEngage(u, playerID)

	instance.ApplyUnitBehaviorsForTest(s, zone, dt)

	// NPC should move toward the player at y=-5, not the last-seen at y=10.
	assert.Less(t, u.Position.Y, 8.0)
	assert.InDelta(t, -5.0, u.Behavior.LastSeenY, 1e-9) // last seen updated to player's current pos
	_ = p
}

// ---------------------------------------------------------------------------
// leash behavior
// ---------------------------------------------------------------------------

// manualLeash puts a unit into the leashing state with a given leash point.
func manualLeash(unit *instancestate.UnitState, leashX, leashY float64) {
	unit.Status = instancestate.UnitStatusLeashing
	unit.Target = nil
	unit.Behavior.LeashX = leashX
	unit.Behavior.LeashY = leashY
	unit.Behavior.LeashMapID = unit.MapIdentifier
}

func TestUnitBehavior_Leash_MovesBackToLeashPoint(t *testing.T) {
	zone := behaviorZone(0, instanceconfig.UnitMovement{Type: "still"})
	u, s := npcState("g1", pos(0, 20)) // NPC is 20ft north of home
	manualLeash(u, 0, 0)

	instance.ApplyUnitBehaviorsForTest(s, zone, dt)

	// Should have moved 1ft south (speed=10, dt=0.1) toward (0,0).
	assert.InDelta(t, 0.0, u.Position.X, 1e-9)
	assert.InDelta(t, 19.0, u.Position.Y, 1e-9)
	assert.Equal(t, instancestate.UnitStatusLeashing, u.Status)
}

func TestUnitBehavior_Leash_ArrivesAndGoesIdle(t *testing.T) {
	zone := behaviorZone(0, instanceconfig.UnitMovement{Type: "still"})
	u, s := npcState("g1", pos(0, 0.3)) // close enough to snap (< 0.5ft)
	manualLeash(u, 0, 0)

	instance.ApplyUnitBehaviorsForTest(s, zone, dt)

	assert.Equal(t, instancestate.UnitStatusIdle, u.Status)
	assert.InDelta(t, 0.0, u.Position.X, 1e-9)
	assert.InDelta(t, 0.0, u.Position.Y, 1e-9)
}

func TestUnitBehavior_Leash_HealsOverTime(t *testing.T) {
	zone := behaviorZone(0, instanceconfig.UnitMovement{Type: "still"})
	u, s := npcState("g1", pos(0, 20)) // far from leash point, stays leashing this tick
	u.Health = 5
	manualLeash(u, 0, 0)

	instance.ApplyUnitBehaviorsForTest(s, zone, dt)

	// MaxHealth=10, 20%/sec, dt=0.1 -> +0.2
	assert.InDelta(t, 5.2, u.Health, 1e-9)
}

func TestUnitBehavior_Leash_HealDoesNotExceedMaxHealth(t *testing.T) {
	zone := behaviorZone(0, instanceconfig.UnitMovement{Type: "still"})
	u, s := npcState("g1", pos(0, 20))
	u.Health = u.MaxHealth
	manualLeash(u, 0, 0)

	instance.ApplyUnitBehaviorsForTest(s, zone, dt)

	assert.Equal(t, u.MaxHealth, u.Health)
}

func TestUnitBehavior_Leash_ArrivesAndGoesIdle_ClearsTag(t *testing.T) {
	zone := behaviorZone(0, instanceconfig.UnitMovement{Type: "still"})
	u, s := npcState("g1", pos(0, 0.3)) // close enough to snap (< 0.5ft)
	manualLeash(u, 0, 0)
	tagger := uuid.New()
	u.TaggedBy = &tagger

	instance.ApplyUnitBehaviorsForTest(s, zone, dt)

	assert.Nil(t, u.TaggedBy)
}

func TestUnitBehavior_Leash_DoesNotReaggro(t *testing.T) {
	// A player within aggro range should not re-engage a leashing unit.
	zone := behaviorZone(20.0, instanceconfig.UnitMovement{Type: "still"})
	u, s := npcState("g1", pos(0, 20))
	manualLeash(u, 0, 0)
	addPlayer(s, "map1", 0, 22) // within 20ft aggro radius of current position

	instance.ApplyUnitBehaviorsForTest(s, zone, dt)

	assert.Equal(t, instancestate.UnitStatusLeashing, u.Status)
}

func TestUnitBehavior_Leash_EngageRecordsLeashPoint(t *testing.T) {
	// engageUnit should record the unit's position as the leash point.
	zone := behaviorZone(20.0, instanceconfig.UnitMovement{Type: "still"})
	u, s := npcState("g1", pos(5, 10))
	addPlayer(s, "map1", 5, 15) // within range

	instance.ApplyUnitBehaviorsForTest(s, zone, dt)

	require.Equal(t, instancestate.UnitStatusEngaged, u.Status)
	assert.InDelta(t, 5.0, u.Behavior.LeashX, 1e-9)
	assert.InDelta(t, 10.0, u.Behavior.LeashY, 1e-9)
	assert.Equal(t, "map1", u.Behavior.LeashMapID)
}

func TestUnitBehavior_Leash_CrossMapSnapsBack(t *testing.T) {
	// A unit that chased a player to another map should snap back immediately.
	zone := twoMapZone()
	u, s := npcState("g1", pos(0, 0))
	u.MapIdentifier = "map2" // NPC got dragged to map2
	u.Position = pos(50, 50)
	manualLeash(u, 0, 0)
	u.Behavior.LeashMapID = "map1" // home is map1

	instance.ApplyUnitBehaviorsForTest(s, zone, dt)

	assert.Equal(t, instancestate.UnitStatusIdle, u.Status)
	assert.Equal(t, "map1", u.MapIdentifier)
	assert.InDelta(t, 0.0, u.Position.X, 1e-9)
	assert.InDelta(t, 0.0, u.Position.Y, 1e-9)
}

func TestUnitBehavior_Leash_CrossMapSnapsBack_ClearsTag(t *testing.T) {
	zone := twoMapZone()
	u, s := npcState("g1", pos(0, 0))
	u.MapIdentifier = "map2"
	u.Position = pos(50, 50)
	manualLeash(u, 0, 0)
	u.Behavior.LeashMapID = "map1"
	tagger := uuid.New()
	u.TaggedBy = &tagger

	instance.ApplyUnitBehaviorsForTest(s, zone, dt)

	assert.Nil(t, u.TaggedBy)
}
