package instanceconfig_test

import (
	"encoding/json"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/delve-mmo/game-server/internal/instanceconfig"
)

func TestZone_UnitRespawn_NoneOfTheThreeSetAnything(t *testing.T) {
	z := instanceconfig.Zone{}
	assert.Equal(t, instanceconfig.NoRespawn, z.UnitRespawn(instanceconfig.Map{}, instanceconfig.Unit{}))
}

func TestZone_UnitRespawn_ZoneLevelWinsWhenNothingMoreSpecific(t *testing.T) {
	zoneRespawn := instanceconfig.RespawnConfig{Type: "timer", DelaySeconds: 60}
	z := instanceconfig.Zone{Respawn: &zoneRespawn}
	assert.Equal(t, zoneRespawn, z.UnitRespawn(instanceconfig.Map{}, instanceconfig.Unit{}))
}

func TestZone_UnitRespawn_MapOverridesZone(t *testing.T) {
	zoneRespawn := instanceconfig.RespawnConfig{Type: "timer", DelaySeconds: 60}
	mapRespawn := instanceconfig.RespawnConfig{Type: "timer", DelaySeconds: 120}
	z := instanceconfig.Zone{Respawn: &zoneRespawn}
	m := instanceconfig.Map{Respawn: &mapRespawn}
	assert.Equal(t, mapRespawn, z.UnitRespawn(m, instanceconfig.Unit{}))
}

func TestZone_UnitRespawn_UnitOverridesMapAndZone(t *testing.T) {
	zoneRespawn := instanceconfig.RespawnConfig{Type: "timer", DelaySeconds: 60}
	mapRespawn := instanceconfig.RespawnConfig{Type: "timer", DelaySeconds: 120}
	unitRespawn := instanceconfig.RespawnConfig{Type: "none"}
	z := instanceconfig.Zone{Respawn: &zoneRespawn}
	m := instanceconfig.Map{Respawn: &mapRespawn}
	u := instanceconfig.Unit{Respawn: &unitRespawn}
	assert.Equal(t, unitRespawn, z.UnitRespawn(m, u))
}

func TestZone_UnitRespawn_UnitWinsEvenWhenMapAndZoneSetNothing(t *testing.T) {
	unitRespawn := instanceconfig.RespawnConfig{Type: "timer", DelaySeconds: 5}
	u := instanceconfig.Unit{Respawn: &unitRespawn}
	z := instanceconfig.Zone{}
	assert.Equal(t, unitRespawn, z.UnitRespawn(instanceconfig.Map{}, u))
}

func TestRespawnConfig_ParsesFromJSON(t *testing.T) {
	var rc instanceconfig.RespawnConfig
	require.NoError(t, json.Unmarshal([]byte(`{"type": "timer", "delaySeconds": 120.0}`), &rc))
	assert.Equal(t, "timer", rc.Type)
	assert.Equal(t, 120.0, rc.DelaySeconds)
}
