package instance_test

import (
	"context"
	"encoding/json"
	"math/rand"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"testing"

	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/delve-mmo/game-server/internal/instance"
	"github.com/delve-mmo/game-server/internal/instanceconfig"
	"github.com/delve-mmo/game-server/internal/railsclient"
)

// fakeFlagRails serves the internal flag endpoints from an in-memory set,
// counting requests.
type fakeFlagRails struct {
	mu       sync.Mutex
	held     map[string]bool
	gets     int
	grants   []string
	failWith int
}

func (f *fakeFlagRails) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	f.mu.Lock()
	defer f.mu.Unlock()
	if f.failWith != 0 {
		w.WriteHeader(f.failWith)
		return
	}
	const prefix = "/internal_api/world_characters/wc-1/flags"
	switch r.Method {
	case http.MethodGet:
		f.gets++
		_ = json.NewEncoder(w).Encode(map[string]bool{"held": f.held[strings.TrimPrefix(r.URL.Path, prefix+"/")]})
	case http.MethodPost:
		var body map[string]string
		_ = json.NewDecoder(r.Body).Decode(&body)
		f.grants = append(f.grants, body["flag"])
		f.held[body["flag"]] = true
		w.WriteHeader(http.StatusCreated)
	}
}

func flagInstance(t *testing.T, rails *fakeFlagRails, zoneFlags ...string) *instance.Instance {
	t.Helper()
	inst := instance.NewInstance(uuid.New(), "db-1", "darkwood", "abc123", "https://example.com/z.json",
		instanceconfig.Zone{Name: "Darkwood", Flags: zoneFlags}, instance.DefaultMaxSlots)
	inst.Rand = rand.New(rand.NewSource(1))
	srv := httptest.NewServer(rails)
	t.Cleanup(srv.Close)
	inst.RailsClient = railsclient.New(srv.URL, "token")
	return inst
}

func addWorldSlot(t *testing.T, inst *instance.Instance, held ...string) *instance.InstanceSlot {
	t.Helper()
	slot, err := inst.AddSlotWithOptions("Aldric", "42", puncherClass, nil, nil,
		instance.SlotOptions{WorldCharacterDatabaseID: "wc-1", HeldFlags: held})
	require.NoError(t, err)
	return slot
}

func TestAddSlot_CachesTheZonesListedFlags(t *testing.T) {
	inst := flagInstance(t, &fakeFlagRails{held: map[string]bool{}}, "key/gate", "zone/reached/darkwood")
	slot := addWorldSlot(t, inst, "key/gate")
	assert.Equal(t, map[string]bool{"key/gate": true, "zone/reached/darkwood": false}, slot.Flags)
}

func TestHasFlag_AnswersListedFlagsWithoutRails(t *testing.T) {
	rails := &fakeFlagRails{held: map[string]bool{}}
	inst := flagInstance(t, rails, "key/gate", "key/door")
	slot := addWorldSlot(t, inst, "key/gate")

	held, err := inst.HasFlag(slot.ID, "key/gate")
	require.NoError(t, err)
	assert.True(t, held)
	held, err = inst.HasFlag(slot.ID, "key/door")
	require.NoError(t, err)
	assert.False(t, held)
	assert.Zero(t, rails.gets)
}

func TestHasFlag_AsksRailsOnceForAnUnlistedFlag(t *testing.T) {
	rails := &fakeFlagRails{held: map[string]bool{"quest/completed/killMoreOrcs": true}}
	inst := flagInstance(t, rails)
	slot := addWorldSlot(t, inst)

	for range 2 {
		held, err := inst.HasFlag(slot.ID, "quest/completed/killMoreOrcs")
		require.NoError(t, err)
		assert.True(t, held)
	}
	assert.Equal(t, 1, rails.gets)
}

func TestHasFlag_RailsErrorIsntCached(t *testing.T) {
	rails := &fakeFlagRails{held: map[string]bool{}, failWith: http.StatusInternalServerError}
	inst := flagInstance(t, rails)
	slot := addWorldSlot(t, inst)

	_, err := inst.HasFlag(slot.ID, "key/gate")
	assert.Error(t, err)
	got, _ := inst.GetSlot(slot.ID)
	assert.NotContains(t, got.Flags, "key/gate")
}

func TestHasFlag_NoWorldCharacter(t *testing.T) {
	inst := flagInstance(t, &fakeFlagRails{held: map[string]bool{}})
	slot, err := inst.AddSlot("Aldric", "42", puncherClass, nil, nil)
	require.NoError(t, err)

	_, err = inst.HasFlag(slot.ID, "key/gate")
	assert.ErrorIs(t, err, instance.ErrNoWorldCharacter)
}

func TestGrantFlag_GrantsThroughRailsAndCaches(t *testing.T) {
	rails := &fakeFlagRails{held: map[string]bool{}}
	inst := flagInstance(t, rails)
	slot := addWorldSlot(t, inst)

	require.NoError(t, inst.GrantFlag(slot.ID, "key/gate"))
	require.NoError(t, inst.GrantFlag(slot.ID, "key/gate"))
	assert.Equal(t, []string{"key/gate"}, rails.grants)
	held, err := inst.HasFlag(slot.ID, "key/gate")
	require.NoError(t, err)
	assert.True(t, held)
	assert.Zero(t, rails.gets)
}

func TestGrantFlag_SkipsAFlagAlreadyHeld(t *testing.T) {
	rails := &fakeFlagRails{held: map[string]bool{}}
	inst := flagInstance(t, rails, "zone/reached/darkwood")
	slot := addWorldSlot(t, inst, "zone/reached/darkwood")

	require.NoError(t, inst.GrantFlag(slot.ID, "zone/reached/darkwood"))
	assert.Empty(t, rails.grants)
}

func TestGrantFlag_RailsErrorLeavesItUnheld(t *testing.T) {
	rails := &fakeFlagRails{held: map[string]bool{}, failWith: http.StatusUnprocessableEntity}
	inst := flagInstance(t, rails)
	slot := addWorldSlot(t, inst)

	assert.Error(t, inst.GrantFlag(slot.ID, "key/gate"))
	got, _ := inst.GetSlot(slot.ID)
	assert.False(t, got.Flags["key/gate"])
}

func TestGrantZoneReached(t *testing.T) {
	rails := &fakeFlagRails{held: map[string]bool{}}
	inst := flagInstance(t, rails, "zone/reached/darkwood")
	slot := addWorldSlot(t, inst)

	inst.GrantZoneReached(context.Background(), slot.ID)
	assert.Equal(t, []string{"zone/reached/darkwood"}, rails.grants)
}

func TestGrantZoneReached_SkipsDirectPlay(t *testing.T) {
	rails := &fakeFlagRails{held: map[string]bool{}}
	inst := flagInstance(t, rails)
	slot, err := inst.AddSlot("Aldric", "42", puncherClass, nil, nil)
	require.NoError(t, err)

	inst.GrantZoneReached(context.Background(), slot.ID)
	assert.Empty(t, rails.grants)
}
