package zoneconfig_test

import (
	"encoding/json"
	"os"
	"testing"

	"github.com/delve-mmo/game-server/internal/zoneconfig"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func loadFixture(t *testing.T, name string) []byte {
	t.Helper()
	data, err := os.ReadFile("testdata/" + name)
	require.NoError(t, err, "loading fixture %s", name)
	return data
}

func parseZone(t *testing.T, data []byte) zoneconfig.Zone {
	t.Helper()
	var z zoneconfig.Zone
	require.NoError(t, json.Unmarshal(data, &z))
	return z
}

// --- Zone deserialization ---

func TestZone_ValidFull(t *testing.T) {
	z := parseZone(t, loadFixture(t, "valid_full.json"))

	assert.Equal(t, "Goblin Cave", z.Name)
	assert.Equal(t, "A damp cave carved out by generations of goblin raiders.", z.Description)
	assert.True(t, z.Private)
	assert.Len(t, z.Maps, 2)
	assert.Len(t, z.UnitTypes, 1)
	assert.Len(t, z.ZoneLinks, 1)
	assert.Len(t, z.EntryPoints, 1)
	assert.Len(t, z.OpenConnections, 1)

	t.Run("entry point key is null", func(t *testing.T) {
		key, ok := z.EntryPoints["entrance_tunnel/cave_mouth"]
		assert.True(t, ok)
		assert.Nil(t, key)
	})

	t.Run("open connection value", func(t *testing.T) {
		assert.Equal(t, "cliff_above", z.OpenConnections["main_chamber/landing_site"])
	})
}

func TestZone_ValidFull_Maps(t *testing.T) {
	z := parseZone(t, loadFixture(t, "valid_full.json"))
	m := z.Maps[0]

	assert.Equal(t, "entrance_tunnel", m.Identifier)
	assert.Equal(t, "Entrance Tunnel", m.Name)
	assert.Equal(t, 30.0, m.FeetDimensions.Width)
	assert.Equal(t, 22.5, m.FeetDimensions.Height)
	assert.Len(t, m.Barriers, 1)
	assert.Len(t, m.Connections, 2)
	assert.Len(t, m.Units, 2)
}

func TestZone_ValidFull_Barriers(t *testing.T) {
	z := parseZone(t, loadFixture(t, "valid_full.json"))
	b := z.Maps[0].Barriers[0]

	assert.Equal(t, "wall", b.Type)
	assert.Len(t, b.Locations, 5)
	assert.Equal(t, zoneconfig.Location{X: 0.0, Y: 0.0}, b.Locations[0])
	assert.Equal(t, zoneconfig.Location{X: 30.0, Y: 0.0}, b.Locations[1])
}

func TestZone_ValidFull_Connections(t *testing.T) {
	z := parseZone(t, loadFixture(t, "valid_full.json"))
	conns := z.Maps[0].Connections

	t.Run("line connection", func(t *testing.T) {
		assert.Equal(t, "cave_mouth", conns[0].Identifier)
		assert.Equal(t, "line", conns[0].Type)
		require.NotNil(t, conns[0].Start)
		assert.Equal(t, 8.0, conns[0].Start.X)
	})

	t.Run("point connection on second map", func(t *testing.T) {
		pointConn := z.Maps[1].Connections[1]
		assert.Equal(t, "landing_site", pointConn.Identifier)
		assert.Equal(t, "point", pointConn.Type)
		require.NotNil(t, pointConn.Position)
		assert.Equal(t, 30.0, pointConn.Position.X)
		assert.Equal(t, 3.0, pointConn.FuzzRadius)
		assert.Equal(t, 60.0, pointConn.FuzzAngle)
	})
}

func TestZone_ValidFull_Units(t *testing.T) {
	z := parseZone(t, loadFixture(t, "valid_full.json"))
	units := z.Maps[0].Units

	t.Run("patrol unit", func(t *testing.T) {
		u := units[0]
		assert.Equal(t, "goblin_raider", u.UnitType)
		assert.Equal(t, "hostile", u.Hostility)
		assert.Equal(t, "raider_a", u.Identifier)
		assert.Equal(t, []string{"raider_b"}, u.Links)
		assert.Equal(t, "patrol", u.Movement.Type)
		assert.Equal(t, "return", u.Movement.Choose)
		assert.Len(t, u.Movement.Steps, 2)
		assert.Equal(t, 0.4, u.Movement.Steps[0].MovementRate)
	})

	t.Run("wander unit", func(t *testing.T) {
		u := units[1]
		assert.Equal(t, "wander", u.Movement.Type)
		require.NotNil(t, u.Movement.Speed)
		assert.Equal(t, 0.3, u.Movement.Speed.Min())
		assert.Equal(t, 0.3, u.Movement.Speed.Max())
		require.NotNil(t, u.Movement.WaitTime)
		assert.Equal(t, 2.0, u.Movement.WaitTime.Min())
		assert.Equal(t, 5.0, u.Movement.WaitTime.Max())
	})
}

func TestZone_ValidFull_UnitType(t *testing.T) {
	z := parseZone(t, loadFixture(t, "valid_full.json"))
	ut := z.UnitTypes["goblin_raider"]

	assert.Equal(t, "Goblin Raider", ut.Name)
	assert.Equal(t, 1.5, ut.TokenRadius)
	assert.Equal(t, 1.2, ut.SpeedFactor)
	assert.Equal(t, 20, ut.MaxHP)
	assert.Len(t, ut.Powers, 1)
	assert.Equal(t, "nearest", ut.Targeting.Type)
	assert.Equal(t, "rotation", ut.Tactics.Type)
	assert.Equal(t, []string{"Slash"}, ut.Tactics.Powers)
}

func TestZone_ValidFull_ResourceType(t *testing.T) {
	z := parseZone(t, loadFixture(t, "valid_full.json"))
	r := z.UnitTypes["goblin_raider"].Resource

	assert.Equal(t, "energy", r.Name)
	assert.Equal(t, 100.0, r.Max)
	assert.Equal(t, 100.0, r.DefaultValue)
	assert.Equal(t, 10.0, r.ReturnRate)
	assert.True(t, r.IsFluid)
}

func TestZone_ValidFull_Power(t *testing.T) {
	z := parseZone(t, loadFixture(t, "valid_full.json"))
	p := z.UnitTypes["goblin_raider"].Powers[0]

	assert.Equal(t, "Slash", p.Name)
	assert.Equal(t, 5.0, p.MaxRange)
	assert.Nil(t, p.CastTime, "instant cast should be nil")
	assert.Equal(t, 1.0, p.GlobalCooldown)
	assert.Equal(t, "energy", p.CostType)
	assert.Equal(t, 40.0, p.CostAmount)
	assert.Len(t, p.Effects, 1)
}

func TestZone_ValidFull_PowerEffect(t *testing.T) {
	z := parseZone(t, loadFixture(t, "valid_full.json"))
	e := z.UnitTypes["goblin_raider"].Powers[0].Effects[0]

	assert.Equal(t, "harm", e.Type)
	assert.Equal(t, "bTarget", e.Affects)
	assert.Equal(t, []string{"physical", "melee"}, e.Tags)

	require.NotNil(t, e.Amount)
	assert.Equal(t, 2.0, e.Amount.Min())
	assert.Equal(t, 4.0, e.Amount.Max())

	require.NotNil(t, e.Range)
	assert.Equal(t, 0.0, e.Range.Min())
	assert.Equal(t, 5.0, e.Range.Max())
}

func TestZone_ValidFull_ZoneLink(t *testing.T) {
	z := parseZone(t, loadFixture(t, "valid_full.json"))
	link := z.ZoneLinks[0]

	assert.Equal(t, "entrance_tunnel", link.ConnectionA.Map)
	assert.Equal(t, "inner_door", link.ConnectionA.Connection)
	assert.Equal(t, "main_chamber", link.ConnectionB.Map)
	assert.False(t, link.OneWay)
	assert.Nil(t, link.RequiredKey)
}

func TestZone_ValidMinimal(t *testing.T) {
	z := parseZone(t, loadFixture(t, "valid_minimal.json"))

	assert.Equal(t, "Empty Room", z.Name)
	assert.False(t, z.Private)
	assert.Len(t, z.Maps, 1)
	assert.Empty(t, z.UnitTypes)
	assert.Empty(t, z.ZoneLinks)

	m := z.Maps[0]
	assert.Equal(t, "room", m.Identifier)
	assert.Equal(t, 20.0, m.FeetDimensions.Width)
}

func TestZone_UnknownKeysIgnored(t *testing.T) {
	var z zoneconfig.Zone
	err := json.Unmarshal(loadFixture(t, "unknown_keys.json"), &z)
	assert.NoError(t, err)
	assert.Equal(t, "Room With Extra Fields", z.Name)
}

func TestZone_MalformedJSON(t *testing.T) {
	var z zoneconfig.Zone
	err := json.Unmarshal(loadFixture(t, "malformed.json"), &z)
	assert.Error(t, err)
}

func TestZone_AssetReferenceRejected(t *testing.T) {
	var z zoneconfig.Zone
	err := json.Unmarshal(loadFixture(t, "asset_reference.json"), &z)
	assert.Error(t, err)
	assert.Contains(t, err.Error(), "$ref")
	assert.Contains(t, err.Error(), "fully-resolved")
}

// --- ValueRange ---

func TestValueRange(t *testing.T) {
	tests := []struct {
		name    string
		input   string
		wantMin float64
		wantMax float64
		wantErr bool
	}{
		{"single float becomes [x,x]", `0.3`, 0.3, 0.3, false},
		{"range", `[2.0, 4.0]`, 2.0, 4.0, false},
		{"invalid string", `"fast"`, 0, 0, true},
		{"invalid object", `{}`, 0, 0, true},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			var v zoneconfig.ValueRange
			err := json.Unmarshal([]byte(tt.input), &v)
			if tt.wantErr {
				assert.Error(t, err)
				return
			}
			require.NoError(t, err)
			assert.Equal(t, tt.wantMin, v.Min())
			assert.Equal(t, tt.wantMax, v.Max())
		})
	}
}

// --- ZeroBasedValueRange ---

func TestZeroBasedValueRange(t *testing.T) {
	tests := []struct {
		name    string
		input   string
		wantMin float64
		wantMax float64
		wantErr bool
	}{
		{"single float becomes [0,x]", `5.0`, 0.0, 5.0, false},
		{"range", `[2.0, 8.0]`, 2.0, 8.0, false},
		{"invalid string", `"far"`, 0, 0, true},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			var v zoneconfig.ZeroBasedValueRange
			err := json.Unmarshal([]byte(tt.input), &v)
			if tt.wantErr {
				assert.Error(t, err)
				return
			}
			require.NoError(t, err)
			assert.Equal(t, tt.wantMin, v.Min())
			assert.Equal(t, tt.wantMax, v.Max())
		})
	}
}
