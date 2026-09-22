package instance_test

import (
	"fmt"
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
// grouped aggro
// ---------------------------------------------------------------------------

func groupedAggroZone(g1Group, g2Group string) instanceconfig.Zone {
	return instanceconfig.Zone{
		UnitTypes: map[string]instanceconfig.UnitType{
			"goblin": {Name: "Goblin", SpeedFactor: 1.0, MaxHP: 10, AggroRadius: 20},
		},
		Maps: []instanceconfig.Map{{
			Identifier: "map1",
			Units: []instanceconfig.Unit{
				{Identifier: "g1", UnitType: "goblin", Position: pos(0, 0), Hostility: "hostile", GroupIdentifier: g1Group},
				{Identifier: "g2", UnitType: "goblin", Position: pos(100, 0), Hostility: "hostile", GroupIdentifier: g2Group},
			},
		}},
	}
}

func groupedAggroState() (*instancestate.UnitState, *instancestate.UnitState, *instancestate.InstanceState) {
	g1 := &instancestate.UnitState{ZoneUnitIdentifier: "g1", MapIdentifier: "map1", Position: pos(0, 0), Status: instancestate.UnitStatusIdle, Health: 10, MaxHealth: 10}
	g2 := &instancestate.UnitState{ZoneUnitIdentifier: "g2", MapIdentifier: "map1", Position: pos(100, 0), Status: instancestate.UnitStatusIdle, Health: 10, MaxHealth: 10}
	s := &instancestate.InstanceState{Units: map[uuid.UUID]*instancestate.UnitState{uuid.New(): g1, uuid.New(): g2}}
	return g1, g2, s
}

func TestUnitBehavior_Aggro_GroupedUnitAlsoEngages(t *testing.T) {
	// g1 and g2 share a groupIdentifier; when g1 aggros, g2 should engage too.
	zone := groupedAggroZone("goblin_pack", "goblin_pack")
	g1, g2, s := groupedAggroState()
	playerID, _ := addPlayer(s, "map1", 5, 0) // within g1's range only

	instance.ApplyUnitBehaviorsForTest(s, zone, dt)

	assert.Equal(t, instancestate.UnitStatusEngaged, g1.Status)
	assert.Equal(t, instancestate.UnitStatusEngaged, g2.Status)
	require.NotNil(t, g2.Target)
	assert.Equal(t, playerID, *g2.Target)
}

func TestUnitBehavior_Aggro_DifferentGroupDoesNotEngage(t *testing.T) {
	// g1 and g2 have different (non-empty) groupIdentifiers - not grouped.
	zone := groupedAggroZone("pack_a", "pack_b")
	g1, g2, s := groupedAggroState()
	addPlayer(s, "map1", 5, 0) // within g1's range only

	instance.ApplyUnitBehaviorsForTest(s, zone, dt)

	assert.Equal(t, instancestate.UnitStatusEngaged, g1.Status)
	assert.Equal(t, instancestate.UnitStatusIdle, g2.Status)
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

// selfStatusZone builds a zone with a single hostile goblin whose only power
// applies a status to itself.
func selfStatusZone(status instanceconfig.Status) instanceconfig.Zone {
	return instanceconfig.Zone{
		UnitTypes: map[string]instanceconfig.UnitType{
			"goblin": {
				Name: "Goblin", SpeedFactor: 1.0, MaxHP: 10, TokenRadius: 2.0,
				Powers: []instanceconfig.Power{{
					Name: "Enrage", GlobalCooldown: 1.5,
					Effects: []instanceconfig.PowerEffect{
						{Type: "status", Affects: "self", Duration: 10.0, Status: &status},
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

// targetStatusZone builds a zone with a single hostile goblin whose only
// power applies a status to its target.
func targetStatusZone(status instanceconfig.Status) instanceconfig.Zone {
	rng := instanceconfig.ZeroBasedValueRange{0, 5.0}
	return instanceconfig.Zone{
		UnitTypes: map[string]instanceconfig.UnitType{
			"goblin": {
				Name: "Goblin", SpeedFactor: 1.0, MaxHP: 10, TokenRadius: 2.0,
				Powers: []instanceconfig.Power{{
					Name: "Daze", GlobalCooldown: 1.5,
					Effects: []instanceconfig.PowerEffect{
						{Type: "status", Affects: "bTarget", Range: &rng, Duration: 10.0, Status: &status},
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

// poundZone builds a zone with a single hostile goblin whose only power has
// both a harm effect and a target-status effect, like the real "Pound".
func poundZone(status instanceconfig.Status) instanceconfig.Zone {
	amount := instanceconfig.ValueRange{2.0, 3.0}
	rng := instanceconfig.ZeroBasedValueRange{0, 5.0}
	return instanceconfig.Zone{
		UnitTypes: map[string]instanceconfig.UnitType{
			"goblin": {
				Name: "Goblin", SpeedFactor: 1.0, MaxHP: 10, TokenRadius: 2.0,
				Powers: []instanceconfig.Power{{
					Name: "Pound", GlobalCooldown: 1.5,
					Effects: []instanceconfig.PowerEffect{
						{Type: "harm", Amount: &amount, Range: &rng},
						{Type: "status", Affects: "bTarget", Range: &rng, Duration: 10.0, Status: &status},
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

// cooldownStabZone is stabZone with a per-power Cooldown added to Stab.
func cooldownStabZone(cooldown float64) instanceconfig.Zone {
	zone := stabZone()
	ut := zone.UnitTypes["goblin"]
	ut.Powers[0].Cooldown = cooldown
	zone.UnitTypes["goblin"] = ut
	return zone
}

func TestUnitBehavior_Attack_SetsPowerCooldown(t *testing.T) {
	zone := cooldownStabZone(20.0)
	u, s := npcState("g1", pos(0, 0))
	u.Radius = 2.0
	playerID, _ := addPlayer(s, "map1", 0, 4)
	manualEngage(u, playerID)

	instance.ApplyUnitBehaviorsForTest(s, zone, dt)

	require.Contains(t, u.PowerCooldowns, "Stab")
	assert.True(t, u.PowerCooldowns["Stab"].After(time.Now().Add(19*time.Second)))
}

func TestUnitBehavior_Attack_PowerCooldownBlocksRepeatUseEvenOffGCD(t *testing.T) {
	zone := cooldownStabZone(20.0)
	u, s := npcState("g1", pos(0, 0))
	u.Radius = 2.0
	u.PowerCooldowns = map[string]time.Time{"Stab": time.Now().Add(19 * time.Second)}
	playerID, p := addPlayer(s, "map1", 0, 4)
	manualEngage(u, playerID)
	// GCD is off (zero value), so only the power's own cooldown could be
	// blocking this - the bug this guards against: PowerUsable checks
	// PowerCooldowns, but nothing ever set it for an NPC, so it never
	// actually gated anything.
	require.True(t, u.GlobalCooldownEndsAt.IsZero())

	instance.ApplyUnitBehaviorsForTest(s, zone, dt)

	assert.Equal(t, 100.0, p.Health)
}

func TestUnitBehavior_Attack_FiresAgainOncePowerCooldownExpires(t *testing.T) {
	zone := cooldownStabZone(20.0)

	for i := 0; i < 200; i++ {
		u, s := npcState("g1", pos(0, 0))
		u.Radius = 2.0
		u.PowerCooldowns = map[string]time.Time{"Stab": time.Now().Add(-time.Second)}
		playerID, p := addPlayer(s, "map1", 0, 4)
		manualEngage(u, playerID)

		instance.ApplyUnitBehaviorsForTest(s, zone, dt)

		if p.Health < 100.0 {
			return
		}
	}
	t.Fatal("Stab missed 200 times in a row - miss chance may be miscalibrated")
}

// twoStabsZone is a goblin with two harm powers (Stab, Slash), both with a
// long enough Cooldown that "which one just fired" is unambiguous from
// PowerCooldowns afterward - and tactics set by the caller.
func twoStabsZone(tactics instanceconfig.UnitTactics) instanceconfig.Zone {
	amount := instanceconfig.ValueRange{2.0, 3.0}
	rng := instanceconfig.ZeroBasedValueRange{0, 5.0}
	return instanceconfig.Zone{
		UnitTypes: map[string]instanceconfig.UnitType{
			"goblin": {
				Name: "Goblin", SpeedFactor: 1.0, MaxHP: 10, TokenRadius: 2.0,
				Tactics: tactics,
				Powers: []instanceconfig.Power{
					{Name: "Stab", GlobalCooldown: 1.5, Cooldown: 100, Effects: []instanceconfig.PowerEffect{{Type: "harm", Amount: &amount, Range: &rng}}},
					{Name: "Slash", GlobalCooldown: 1.5, Cooldown: 100, Effects: []instanceconfig.PowerEffect{{Type: "harm", Amount: &amount, Range: &rng}}},
				},
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

func TestUnitBehavior_Tactics_RotationCyclesInOrder(t *testing.T) {
	zone := twoStabsZone(instanceconfig.UnitTactics{Type: "rotation", Powers: []string{"Stab", "Slash"}})
	u, s := npcState("g1", pos(0, 0))
	u.Radius = 2.0
	playerID, _ := addPlayer(s, "map1", 0, 4)
	manualEngage(u, playerID)

	instance.ApplyUnitBehaviorsForTest(s, zone, dt)
	require.Contains(t, u.PowerCooldowns, "Stab", "rotation should fire the first listed power first")
	assert.NotContains(t, u.PowerCooldowns, "Slash")

	// Simulate the next decision point.
	u.GlobalCooldownEndsAt = time.Time{}
	u.PowerCooldowns = map[string]time.Time{}

	instance.ApplyUnitBehaviorsForTest(s, zone, dt)
	assert.Contains(t, u.PowerCooldowns, "Slash", "rotation should advance to the next power in order")
}

func TestUnitBehavior_Tactics_RotationWaitsForCurrentPowerRatherThanSkippingAhead(t *testing.T) {
	zone := twoStabsZone(instanceconfig.UnitTactics{Type: "rotation", Powers: []string{"Stab", "Slash"}})
	u, s := npcState("g1", pos(0, 0))
	u.Radius = 2.0
	u.PowerCooldowns = map[string]time.Time{"Stab": time.Now().Add(50 * time.Second)} // Stab not ready yet
	playerID, p := addPlayer(s, "map1", 0, 4)
	manualEngage(u, playerID)

	instance.ApplyUnitBehaviorsForTest(s, zone, dt)

	assert.Equal(t, 100.0, p.Health, "should wait for Stab rather than firing Slash instead")
	assert.NotContains(t, u.PowerCooldowns, "Slash")
}

func TestUnitBehavior_Tactics_PriorityRotationUsesHighestPriorityUsable(t *testing.T) {
	zone := twoStabsZone(instanceconfig.UnitTactics{Type: "priorityRotation", Powers: []string{"Slash", "Stab"}})
	u, s := npcState("g1", pos(0, 0))
	u.Radius = 2.0
	playerID, _ := addPlayer(s, "map1", 0, 4)
	manualEngage(u, playerID)

	instance.ApplyUnitBehaviorsForTest(s, zone, dt)

	assert.Contains(t, u.PowerCooldowns, "Slash")
	assert.NotContains(t, u.PowerCooldowns, "Stab")
}

func TestUnitBehavior_Tactics_PriorityRotationFallsBackWhenTopPriorityUnavailable(t *testing.T) {
	zone := twoStabsZone(instanceconfig.UnitTactics{Type: "priorityRotation", Powers: []string{"Slash", "Stab"}})
	u, s := npcState("g1", pos(0, 0))
	u.Radius = 2.0
	u.PowerCooldowns = map[string]time.Time{"Slash": time.Now().Add(50 * time.Second)}
	playerID, _ := addPlayer(s, "map1", 0, 4)
	manualEngage(u, playerID)

	instance.ApplyUnitBehaviorsForTest(s, zone, dt)

	assert.Contains(t, u.PowerCooldowns, "Stab")
}

func TestUnitBehavior_Tactics_PriorityRotationFiresNothingWhenNoListedPowerIsUsable(t *testing.T) {
	zone := twoStabsZone(instanceconfig.UnitTactics{Type: "priorityRotation", Powers: []string{"Slash", "Stab"}})
	u, s := npcState("g1", pos(0, 0))
	u.Radius = 2.0
	u.PowerCooldowns = map[string]time.Time{
		"Slash": time.Now().Add(50 * time.Second),
		"Stab":  time.Now().Add(50 * time.Second),
	}
	playerID, p := addPlayer(s, "map1", 0, 4)
	manualEngage(u, playerID)

	instance.ApplyUnitBehaviorsForTest(s, zone, dt)

	assert.Equal(t, 100.0, p.Health)
}

func floatPtr(f float64) *float64 { return &f }

// phasedZone is a goblin whose Tactics is "phased": phase 0 (rotation,
// Stab only) transitions to phase 1 (priorityRotation, Slash only) after
// timeElapsedSecs seconds; phase 1 is last, so it never transitions
// further. Same two-power, long-cooldown shape as twoStabsZone, so which
// power fired is unambiguous from PowerCooldowns afterward.
func phasedZone(timeElapsedSecs float64) instanceconfig.Zone {
	amount := instanceconfig.ValueRange{2.0, 3.0}
	rng := instanceconfig.ZeroBasedValueRange{0, 5.0}
	return instanceconfig.Zone{
		UnitTypes: map[string]instanceconfig.UnitType{
			"goblin": {
				Name: "Goblin", SpeedFactor: 1.0, MaxHP: 10, TokenRadius: 2.0,
				Tactics: instanceconfig.UnitTactics{
					Type: "phased",
					Phases: []instanceconfig.Phase{
						{
							Tactics:    instanceconfig.UnitTactics{Type: "rotation", Powers: []string{"Stab"}},
							Transition: &instanceconfig.PhaseTransition{TimeElapsed: floatPtr(timeElapsedSecs)},
						},
						{
							Tactics: instanceconfig.UnitTactics{Type: "priorityRotation", Powers: []string{"Slash"}},
						},
					},
				},
				Powers: []instanceconfig.Power{
					{Name: "Stab", GlobalCooldown: 1.5, Cooldown: 100, Effects: []instanceconfig.PowerEffect{{Type: "harm", Amount: &amount, Range: &rng}}},
					{Name: "Slash", GlobalCooldown: 1.5, Cooldown: 100, Effects: []instanceconfig.PowerEffect{{Type: "harm", Amount: &amount, Range: &rng}}},
				},
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

func TestUnitBehavior_Tactics_PhasedUsesFirstPhaseInitially(t *testing.T) {
	zone := phasedZone(100.0) // won't transition within this test
	u, s := npcState("g1", pos(0, 0))
	u.Radius = 2.0
	playerID, _ := addPlayer(s, "map1", 0, 4)
	manualEngage(u, playerID)

	instance.ApplyUnitBehaviorsForTest(s, zone, dt)

	assert.Contains(t, u.PowerCooldowns, "Stab")
	assert.NotContains(t, u.PowerCooldowns, "Slash")
	assert.Equal(t, 0, u.Behavior.PhaseIndex)
}

func TestUnitBehavior_Tactics_PhasedTransitionsOnTimeElapsed(t *testing.T) {
	zone := phasedZone(0.5) // 5 ticks at dt=0.1
	u, s := npcState("g1", pos(0, 0))
	u.Radius = 2.0
	playerID, _ := addPlayer(s, "map1", 0, 4)
	manualEngage(u, playerID)

	// PhaseElapsed accumulates every call regardless of GCD/cooldown state -
	// no need to reset either between ticks.
	for i := 0; i < 5; i++ {
		instance.ApplyUnitBehaviorsForTest(s, zone, dt)
	}

	assert.Equal(t, 1, u.Behavior.PhaseIndex, "should have transitioned to phase 1 after 0.5s elapsed")
	assert.Equal(t, 0.0, u.Behavior.PhaseElapsed, "PhaseElapsed resets on transition")
}

func TestUnitBehavior_Tactics_PhasedLastPhaseNeverTransitionsFurther(t *testing.T) {
	zone := phasedZone(0.2) // 2 ticks
	u, s := npcState("g1", pos(0, 0))
	u.Radius = 2.0
	playerID, _ := addPlayer(s, "map1", 0, 4)
	manualEngage(u, playerID)

	for i := 0; i < 50; i++ { // well past the transition and beyond
		instance.ApplyUnitBehaviorsForTest(s, zone, dt)
	}

	assert.Equal(t, 1, u.Behavior.PhaseIndex, "the last phase should never advance past itself")
}

func TestUnitBehavior_Tactics_PhasedDelegatesToActivePhasesOwnTactics(t *testing.T) {
	zone := phasedZone(0.2)
	u, s := npcState("g1", pos(0, 0))
	u.Radius = 2.0
	playerID, _ := addPlayer(s, "map1", 0, 4)
	manualEngage(u, playerID)

	// First tick: still phase 0 (rotation, Stab only).
	instance.ApplyUnitBehaviorsForTest(s, zone, dt)
	assert.Contains(t, u.PowerCooldowns, "Stab")

	// Advance past the transition, then reset cooldowns/GCD to give the new
	// phase's tactics (priorityRotation, Slash only) a clean shot.
	instance.ApplyUnitBehaviorsForTest(s, zone, dt)
	require.Equal(t, 1, u.Behavior.PhaseIndex)
	u.GlobalCooldownEndsAt = time.Time{}
	u.PowerCooldowns = map[string]time.Time{}

	instance.ApplyUnitBehaviorsForTest(s, zone, dt)
	assert.Contains(t, u.PowerCooldowns, "Slash", "phase 1's own priorityRotation tactics should now be in effect")
}

func TestUnitBehavior_Tactics_PhasedTransitionsOnHealthBelow(t *testing.T) {
	zone := phasedZone(1000.0) // time-based transition never fires in this test
	zone.UnitTypes["goblin"].Tactics.Phases[0].Transition = &instanceconfig.PhaseTransition{HealthBelow: floatPtr(0.5)}
	u, s := npcState("g1", pos(0, 0))
	u.Radius = 2.0
	u.Health = 4 // 4/10 = 0.4, already below 0.5
	playerID, _ := addPlayer(s, "map1", 0, 4)
	manualEngage(u, playerID)

	instance.ApplyUnitBehaviorsForTest(s, zone, dt)

	assert.Equal(t, 1, u.Behavior.PhaseIndex)
}

func TestUnitBehavior_Tactics_PhasedScriptedSubPhaseIsANoOpNotACrash(t *testing.T) {
	zone := phasedZone(100.0)
	zone.UnitTypes["goblin"].Tactics.Phases[0].Tactics = instanceconfig.UnitTactics{Type: "scripted", Duration: 10.0}
	u, s := npcState("g1", pos(0, 0))
	u.Radius = 2.0
	playerID, p := addPlayer(s, "map1", 0, 4)
	manualEngage(u, playerID)

	assert.NotPanics(t, func() { instance.ApplyUnitBehaviorsForTest(s, zone, dt) })
	assert.Equal(t, 100.0, p.Health)
}

// costlyStabZone is stabZone with a resource cost added to Stab.
func costlyStabZone(costAmount float64) instanceconfig.Zone {
	zone := stabZone()
	ut := zone.UnitTypes["goblin"]
	ut.Powers[0].CostType = "energy"
	ut.Powers[0].CostAmount = costAmount
	zone.UnitTypes["goblin"] = ut
	return zone
}

// selfResourceZone builds a zone with a single hostile goblin whose only
// power restores/drains its own resource.
func selfResourceZone(delta float64) instanceconfig.Zone {
	return instanceconfig.Zone{
		UnitTypes: map[string]instanceconfig.UnitType{
			"goblin": {
				Name: "Goblin", SpeedFactor: 1.0, MaxHP: 10, TokenRadius: 2.0,
				Powers: []instanceconfig.Power{{
					Name: "Focus", GlobalCooldown: 1.5,
					Effects: []instanceconfig.PowerEffect{
						{Type: "resource", Affects: "self", ResourceName: "energy", Delta: delta},
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

func TestUnitBehavior_Attack_InsufficientResourceIsNoOp(t *testing.T) {
	zone := costlyStabZone(30.0)
	u, s := npcState("g1", pos(0, 0))
	u.Radius = 2.0
	setEnergy(u, 10.0, 100.0)
	playerID, p := addPlayer(s, "map1", 0, 4)
	manualEngage(u, playerID)

	instance.ApplyUnitBehaviorsForTest(s, zone, dt)

	assert.Equal(t, 100.0, p.Health)
	assert.Equal(t, 10.0, energy(u), "an unaffordable attack shouldn't spend anything either")
	assert.True(t, u.GlobalCooldownEndsAt.IsZero())
}

func TestUnitBehavior_Attack_SufficientResourceSpendsCost(t *testing.T) {
	for i := 0; i < 200; i++ {
		zone := costlyStabZone(30.0)
		u, s := npcState("g1", pos(0, 0))
		u.Radius = 2.0
		setEnergy(u, 100.0, 100.0)
		playerID, p := addPlayer(s, "map1", 0, 4)
		manualEngage(u, playerID)

		instance.ApplyUnitBehaviorsForTest(s, zone, dt)

		if p.Health < 100.0 {
			assert.Equal(t, 70.0, energy(u))
			return
		}
	}
	t.Fatal("Stab missed 200 times in a row - miss chance may be miscalibrated")
}

func TestUnitBehavior_Attack_ResourceEffectRestoresSelfResource(t *testing.T) {
	zone := selfResourceZone(15.0)
	u, s := npcState("g1", pos(0, 0))
	u.Radius = 2.0
	setEnergy(u, 10.0, 100.0)
	playerID, _ := addPlayer(s, "map1", 0, 4)
	manualEngage(u, playerID)

	instance.ApplyUnitBehaviorsForTest(s, zone, dt)

	assert.Equal(t, 25.0, energy(u))
}

func TestUnitBehavior_Attack_ResourceEffectClampsAtMax(t *testing.T) {
	zone := selfResourceZone(50.0)
	u, s := npcState("g1", pos(0, 0))
	u.Radius = 2.0
	setEnergy(u, 90.0, 100.0)
	playerID, _ := addPlayer(s, "map1", 0, 4)
	manualEngage(u, playerID)

	instance.ApplyUnitBehaviorsForTest(s, zone, dt)

	assert.Equal(t, 100.0, energy(u))
}

func TestUnitBehavior_Attack_FiresEveryEffectOfTheChosenPowerTogether(t *testing.T) {
	status := instanceconfig.Status{Name: "Dazed", ShortName: "Dazed", TreatAs: "debuff", Stacking: "replace"}

	// The debuff can be resisted (a harmful status rolls the same miss
	// chance harm does) - retry past that so this test asserts both
	// effects fired together, not just the harm half.
	for i := 0; i < 200; i++ {
		zone := poundZone(status)
		u, s := npcState("g1", pos(0, 0))
		u.Radius = 2.0
		playerID, p := addPlayer(s, "map1", 0, 4)
		manualEngage(u, playerID)

		instance.ApplyUnitBehaviorsForTest(s, zone, dt)

		if p.Health < 100.0 && len(p.ActiveStatusEffects) == 1 {
			return
		}
	}
	t.Fatal("Pound's debuff resisted 200 times in a row - resist chance may be miscalibrated")
}

func TestUnitBehavior_Attack_DebuffStatusCanBeResisted(t *testing.T) {
	zone := targetStatusZone(instanceconfig.Status{Name: "Dazed", ShortName: "Dazed", TreatAs: "debuff", Stacking: "replace"})

	for i := 0; i < 200; i++ {
		u, s := npcState("g1", pos(0, 0))
		u.Radius = 2.0
		playerID, p := addPlayer(s, "map1", 0, 4)
		manualEngage(u, playerID)

		instance.ApplyUnitBehaviorsForTest(s, zone, dt)

		if len(p.ActiveStatusEffects) == 0 {
			return // resisted
		}
	}
	t.Fatal("Dazed landed 200 times in a row - resist chance may be miscalibrated")
}

func TestUnitBehavior_Attack_AppliesSelfStatus(t *testing.T) {
	zone := selfStatusZone(instanceconfig.Status{Name: "Enraged", ShortName: "Enrage", TreatAs: "buff", Stacking: "replace"})
	u, s := npcState("g1", pos(0, 0))
	u.Radius = 2.0
	playerID, p := addPlayer(s, "map1", 0, 4)
	manualEngage(u, playerID)

	instance.ApplyUnitBehaviorsForTest(s, zone, dt)

	require.Len(t, u.ActiveStatusEffects, 1)
	assert.Equal(t, "Enraged", u.ActiveStatusEffects[0].Status.Name)
	assert.Empty(t, p.ActiveStatusEffects, "a self-affecting status shouldn't touch the target")
}

func TestUnitBehavior_Attack_AppliesStatusToTarget(t *testing.T) {
	zone := targetStatusZone(instanceconfig.Status{Name: "Dazed", ShortName: "Dazed", TreatAs: "debuff", Stacking: "replace"})

	// A harmful (debuff) status rolls the same resist chance harm does -
	// retry past an occasional resist to keep this deterministic.
	for i := 0; i < 200; i++ {
		u, s := npcState("g1", pos(0, 0))
		u.Radius = 2.0
		playerID, p := addPlayer(s, "map1", 0, 4)
		manualEngage(u, playerID)

		instance.ApplyUnitBehaviorsForTest(s, zone, dt)

		if len(p.ActiveStatusEffects) == 0 {
			continue // resisted
		}
		e := p.ActiveStatusEffects[0]
		assert.Equal(t, "Dazed", e.Status.Name)
		var goblinID uuid.UUID
		for id, unit := range s.Units {
			if unit == u {
				goblinID = id
			}
		}
		assert.Equal(t, goblinID, e.ApplierID)
		assert.Empty(t, u.ActiveStatusEffects)
		return
	}
	t.Fatal("Dazed resisted 200 times in a row - resist chance may be miscalibrated")
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

func TestUnitBehavior_Chase_DetoursAroundWallWhenPathGraphAvailable(t *testing.T) {
	zone := basicAttackZone(4.0, 1.0) // goblin TokenRadius: 2.0
	// A short wall directly between the NPC and the player, with open ends
	// close by (unlike withWallAt's full-width wall) - detouring around
	// either end should be much cheaper than plowing straight into it.
	zone.Maps[0].Barriers = []instanceconfig.Barrier{{
		Type: "wall",
		Locations: []instanceconfig.Location{
			{X: -3, Y: 5}, {X: 3, Y: 5},
		},
	}}
	graph, err := pathing.Build(zone, 1.0)
	require.NoError(t, err)

	u, s := npcState("g1", pos(0, 0))
	u.Radius = 2.0
	playerID, _ := addPlayer(s, "map1", 0, 10)
	manualEngage(u, playerID)

	instance.ApplyUnitBehaviorsWithPathGraphForTest(s, zone, dt, graph)

	// A blind straight-line chase would move purely along Y (X stays 0);
	// routing around the wall's end requires moving in X too.
	assert.NotEqual(t, 0.0, u.Position.X, "should be heading toward the wall's open end, not straight into it")
	assert.Greater(t, u.Position.Y, 0.0)
}

func TestUnitBehavior_Chase_TreatsGrazingCornerAsBlockedWhenPathGraphAvailable(t *testing.T) {
	// The raw zero-width line between these two points passes just past the
	// wall's east endpoint (3,5) without technically crossing the wall
	// segment, so instanceconfig.LineOfSightClear alone reports clear - but
	// a radius-2 body sweeping that same line would clip the corner. The
	// movement decision must not treat a merely-line-of-sight-clear path as
	// walkable straight-line if a body of this size can't actually fit.
	zone := basicAttackZone(4.0, 1.0) // goblin TokenRadius: 2.0
	zone.Maps[0].Barriers = []instanceconfig.Barrier{{
		Type: "wall",
		Locations: []instanceconfig.Location{
			{X: -3, Y: 5}, {X: 3, Y: 5},
		},
	}}
	graph, err := pathing.Build(zone, 1.0)
	require.NoError(t, err)

	u, s := npcState("g1", pos(10, 0))
	u.Radius = 2.0
	playerID, _ := addPlayer(s, "map1", -2, 10)
	manualEngage(u, playerID)

	require.True(t, instanceconfig.LineOfSightClear(zone, "map1", 10, 0, -2, 10),
		"sanity check: the raw ray should read as clear for this test to mean anything")

	instance.ApplyUnitBehaviorsWithPathGraphForTest(s, zone, dt, graph)

	assert.NotEmpty(t, u.Behavior.PathWaypoints, "should have switched to path-following instead of a naive straight chase")
}

func TestUnitBehavior_Chase_HoldsPositionWhenNoRouteExists(t *testing.T) {
	// The NPC is sealed inside a walled box with no gap; the target is
	// outside, unreachable by any route. Blindly walking straight at a
	// target FindPath already confirmed has no path would just be grinding
	// into the wall that's sealing the unit in - it should hold position
	// instead and wait for something to change.
	zone := basicAttackZone(4.0, 1.0) // goblin TokenRadius: 2.0
	zone.Maps[0].Barriers = []instanceconfig.Barrier{{
		Type: "wall",
		Locations: []instanceconfig.Location{
			{X: -2, Y: -2}, {X: 2, Y: -2}, {X: 2, Y: 2}, {X: -2, Y: 2}, {X: -2, Y: -2},
		},
	}}
	graph, err := pathing.Build(zone, 0.3)
	require.NoError(t, err)

	u, s := npcState("g1", pos(0, 0))
	u.Radius = 0.3
	playerID, _ := addPlayer(s, "map1", 0, 20) // well outside the sealed box
	manualEngage(u, playerID)

	instance.ApplyUnitBehaviorsWithPathGraphForTest(s, zone, dt, graph)

	assert.Equal(t, 0.0, u.Position.X)
	assert.Equal(t, 0.0, u.Position.Y)
}

func TestUnitBehavior_Chase_DifferentSizeBucketsRouteIndependently(t *testing.T) {
	// A 3ft-wide doorway (gap between two walls): comfortably wide enough
	// for a 1ft-radius unit, too narrow for a 5ft-radius one. Both chase
	// the same player through it; each should be routed according to its
	// own actual size, not a single shared map-wide radius.
	zone := instanceconfig.Zone{
		UnitTypes: map[string]instanceconfig.UnitType{
			"rat":  {Name: "Rat", SpeedFactor: 1.0, MaxHP: 5, TokenRadius: 1},
			"ogre": {Name: "Ogre", SpeedFactor: 1.0, MaxHP: 50, TokenRadius: 5},
		},
		Maps: []instanceconfig.Map{{
			Identifier: "map1",
			Units: []instanceconfig.Unit{
				{Identifier: "r1", UnitType: "rat", Position: pos(0, -5), Hostility: "hostile"},
				{Identifier: "o1", UnitType: "ogre", Position: pos(0, -8), Hostility: "hostile"},
			},
			Barriers: []instanceconfig.Barrier{
				{Type: "wall", Locations: []instanceconfig.Location{{X: -20, Y: 5}, {X: -1.5, Y: 5}}},
				{Type: "wall", Locations: []instanceconfig.Location{{X: 1.5, Y: 5}, {X: 20, Y: 5}}},
			},
		}},
	}
	graph, err := pathing.Build(zone, 1.0)
	require.NoError(t, err)

	rat, s := npcState("r1", pos(0, -5))
	rat.Radius = 1.0
	ogreID := uuid.New()
	s.Units[ogreID] = &instancestate.UnitState{
		ZoneUnitIdentifier: "o1", MapIdentifier: "map1", Position: pos(0, -8),
		Status: instancestate.UnitStatusIdle, Health: 50, MaxHealth: 50, Radius: 5.0,
	}
	ogre := s.Units[ogreID]

	playerID, _ := addPlayer(s, "map1", 0, 15)
	manualEngage(rat, playerID)
	manualEngage(ogre, playerID)

	instance.ApplyUnitBehaviorsWithPathGraphForTest(s, zone, dt, graph)

	assert.Empty(t, rat.Behavior.PathWaypoints, "rat fits through the doorway and should go straight for the player")
	assert.NotEmpty(t, ogre.Behavior.PathWaypoints, "ogre doesn't fit through the doorway and must detour")
}

func TestUnitBehavior_Chase_RecomputesPathWhenShovedOffStaleWaypoint(t *testing.T) {
	// Simulates crowd separation (applyNPCSeparation) having shoved a
	// mid-detour unit back onto the wrong side of a wall it had just
	// rounded, while it still had a stale waypoint queued pointing straight
	// at the (now blocked again) target. Without a per-tick sanity check,
	// the unit would blindly keep closing on that stale waypoint - straight
	// into the wall - until the next scheduled path recalculation.
	zone := basicAttackZone(4.0, 1.0) // goblin TokenRadius: 2.0
	zone.Maps[0].Barriers = []instanceconfig.Barrier{{
		Type: "wall",
		Locations: []instanceconfig.Location{
			{X: -3, Y: 5}, {X: 3, Y: 5},
		},
	}}
	graph, err := pathing.Build(zone, 1.0)
	require.NoError(t, err)

	u, s := npcState("g1", pos(2, 2)) // back on the near side of the wall, clear of its radius-2 clearance zone
	u.Radius = 2.0
	playerID, _ := addPlayer(s, "map1", 0, 10) // far side of the wall
	manualEngage(u, playerID)

	u.Behavior.PathWaypoints = []pathing.Point{{X: 0, Y: 10}} // stale: straight through the wall
	u.Behavior.PathRecalcIn = 0.5                             // recalculation not due yet on its own

	instance.ApplyUnitBehaviorsWithPathGraphForTest(s, zone, dt, graph)

	require.NotEmpty(t, u.Behavior.PathWaypoints)
	assert.NotEqual(t, pathing.Point{X: 0, Y: 10}, u.Behavior.PathWaypoints[0],
		"stale waypoint straight through the wall should have been discarded and recomputed")
}

// wallZoneAndChaser sets up a goblin at (0,0) engaged with a player at
// (0,10) on the far side of a short wall, with a pathing graph.
func wallZoneAndChaser(t *testing.T) (*instancestate.UnitState, *instancestate.InstanceState, instanceconfig.Zone, *pathing.Graph) {
	t.Helper()
	zone := basicAttackZone(4.0, 1.0)
	zone.Maps[0].Barriers = []instanceconfig.Barrier{{
		Type:      "wall",
		Locations: []instanceconfig.Location{{X: -3, Y: 5}, {X: 3, Y: 5}},
	}}
	graph, err := pathing.Build(zone, 1.0)
	require.NoError(t, err)

	u, s := npcState("g1", pos(0, 0))
	u.Radius = 2.0
	playerID, _ := addPlayer(s, "map1", 0, 10)
	manualEngage(u, playerID)
	return u, s, zone, graph
}

func TestUnitBehavior_Chase_ExpiredTimerKeepsCachedPathWhileTargetHasNotMoved(t *testing.T) {
	u, s, zone, graph := wallZoneAndChaser(t)

	cached := pathing.Point{X: 8, Y: 3} // clear from (0,0), and not what a fresh search would pick
	u.Behavior.PathWaypoints = []pathing.Point{cached}
	u.Behavior.PathRecalcIn = 0 // timer expired
	u.Behavior.PathGoalX, u.Behavior.PathGoalY = 0, 10

	instance.ApplyUnitBehaviorsWithPathGraphForTest(s, zone, dt, graph)

	assert.Equal(t, cached, u.Behavior.PathWaypoints[0], "target hasn't moved, so no new search")
}

func TestUnitBehavior_Chase_ExpiredTimerReplansOnceTargetHasMoved(t *testing.T) {
	u, s, zone, graph := wallZoneAndChaser(t)

	cached := pathing.Point{X: 8, Y: 3}
	u.Behavior.PathWaypoints = []pathing.Point{cached}
	u.Behavior.PathRecalcIn = 0
	u.Behavior.PathGoalX, u.Behavior.PathGoalY = 0, 25 // planned when the target was well away from (0,10)

	instance.ApplyUnitBehaviorsWithPathGraphForTest(s, zone, dt, graph)

	assert.NotEqual(t, cached, u.Behavior.PathWaypoints[0])
	assert.Equal(t, 10.0, u.Behavior.PathGoalY, "records where the target was for this plan")
}

func TestUnitBehavior_Chase_PathSearchesPerTickAreCapped(t *testing.T) {
	const chasers = 40
	zone := basicAttackZone(4.0, 1.0)
	zone.Maps[0].Barriers = []instanceconfig.Barrier{{
		Type:      "wall",
		Locations: []instanceconfig.Location{{X: -100, Y: 5}, {X: 100, Y: 5}}, // long: every chaser is blocked from the player
	}}
	zone.Maps[0].Units = nil
	_, s := npcState("unused", pos(0, 0))
	s.Units = map[uuid.UUID]*instancestate.UnitState{}
	playerID, _ := addPlayer(s, "map1", 0, 10)

	var units []*instancestate.UnitState
	for i := range chasers {
		id := fmt.Sprintf("g%d", i)
		// Spaced on a grid wider than two radii so crowd separation leaves them be.
		at := pos(float64(i%9-4)*5, -float64(i/9)*5)
		zone.Maps[0].Units = append(zone.Maps[0].Units, instanceconfig.Unit{
			Identifier: id, UnitType: "goblin", Position: at, Hostility: "hostile",
		})
		u, _ := npcState(id, at)
		u.Radius = 2.0
		manualEngage(u, playerID)
		s.Units[uuid.New()] = u
		units = append(units, u)
	}
	graph, err := pathing.Build(zone, 1.0)
	require.NoError(t, err)

	instance.ApplyUnitBehaviorsWithPathGraphForTest(s, zone, dt, graph)

	planned := 0
	for _, u := range units {
		if len(u.Behavior.PathWaypoints) > 0 {
			planned++
		}
	}
	assert.Equal(t, instance.MaxPathSearchesPerTickForTest, planned, "only the per-tick budget of units gets a fresh path")

	instance.ApplyUnitBehaviorsWithPathGraphForTest(s, zone, dt, graph)
	planned = 0
	for _, u := range units {
		if len(u.Behavior.PathWaypoints) > 0 {
			planned++
		}
	}
	assert.Equal(t, 2*instance.MaxPathSearchesPerTickForTest, planned, "the rest catch up on later ticks")
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

func TestUnitBehavior_BasicAttack_ActiveStatStatusScalesDamageDone(t *testing.T) {
	// Mirrors goblin-cave content's own Enrage status (damageDone multiply
	// 1.1) - #108's concrete NPC-side case.
	zone := basicAttackZone(4.0, 1.0) // same as TestUnitBehavior_BasicAttack_DamagesPlayerInRange

	for i := 0; i < 200; i++ {
		u, s := npcState("g1", pos(0, 0))
		u.Radius = 2.0
		u.ActiveStatusEffects = []instancestate.ActiveStatusEffect{
			{Status: instanceconfig.Status{Effects: []instanceconfig.StatusEffect{
				{Type: "stat", StatName: "damageDone", ModifierType: "multiply", Amount: 5.0},
			}}},
		}
		playerID, p := addPlayer(s, "map1", 0, 4)
		manualEngage(u, playerID)

		instance.ApplyUnitBehaviorsForTest(s, zone, dt)

		if p.Health == 100.0 {
			continue // missed - retry
		}
		// Unbuffed, a 4-dps hit leaves health around [95.4, 96.6] (+/-15%
		// variance on a mean-4 hit). A 5x damageDone multiplier should pull
		// that well below 90 - a clean discriminator without risking the
		// health-can't-go-negative clamp at very high multipliers.
		assert.Less(t, p.Health, 90.0)
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
				Connections: []instanceconfig.MapConnection{
					{Identifier: "exit", Type: "point", Position: &instanceconfig.Position{X: 0, Y: 10}},
				},
			},
			{
				Identifier: "map2",
				Connections: []instanceconfig.MapConnection{
					{Identifier: "entrance", Type: "point", Position: &instanceconfig.Position{X: 0, Y: -10}},
				},
			},
		},
		ZoneLinks: []instanceconfig.ZoneLink{
			{
				ConnectionA: instanceconfig.ConnectionIdentifier{Map: "map1", Connection: "exit"},
				ConnectionB: instanceconfig.ConnectionIdentifier{Map: "map2", Connection: "entrance"},
			},
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

func TestUnitBehavior_Chase_EventuallyCrossesConnectionDespiteStaleLastSeen(t *testing.T) {
	// Regression: applyMapTransitions runs before applyUnitBehaviors each
	// tick, so on the tick a target actually crosses, Behavior.LastSeenX/Y
	// never gets a final update - it's frozen wherever the target was one
	// tick earlier. At normal player speed that's easily farther than a
	// connection's own trigger radius, so a chase that heads straight for
	// that stale point (rather than the connection itself) gets right next
	// to the connection and then stops forever, never actually crossing.
	zone := instanceconfig.Zone{
		UnitTypes: map[string]instanceconfig.UnitType{
			"goblin": {Name: "Goblin", SpeedFactor: 1.0, MaxHP: 10},
		},
		Maps: []instanceconfig.Map{
			{
				Identifier: "map1",
				Units: []instanceconfig.Unit{{
					Identifier: "g1", UnitType: "goblin", Position: pos(0, 0), Hostility: "hostile",
				}},
				Connections: []instanceconfig.MapConnection{
					{Identifier: "exit", Type: "point", Position: &instanceconfig.Position{X: 0, Y: 10}, FuzzRadius: 1.5},
				},
			},
			{
				Identifier: "map2",
				Connections: []instanceconfig.MapConnection{
					{Identifier: "entrance", Type: "point", Position: &instanceconfig.Position{X: 0, Y: -10}, FuzzRadius: 1.5},
				},
			},
		},
		ZoneLinks: []instanceconfig.ZoneLink{{
			ConnectionA: instanceconfig.ConnectionIdentifier{Map: "map1", Connection: "exit"},
			ConnectionB: instanceconfig.ConnectionIdentifier{Map: "map2", Connection: "entrance"},
		}},
	}
	graph, err := pathing.Build(zone, 1.0)
	require.NoError(t, err)

	u, s := npcState("g1", pos(0, 0))
	playerID, _ := addPlayer(s, "map2", 0, 0) // player already across
	manualEngage(u, playerID)
	// Stale by more than the connection's 1.5ft trigger radius - exactly
	// the gap a real tick of player movement leaves behind.
	u.Behavior.LastSeenX, u.Behavior.LastSeenY = 0, 8

	prev := s.Clone()
	for range 50 {
		instance.ApplyMapTransitionsForTest(s, prev, zone)
		prev = s.Clone()
		instance.ApplyUnitBehaviorsWithPathGraphForTest(s, zone, dt, graph)
		if u.MapIdentifier == "map2" {
			return
		}
	}
	t.Fatal("NPC never crossed to map2 despite a known connection leading there")
}

func TestUnitBehavior_Chase_LastSeenDetoursAroundWallWhenPathGraphAvailable(t *testing.T) {
	zone := twoMapZone()
	// A short wall directly between the NPC and map1's exit connection (at
	// (0,10), where the target has since crossed through to map2), with
	// open ends close by.
	zone.Maps[0].Barriers = []instanceconfig.Barrier{{
		Type: "wall",
		Locations: []instanceconfig.Location{
			{X: -3, Y: 5}, {X: 3, Y: 5},
		},
	}}
	graph, err := pathing.Build(zone, 1.0)
	require.NoError(t, err)

	u, s := npcState("g1", pos(0, 0))
	playerID, _ := addPlayer(s, "map2", 0, 0) // player already on the other map
	manualEngage(u, playerID)

	instance.ApplyUnitBehaviorsWithPathGraphForTest(s, zone, dt, graph)

	assert.NotEqual(t, 0.0, u.Position.X, "should be heading toward the wall's open end, not straight into it")
	assert.Greater(t, u.Position.Y, 0.0)
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
