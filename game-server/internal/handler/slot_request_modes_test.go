package handler_test

import (
	"net/http"
	"testing"

	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/delve-mmo/game-server/internal/instance"
)

func worldRequest(extras map[string]any) []byte {
	base := map[string]any{
		"mode":                        "world",
		"instance_key":                "world:7",
		"world_character_database_id": "wc-1",
		"world_version_id":            "wv-3",
		"exits":                       []string{"m1/north", "m1/south"},
		"spawn_at":                    "m1/south",
	}
	for k, v := range extras {
		base[k] = v
	}
	return validRequestBody(base)
}

func onlyInstance(t *testing.T, reg *instance.Registry) *instance.Instance {
	t.Helper()
	list := reg.List()
	require.Len(t, list, 1)
	return list[0]
}

func TestSlotsRequest_World_SetsInstanceAndSlotOptions(t *testing.T) {
	reg := instance.NewRegistry()
	router := mountRequest(newSlotsHandler(reg, 200))

	rec := postRequest(t, router, worldRequest(nil))
	require.Equal(t, http.StatusCreated, rec.Code)

	inst := onlyInstance(t, reg)
	t.Cleanup(inst.Stop)
	assert.Equal(t, instance.ModeWorld, inst.Mode)
	assert.Equal(t, "world:7", inst.InstanceKey)
	assert.Equal(t, "wv-3", inst.WorldVersionID)
	assert.Equal(t, map[string]bool{"m1/north": true, "m1/south": true}, inst.Exits)

	slots := inst.ListSlots()
	require.Len(t, slots, 1)
	assert.Equal(t, "wc-1", slots[0].WorldCharacterDatabaseID)
	assert.Equal(t, "m1/south", slots[0].SpawnAt)
}

func TestSlotsRequest_ModeValidation(t *testing.T) {
	cases := map[string]map[string]any{
		"unknown mode":                    {"mode": "sideways"},
		"world without a world character": {"world_character_database_id": ""},
		"world without an instance key":   {"instance_key": ""},
		"direct without an instance key":  {"mode": "direct", "instance_key": ""},
		"world without a database_id":     {"database_id": ""},
	}
	for name, extras := range cases {
		t.Run(name, func(t *testing.T) {
			router := mountRequest(newSlotsHandler(instance.NewRegistry(), 200))
			rec := postRequest(t, router, worldRequest(extras))
			assert.Equal(t, http.StatusUnprocessableEntity, rec.Code)
		})
	}
}

func TestSlotsRequest_Direct_AllowsMissingDatabaseID(t *testing.T) {
	reg := instance.NewRegistry()
	router := mountRequest(newSlotsHandler(reg, 200))

	rec := postRequest(t, router, worldRequest(map[string]any{
		"mode": "direct", "instance_key": "direct:1", "database_id": "", "world_character_database_id": "",
	}))
	require.Equal(t, http.StatusCreated, rec.Code)
	inst := onlyInstance(t, reg)
	t.Cleanup(inst.Stop)
	assert.Equal(t, instance.ModeDirect, inst.Mode)
}

func TestSlotsRequest_Keyed_ReusesSameKeyOnly(t *testing.T) {
	reg := instance.NewRegistry()
	router := mountRequest(newSlotsHandler(reg, 200))

	first := decodeRequestResponse(t, postRequest(t, router, worldRequest(nil)))
	same := decodeRequestResponse(t, postRequest(t, router, worldRequest(map[string]any{"character_name": "Brego"})))
	other := decodeRequestResponse(t, postRequest(t, router, worldRequest(map[string]any{"character_name": "Cyra", "instance_key": "world:8"})))
	for _, inst := range reg.List() {
		t.Cleanup(inst.Stop)
	}

	assert.Equal(t, first["instance_identifier"], same["instance_identifier"])
	assert.NotEqual(t, first["instance_identifier"], other["instance_identifier"])
}

func TestSlotsRequest_ModesNeverShareInstances(t *testing.T) {
	reg := instance.NewRegistry()
	router := mountRequest(newSlotsHandler(reg, 200))

	world := decodeRequestResponse(t, postRequest(t, router, worldRequest(nil)))
	direct := decodeRequestResponse(t, postRequest(t, router, worldRequest(map[string]any{
		"character_name": "Cyra", "mode": "direct", "world_character_database_id": "",
	})))
	for _, inst := range reg.List() {
		t.Cleanup(inst.Stop)
	}

	assert.NotEqual(t, world["instance_identifier"], direct["instance_identifier"])
}

func TestSlotsRequest_SpecificInstance_ModeMismatch(t *testing.T) {
	reg := instance.NewRegistry()
	router := mountRequest(newSlotsHandler(reg, 200))

	world := decodeRequestResponse(t, postRequest(t, router, worldRequest(nil)))
	t.Cleanup(onlyInstance(t, reg).Stop)
	id, err := uuid.Parse(world["instance_identifier"].(string))
	require.NoError(t, err)

	rec := postRequest(t, router, worldRequest(map[string]any{
		"instance_identifier": id.String(), "character_name": "Brego", "mode": "direct", "world_character_database_id": "",
	}))
	assert.Equal(t, http.StatusUnprocessableEntity, rec.Code)
}

func TestSlotsRequest_World_CachesHeldFlags(t *testing.T) {
	reg := instance.NewRegistry()
	router := mountRequest(newSlotsHandler(reg, 200))
	zone := validZoneConfig()
	zone.Flags = []string{"zone/reached/goblin-cave", "key/gate"}

	rec := postRequest(t, router, worldRequest(map[string]any{"zone_config": zone, "held_flags": []string{"key/gate"}}))
	require.Equal(t, http.StatusCreated, rec.Code)

	inst := onlyInstance(t, reg)
	t.Cleanup(inst.Stop)
	slots := inst.ListSlots()
	require.Len(t, slots, 1)
	assert.Equal(t, map[string]bool{"zone/reached/goblin-cave": false, "key/gate": true}, slots[0].Flags)
}
