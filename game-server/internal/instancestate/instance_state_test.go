package instancestate_test

import (
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/delve-mmo/game-server/internal/instancestate"
	"github.com/delve-mmo/game-server/internal/instanceconfig"
)

var testUnitType = instanceconfig.UnitType{
	Name:        "Goblin",
	TokenRadius: 1.0,
	MaxHP:       100,
	Resource: instanceconfig.ResourceType{
		Name:         "Energy",
		Max:          50,
		DefaultValue: 25,
	},
	Targeting: instanceconfig.UnitTargeting{Type: "nearest"},
	Tactics:   instanceconfig.UnitTactics{Type: "randomAvailable"},
}

// zoneWith builds a single-map zone using testUnitType for all units.
func zoneWith(units ...instanceconfig.Unit) instanceconfig.Zone {
	return instanceconfig.Zone{
		Name:      "Test Zone",
		Maps:      []instanceconfig.Map{{Identifier: "m1", Name: "Map 1", Units: units}},
		UnitTypes: map[string]instanceconfig.UnitType{"goblin": testUnitType},
	}
}

func TestNewInstanceState(t *testing.T) {
	tests := []struct {
		name      string
		zone      instanceconfig.Zone
		wantCount int
		wantErr   string
	}{
		{
			name:      "no units produces empty state",
			zone:      zoneWith(),
			wantCount: 0,
		},
		{
			name:    "unit missing identifier returns error",
			zone:    zoneWith(instanceconfig.Unit{UnitType: "goblin"}),
			wantErr: `unit on map "m1" has no identifier`,
		},
		{
			name:    "unit with unknown unit type returns error",
			zone:    zoneWith(instanceconfig.Unit{Identifier: "u1", UnitType: "unknown"}),
			wantErr: `unknown unit type "unknown"`,
		},
		{
			name:      "single valid unit is spawned",
			zone:      zoneWith(instanceconfig.Unit{Identifier: "u1", UnitType: "goblin"}),
			wantCount: 1,
		},
		{
			name: "units across multiple maps are all spawned",
			zone: instanceconfig.Zone{
				Name: "Two-Map Zone",
				Maps: []instanceconfig.Map{
					{Identifier: "m1", Name: "Map 1", Units: []instanceconfig.Unit{
						{Identifier: "u1", UnitType: "goblin"},
						{Identifier: "u2", UnitType: "goblin"},
					}},
					{Identifier: "m2", Name: "Map 2", Units: []instanceconfig.Unit{
						{Identifier: "u3", UnitType: "goblin"},
					}},
				},
				UnitTypes: map[string]instanceconfig.UnitType{"goblin": testUnitType},
			},
			wantCount: 3,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			state, err := instancestate.NewInstanceState(tt.zone)
			if tt.wantErr != "" {
				require.Error(t, err)
				assert.Contains(t, err.Error(), tt.wantErr)
				return
			}
			require.NoError(t, err)
			assert.Len(t, state.Units, tt.wantCount)
		})
	}
}

func TestNewInstanceState_UnitFields(t *testing.T) {
	pos := instanceconfig.Position{X: 10, Y: 20, Angle: 90}
	state, err := instancestate.NewInstanceState(zoneWith(
		instanceconfig.Unit{
			Identifier:        "u1",
			UnitType:          "goblin",
			Position:          pos,
			CurrentHPFraction: 0.5,
		},
	))
	require.NoError(t, err)
	require.Len(t, state.Units, 1)

	var u *instancestate.UnitState
	for _, unit := range state.Units {
		u = unit
	}

	assert.Equal(t, "u1", u.ZoneUnitIdentifier)
	assert.Equal(t, "goblin", u.UnitTypeIdentifier)
	assert.Equal(t, "m1", u.MapIdentifier)
	assert.Equal(t, pos, u.Position)
	assert.Equal(t, pos, u.SpawnPoint)
	assert.Equal(t, 50.0, u.Health)    // 100 * 0.5
	assert.Equal(t, 100.0, u.MaxHealth)
	assert.Equal(t, 25.0, u.Resource)  // Resource.DefaultValue
	assert.Equal(t, 50.0, u.MaxResource)
	assert.Equal(t, instancestate.UnitStatusIdle, u.Status)
	assert.Nil(t, u.Target)
	assert.Empty(t, u.ActiveStatusEffects)
}

func TestNewInstanceState_DefaultHPFraction(t *testing.T) {
	// CurrentHPFraction is omitempty; a zero value means "use full health".
	state, err := instancestate.NewInstanceState(zoneWith(
		instanceconfig.Unit{Identifier: "u1", UnitType: "goblin"},
	))
	require.NoError(t, err)

	var u *instancestate.UnitState
	for _, unit := range state.Units {
		u = unit
	}

	assert.Equal(t, 100.0, u.Health)
	assert.Equal(t, 100.0, u.MaxHealth)
}

func TestNewInstanceState_EachUnitGetsDistinctUUID(t *testing.T) {
	state, err := instancestate.NewInstanceState(zoneWith(
		instanceconfig.Unit{Identifier: "u1", UnitType: "goblin"},
		instanceconfig.Unit{Identifier: "u2", UnitType: "goblin"},
	))
	require.NoError(t, err)
	assert.Len(t, state.Units, 2)
	// Distinct keys in the map guarantee distinct UUIDs by construction.
}
