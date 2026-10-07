package instance_test

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/delve-mmo/game-server/internal/instance"
	"github.com/delve-mmo/game-server/internal/instanceconfig"
	"github.com/delve-mmo/game-server/internal/railsclient"
)

// fakeQuestRails serves the internal flag lookups and quest accepts.
type fakeQuestRails struct {
	mu       sync.Mutex
	held     map[string]bool
	accepted []string
	refuse   string
}

func (f *fakeQuestRails) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	f.mu.Lock()
	defer f.mu.Unlock()
	const prefix = "/internal_api/world_characters/wc-1/"
	path := strings.TrimPrefix(r.URL.Path, prefix)
	switch {
	case r.Method == http.MethodGet && strings.HasPrefix(path, "flags/"):
		_ = json.NewEncoder(w).Encode(map[string]bool{"held": f.held[strings.TrimPrefix(path, "flags/")]})
	case r.Method == http.MethodPost && path == "quests":
		var body map[string]string
		_ = json.NewDecoder(r.Body).Decode(&body)
		if f.refuse != "" {
			w.WriteHeader(http.StatusUnprocessableEntity)
			_ = json.NewEncoder(w).Encode(map[string]string{"error": f.refuse})
			return
		}
		f.accepted = append(f.accepted, body["quest"])
		w.WriteHeader(http.StatusCreated)
		_ = json.NewEncoder(w).Encode(map[string]any{
			"quest": map[string]any{"quest_identifier": body["quest"], "timer_elapsed_seconds": 0, "progress": map[string]int{}},
		})
	default:
		w.WriteHeader(http.StatusNotFound)
	}
}

var testQuests = []instanceconfig.Quest{
	{Identifier: "rat-hunt", OfferedBy: instanceconfig.NcuRef{Zone: "darkwood", NCU: "grizzle"}},
	{Identifier: "rat-king", OfferedBy: instanceconfig.NcuRef{Zone: "darkwood", NCU: "grizzle"},
		RequiresFlags: []string{"quest/completed/rat-hunt"}},
	{Identifier: "trusted", OfferedBy: instanceconfig.NcuRef{Zone: "darkwood", NCU: "warden"},
		RequiresFlags: []string{"custom/trusted"}},
	{Identifier: "elsewhere", OfferedBy: instanceconfig.NcuRef{Zone: "goblin-cave", NCU: "grizzle"}},
}

func questInstance(t *testing.T, rails *fakeQuestRails) *instance.Instance {
	t.Helper()
	inst := instance.NewInstance(uuid.New(), "db-1", "darkwood", "abc123", "https://example.com/z.json",
		instanceconfig.Zone{Name: "Darkwood"}, instance.DefaultMaxSlots)
	srv := httptest.NewServer(rails)
	t.Cleanup(srv.Close)
	inst.RailsClient = railsclient.New(srv.URL, "token")
	inst.Quests = testQuests
	return inst
}

func addQuestSlot(t *testing.T, inst *instance.Instance, active ...string) (*instance.InstanceSlot, chan []byte) {
	t.Helper()
	quests := make([]instanceconfig.ActiveQuest, len(active))
	for i, id := range active {
		quests[i] = instanceconfig.ActiveQuest{QuestIdentifier: id}
	}
	slot, err := inst.AddSlotWithOptions("Aldric", "42", puncherClass, nil, nil,
		instance.SlotOptions{WorldCharacterDatabaseID: "wc-1", ActiveQuests: quests})
	require.NoError(t, err)
	writeCh, _, done, ok := inst.ConnectSlot(slot.ID)
	require.True(t, ok)
	t.Cleanup(func() { close(done) })
	return slot, writeCh
}

func nextMessage(t *testing.T, writeCh chan []byte) map[string]any {
	t.Helper()
	select {
	case raw := <-writeCh:
		var msg map[string]any
		require.NoError(t, json.Unmarshal(raw, &msg))
		return msg
	case <-time.After(time.Second):
		t.Fatal("no message")
		return nil
	}
}

func TestQuestOffers_OffersAvailableQuestsByNCU(t *testing.T) {
	inst := questInstance(t, &fakeQuestRails{held: map[string]bool{"custom/trusted": true}})
	slot, _ := addQuestSlot(t, inst)

	offers, err := inst.QuestOffers(slot.ID)
	require.NoError(t, err)
	assert.Equal(t, map[string][]string{"grizzle": {"rat-hunt"}, "warden": {"trusted"}}, offers)
}

func TestQuestOffers_SkipsActiveAndCompletedQuests(t *testing.T) {
	inst := questInstance(t, &fakeQuestRails{held: map[string]bool{"quest/completed/rat-hunt": true}})
	slot, _ := addQuestSlot(t, inst, "rat-king")

	offers, err := inst.QuestOffers(slot.ID)
	require.NoError(t, err)
	assert.Empty(t, offers)
}

func TestQuestOffers_NoneWithoutAWorldCharacter(t *testing.T) {
	inst := questInstance(t, &fakeQuestRails{})
	slot, err := inst.AddSlot("Aldric", "42", puncherClass, nil, nil)
	require.NoError(t, err)

	offers, err := inst.QuestOffers(slot.ID)
	require.NoError(t, err)
	assert.Empty(t, offers)
}

func TestSendQuestOffers_SendsThemToTheSlot(t *testing.T) {
	inst := questInstance(t, &fakeQuestRails{})
	slot, writeCh := addQuestSlot(t, inst)

	inst.SendQuestOffers(context.Background(), slot.ID)
	msg := nextMessage(t, writeCh)
	assert.Equal(t, "quest_offers", msg["type"])
	assert.Equal(t, map[string]any{"grizzle": []any{"rat-hunt"}}, msg["offers"])
}

func TestAcceptQuest_AcceptsThroughRailsAndRefreshesOffers(t *testing.T) {
	rails := &fakeQuestRails{}
	inst := questInstance(t, rails)
	slot, writeCh := addQuestSlot(t, inst)

	inst.AcceptQuest(context.Background(), slot.ID, "grizzle", "rat-hunt")
	accepted := nextMessage(t, writeCh)
	assert.Equal(t, "quest_accepted", accepted["type"])
	assert.Equal(t, "rat-hunt", accepted["quest"].(map[string]any)["quest_identifier"])
	offers := nextMessage(t, writeCh)
	assert.Equal(t, "quest_offers", offers["type"])
	assert.Empty(t, offers["offers"])

	assert.Equal(t, []string{"rat-hunt"}, rails.accepted)
	got, _ := inst.GetSlot(slot.ID)
	assert.Contains(t, got.Quests, "rat-hunt")
}

func TestAcceptQuest_RefusesQuestsTheNCUDoesntOffer(t *testing.T) {
	for name, tc := range map[string]struct{ ncu, quest string }{
		"another NCU's":  {"warden", "rat-hunt"},
		"another zone's": {"grizzle", "elsewhere"},
		"an unknown one": {"grizzle", "nope"},
		"an unavailable": {"grizzle", "rat-king"},
	} {
		t.Run(name, func(t *testing.T) {
			rails := &fakeQuestRails{}
			inst := questInstance(t, rails)
			slot, writeCh := addQuestSlot(t, inst)

			inst.AcceptQuest(context.Background(), slot.ID, tc.ncu, tc.quest)
			msg := nextMessage(t, writeCh)
			assert.Equal(t, "quest_accept_failed", msg["type"])
			assert.Equal(t, tc.quest, msg["quest"])
			assert.Empty(t, rails.accepted)
		})
	}
}

func TestAcceptQuest_ReportsARailsRefusal(t *testing.T) {
	inst := questInstance(t, &fakeQuestRails{refuse: "at most 20 quests can be active at once"})
	slot, writeCh := addQuestSlot(t, inst)

	inst.AcceptQuest(context.Background(), slot.ID, "grizzle", "rat-hunt")
	msg := nextMessage(t, writeCh)
	assert.Equal(t, "quest_accept_failed", msg["type"])
	assert.Contains(t, msg["error"], "at most 20 quests")
	got, _ := inst.GetSlot(slot.ID)
	assert.NotContains(t, got.Quests, "rat-hunt")
}
