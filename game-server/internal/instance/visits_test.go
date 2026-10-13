package instance_test

import (
	"context"
	"encoding/json"
	"math/rand"
	"net/http"
	"net/http/httptest"
	"sync"
	"testing"

	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/delve-mmo/game-server/internal/instance"
	"github.com/delve-mmo/game-server/internal/instanceconfig"
	"github.com/delve-mmo/game-server/internal/instancestate"
	"github.com/delve-mmo/game-server/internal/railsclient"
)

// fakeVisitRails records the visits posted to it.
type fakeVisitRails struct {
	mu     sync.Mutex
	posted []map[string]string
}

func (f *fakeVisitRails) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	f.mu.Lock()
	defer f.mu.Unlock()
	if r.Method != http.MethodPost || r.URL.Path != "/internal_api/world_characters/wc-1/visits" {
		w.WriteHeader(http.StatusNotFound)
		return
	}
	var body map[string]string
	_ = json.NewDecoder(r.Body).Decode(&body)
	f.posted = append(f.posted, body)
	w.WriteHeader(http.StatusCreated)
}

func square(x0, y0, size float64) []instanceconfig.Location {
	return []instanceconfig.Location{{X: x0, Y: y0}, {X: x0 + size, Y: y0}, {X: x0 + size, Y: y0 + size}, {X: x0, Y: y0 + size}}
}

// visitZone has a glade map with a pond nested in its clearing, and an
// empty cave map with no places.
func visitZone() instanceconfig.Zone {
	return instanceconfig.Zone{Name: "Darkwood", Maps: []instanceconfig.Map{
		{Identifier: "glade", FeetDimensions: instanceconfig.Dimensions{Width: 100, Height: 100}, Places: []instanceconfig.Place{
			{Identifier: "clearing", Polygon: square(0, 0, 50)},
			{Identifier: "pond", Polygon: square(10, 10, 10)},
		}},
		{Identifier: "cave", FeetDimensions: instanceconfig.Dimensions{Width: 100, Height: 100}},
	}}
}

func visitInstance(t *testing.T, rails *fakeVisitRails) *instance.Instance {
	t.Helper()
	inst := instance.NewInstance(uuid.New(), "db-1", "darkwood", "abc123", "https://example.com/z.json", visitZone(), instance.DefaultMaxSlots)
	inst.Rand = rand.New(rand.NewSource(1))
	srv := httptest.NewServer(rails)
	t.Cleanup(srv.Close)
	inst.RailsClient = railsclient.New(srv.URL, "token")
	return inst
}

func visitState(unitID uuid.UUID, mapID string, x, y float64) *instancestate.InstanceState {
	return &instancestate.InstanceState{Units: map[uuid.UUID]*instancestate.UnitState{
		unitID: {ZoneUnitIdentifier: "player:Aldric", MapIdentifier: mapID, Position: instanceconfig.Position{X: x, Y: y}},
	}}
}

func visitsOf(events []instance.VisitEventForTest) []instance.Visit {
	out := make([]instance.Visit, len(events))
	for i, e := range events {
		out[i] = e.Visit
	}
	return out
}

func TestCollectVisits_ReportsTheMapAndPlaceOnArrival(t *testing.T) {
	inst := visitInstance(t, &fakeVisitRails{})
	unit := uuid.New()
	events := inst.CollectVisitsForTest(context.Background(), visitState(unit, "glade", 30, 30), false)
	assert.Equal(t, []instance.Visit{{Map: "glade"}, {Map: "glade", Place: "clearing"}}, visitsOf(events))
	assert.Equal(t, unit, events[0].UnitID)
}

func TestCollectVisits_PicksTheSmallestNestedPlace(t *testing.T) {
	inst := visitInstance(t, &fakeVisitRails{})
	events := inst.CollectVisitsForTest(context.Background(), visitState(uuid.New(), "glade", 15, 15), false)
	assert.Contains(t, visitsOf(events), instance.Visit{Map: "glade", Place: "pond"})
	assert.NotContains(t, visitsOf(events), instance.Visit{Map: "glade", Place: "clearing"})
}

func TestCollectVisits_ReportsOnlyChanges(t *testing.T) {
	inst := visitInstance(t, &fakeVisitRails{})
	ctx := context.Background()
	unit := uuid.New()
	inst.CollectVisitsForTest(ctx, visitState(unit, "glade", 30, 30), false)
	assert.Empty(t, inst.CollectVisitsForTest(ctx, visitState(unit, "glade", 31, 30), false), "same place")
	assert.Empty(t, inst.CollectVisitsForTest(ctx, visitState(unit, "glade", 80, 80), false), "left every place")
	assert.Equal(t, []instance.Visit{{Map: "glade", Place: "clearing"}},
		visitsOf(inst.CollectVisitsForTest(ctx, visitState(unit, "glade", 30, 30), false)), "back in")
	assert.Equal(t, []instance.Visit{{Map: "cave"}},
		visitsOf(inst.CollectVisitsForTest(ctx, visitState(unit, "cave", 30, 30), false)), "a map with no places")
}

func TestCollectVisits_IgnoresNonPlayers(t *testing.T) {
	inst := visitInstance(t, &fakeVisitRails{})
	state := visitState(uuid.New(), "glade", 30, 30)
	for _, u := range state.Units {
		u.ZoneUnitIdentifier = "goblin_1"
	}
	assert.Empty(t, inst.CollectVisitsForTest(context.Background(), state, false))
}

func TestRecordVisits_PostsEachNewVisitOnce(t *testing.T) {
	rails := &fakeVisitRails{}
	inst := visitInstance(t, rails)
	ctx := context.Background()
	slot, err := inst.AddSlotWithOptions("Aldric", "42", puncherClass, nil, nil, instance.SlotOptions{
		WorldCharacterDatabaseID: "wc-1",
		Visits:                   []instance.Visit{{}, {Map: "glade"}},
	})
	require.NoError(t, err)

	inst.RecordZoneVisit(ctx, slot.ID) // already visited
	inst.CollectVisitsForTest(ctx, visitState(slot.CharacterUnitID, "glade", 30, 30), true)
	inst.CollectVisitsForTest(ctx, visitState(slot.CharacterUnitID, "glade", 80, 80), true)
	inst.CollectVisitsForTest(ctx, visitState(slot.CharacterUnitID, "glade", 30, 30), true)

	assert.Equal(t, []map[string]string{{"zone": "darkwood", "map": "glade", "place": "clearing"}}, rails.posted)
	got, _ := inst.GetSlot(slot.ID)
	assert.Equal(t, map[string]bool{"": true, "glade": true, "glade/clearing": true}, got.Visited)
}

func TestRecordZoneVisit_PostsTheZone(t *testing.T) {
	rails := &fakeVisitRails{}
	inst := visitInstance(t, rails)
	slot, err := inst.AddSlotWithOptions("Aldric", "42", puncherClass, nil, nil, instance.SlotOptions{WorldCharacterDatabaseID: "wc-1"})
	require.NoError(t, err)
	inst.RecordZoneVisit(context.Background(), slot.ID)
	assert.Equal(t, []map[string]string{{"zone": "darkwood", "map": "", "place": ""}}, rails.posted)
}

func TestRecordVisits_SkipsSlotsWithoutAWorldCharacter(t *testing.T) {
	rails := &fakeVisitRails{}
	inst := visitInstance(t, rails)
	slot, err := inst.AddSlot("Aldric", "42", puncherClass, nil, nil)
	require.NoError(t, err)
	inst.RecordZoneVisit(context.Background(), slot.ID)
	inst.CollectVisitsForTest(context.Background(), visitState(slot.CharacterUnitID, "glade", 30, 30), true)
	assert.Empty(t, rails.posted)
}
