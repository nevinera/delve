package instance_test

import (
	"sync"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/delve-mmo/game-server/internal/instance"
	"github.com/delve-mmo/game-server/internal/instanceconfig"
)

// makeInstance creates a minimal valid Instance for use in tests.
func makeInstance() *instance.Instance {
	return instance.NewInstance(
		uuid.New(),
		"db-1",
		"zone-goblin-cave",
		"abc123",
		"https://example.com/zones/goblin-cave.json",
		instanceconfig.Zone{Name: "Goblin Cave", Private: true},
		instance.DefaultMaxSlots,
	)
}

// --- NewInstance ---

func TestNewInstance_Defaults(t *testing.T) {
	before := time.Now()
	inst := makeInstance()
	after := time.Now()

	assert.Equal(t, instance.StatusLoading, inst.Status)
	assert.Equal(t, instance.DefaultMaxSlots, inst.MaxSlots)
	assert.True(t, inst.CreatedAt.After(before) || inst.CreatedAt.Equal(before))
	assert.True(t, inst.CreatedAt.Before(after) || inst.CreatedAt.Equal(after))
}

func TestNewInstance_Fields(t *testing.T) {
	id := uuid.New()
	zone := instanceconfig.Zone{Name: "Test Zone"}

	inst := instance.NewInstance(id, "db-99", "zone-test", "v2", "https://example.com/zone.json", zone, instance.DefaultMaxSlots)

	assert.Equal(t, id, inst.Identifier)
	assert.Equal(t, "db-99", inst.DatabaseID)
	assert.Equal(t, "zone-test", inst.ZoneIdentifier)
	assert.Equal(t, "v2", inst.Version)
	assert.Equal(t, "https://example.com/zone.json", inst.SourceURL)
	assert.Equal(t, "Test Zone", inst.ZoneConfig.Name)
}

// --- Start / Stop ---

func TestInstance_Start_TransitionsToActive(t *testing.T) {
	inst := makeInstance()
	err := inst.Start()
	require.NoError(t, err)
	t.Cleanup(inst.Stop)

	assert.Equal(t, instance.StatusActive, inst.Status)
}

func TestInstance_Stop_TransitionsToStopping(t *testing.T) {
	inst := makeInstance()
	require.NoError(t, inst.Start())
	inst.Stop()
	assert.Equal(t, instance.StatusStopping, inst.Status)
}

func TestInstance_Stop_CompletesWithinTimeout(t *testing.T) {
	inst := makeInstance()
	require.NoError(t, inst.Start())

	stopped := make(chan struct{})
	go func() {
		inst.Stop()
		close(stopped)
	}()

	select {
	case <-stopped:
	case <-time.After(500 * time.Millisecond):
		t.Fatal("Stop() did not return within 500ms")
	}
}

func TestInstance_Start_InvalidZone_ReturnsError(t *testing.T) {
	zone := instanceconfig.Zone{
		Name:    "Bad Zone",
		Private: true,
		Maps: []instanceconfig.Map{{
			Identifier: "m1",
			Name:       "Map 1",
			Units:      []instanceconfig.Unit{{UnitType: "goblin"}}, // missing identifier
		}},
		UnitTypes: map[string]instanceconfig.UnitType{
			"goblin": {Name: "Goblin", MaxHP: 10, TokenRadius: 1.0},
		},
	}
	inst := instance.NewInstance(uuid.New(), "db-1", "zone-test", "v1", "http://example.com", zone, instance.DefaultMaxSlots)

	err := inst.Start()
	require.Error(t, err)
	assert.Contains(t, err.Error(), "has no identifier")
	assert.Equal(t, instance.StatusLoading, inst.Status)
}

// --- Registry ---

func TestRegistry_EmptyCount(t *testing.T) {
	r := instance.NewRegistry()
	assert.Equal(t, 0, r.Count())
}

func TestRegistry_AddAndCount(t *testing.T) {
	r := instance.NewRegistry()
	r.Add(makeInstance())
	assert.Equal(t, 1, r.Count())
	r.Add(makeInstance())
	assert.Equal(t, 2, r.Count())
}

func TestRegistry_Get(t *testing.T) {
	r := instance.NewRegistry()
	inst := makeInstance()
	r.Add(inst)

	got, ok := r.Get(inst.Identifier)
	require.True(t, ok)
	assert.Equal(t, inst.Identifier, got.Identifier)
}

func TestRegistry_GetMissing(t *testing.T) {
	r := instance.NewRegistry()
	_, ok := r.Get(uuid.New())
	assert.False(t, ok)
}

func TestRegistry_Remove(t *testing.T) {
	r := instance.NewRegistry()
	inst := makeInstance()
	r.Add(inst)
	r.Remove(inst.Identifier)
	assert.Equal(t, 0, r.Count())

	_, ok := r.Get(inst.Identifier)
	assert.False(t, ok)
}

func TestRegistry_RemoveMissing(t *testing.T) {
	r := instance.NewRegistry()
	assert.NotPanics(t, func() { r.Remove(uuid.New()) })
}

func TestRegistry_List(t *testing.T) {
	r := instance.NewRegistry()
	a, b := makeInstance(), makeInstance()
	r.Add(a)
	r.Add(b)

	list := r.List()
	assert.Len(t, list, 2)

	ids := map[uuid.UUID]bool{}
	for _, inst := range list {
		ids[inst.Identifier] = true
	}
	assert.True(t, ids[a.Identifier])
	assert.True(t, ids[b.Identifier])
}

// TestRegistry_ConcurrentAccess exercises Add, Get, List, Remove and Count
// concurrently. Run with -race to detect any data races.
func TestRegistry_ConcurrentAccess(t *testing.T) {
	r := instance.NewRegistry()
	var wg sync.WaitGroup

	for range 100 {
		wg.Add(1)
		go func() {
			defer wg.Done()
			inst := makeInstance()
			r.Add(inst)
			r.Get(inst.Identifier)
			r.Count()
			r.List()
			r.Remove(inst.Identifier)
		}()
	}

	wg.Wait()
	assert.Equal(t, 0, r.Count())
}
