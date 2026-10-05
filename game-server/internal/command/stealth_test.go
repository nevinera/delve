package command

import (
	"testing"

	"github.com/stretchr/testify/assert"

	"github.com/delve-mmo/game-server/internal/instanceconfig"
	"github.com/delve-mmo/game-server/internal/instancestate"
)

func stealthTestZone(stealth float64) instanceconfig.Zone {
	return instanceconfig.Zone{
		Elvl:      10,
		UnitTypes: map[string]instanceconfig.UnitType{"sneak": {Stealth: &stealth}},
	}
}

// observerAt is a player at the origin facing north (+y), with gear at elvl.
func observerAt(elvl float64) *instancestate.UnitState {
	return &instancestate.UnitState{
		ZoneUnitIdentifier: "player:p", MapIdentifier: "m",
		CombatStats: &instancestate.CombatStats{Elvl: elvl},
	}
}

func sneakAt(x, y float64) *instancestate.UnitState {
	return &instancestate.UnitState{
		UnitTypeIdentifier: "sneak", Hostility: "hostile", MapIdentifier: "m",
		Position: instanceconfig.Position{X: x, Y: y}, Stealthed: true,
	}
}

func TestStealthVisibility_FrontRanges(t *testing.T) {
	zone := stealthTestZone(0) // even gap: full to 15 ft, faint to 24
	obs := observerAt(10)
	assert.Equal(t, VisibilityFull, StealthVisibility(obs, sneakAt(0, 14), zone))
	assert.Equal(t, VisibilityFaint, StealthVisibility(obs, sneakAt(0, 20), zone))
	assert.Equal(t, VisibilityHidden, StealthVisibility(obs, sneakAt(0, 30), zone))
}

func TestStealthVisibility_RearIsAThird(t *testing.T) {
	zone := stealthTestZone(0) // behind: full to 5 ft (point-blank anyway), faint to 8
	obs := observerAt(10)
	assert.Equal(t, VisibilityFaint, StealthVisibility(obs, sneakAt(0, -7), zone))
	assert.Equal(t, VisibilityHidden, StealthVisibility(obs, sneakAt(0, -10), zone))
	// Facing the other way flips it.
	obs.Position.Angle = 180
	assert.Equal(t, VisibilityFull, StealthVisibility(obs, sneakAt(0, -10), zone))
}

func TestStealthVisibility_PointBlankFromAnyDirection(t *testing.T) {
	zone := stealthTestZone(100) // stealth so high nothing's detected at range
	obs := observerAt(10)
	assert.Equal(t, VisibilityFull, StealthVisibility(obs, sneakAt(-4, -2), zone))
	assert.Equal(t, VisibilityHidden, StealthVisibility(obs, sneakAt(0, 6), zone))
}

func TestStealthVisibility_RatingAndElevationShiftRange(t *testing.T) {
	sneak := sneakAt(0, 18)
	assert.Equal(t, VisibilityFaint, StealthVisibility(observerAt(10), sneak, stealthTestZone(0)))
	// Over-geared by 6: full range 18 ft.
	assert.Equal(t, VisibilityFull, StealthVisibility(observerAt(16), sneak, stealthTestZone(0)))
	// Stealth 10 shrinks full range to 10 ft, faint to 16.
	assert.Equal(t, VisibilityHidden, StealthVisibility(observerAt(10), sneak, stealthTestZone(10)))
}

func TestStealthVisibility_UnstealthedOrOtherMap(t *testing.T) {
	zone := stealthTestZone(0)
	sneak := sneakAt(0, 100)
	sneak.Stealthed = false
	assert.Equal(t, VisibilityFull, StealthVisibility(observerAt(10), sneak, zone))
	near := sneakAt(0, 1)
	near.MapIdentifier = "other"
	assert.Equal(t, VisibilityHidden, StealthVisibility(observerAt(10), near, zone))
}
