package instance_test

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"slices"
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
	mu        sync.Mutex
	held      map[string]bool
	accepted  []string
	synced    []string
	abandoned []string
	completed []string
	refuse    string
	// active is what PATCHes update and return, by quest identifier.
	active map[string]instanceconfig.ActiveQuest
	// timers is each quest's last saved timer.
	timers map[string]int
}

func activeQuestJSON(identifier string) map[string]any {
	return map[string]any{"quest": map[string]any{
		"quest_identifier": identifier, "world_version_id": "wv-2", "timer_elapsed_seconds": 0,
		"definition": map[string]any{}, "objectives": []any{},
	}}
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
		var body map[string]instanceconfig.Quest
		_ = json.NewDecoder(r.Body).Decode(&body)
		if f.refuse != "" {
			w.WriteHeader(http.StatusUnprocessableEntity)
			_ = json.NewEncoder(w).Encode(map[string]string{"error": f.refuse})
			return
		}
		f.accepted = append(f.accepted, body["quest"].Identifier)
		w.WriteHeader(http.StatusCreated)
		_ = json.NewEncoder(w).Encode(activeQuestJSON(body["quest"].Identifier))
	case r.Method == http.MethodPost && strings.HasSuffix(path, "/sync"):
		identifier := strings.TrimSuffix(strings.TrimPrefix(path, "quests/"), "/sync")
		f.synced = append(f.synced, identifier)
		_ = json.NewEncoder(w).Encode(activeQuestJSON(identifier))
	case r.Method == http.MethodPost && strings.HasSuffix(path, "/complete"):
		f.completed = append(f.completed, strings.TrimSuffix(strings.TrimPrefix(path, "quests/"), "/complete"))
		_ = json.NewEncoder(w).Encode(map[string]any{
			"flags": []string{"quest/completed/" + f.completed[len(f.completed)-1]},
			"items": []map[string]string{{"identifier": "rat-tail", "name": "Rat Tail"}},
		})
	case r.Method == http.MethodPatch && strings.HasPrefix(path, "quests/"):
		f.patch(w, r, strings.TrimPrefix(path, "quests/"))
	case r.Method == http.MethodDelete && strings.HasPrefix(path, "quests/"):
		f.abandoned = append(f.abandoned, strings.TrimPrefix(path, "quests/"))
		w.WriteHeader(http.StatusNoContent)
	default:
		w.WriteHeader(http.StatusNotFound)
	}
}

func (f *fakeQuestRails) patch(w http.ResponseWriter, r *http.Request, identifier string) {
	var body struct {
		Progress map[string]int `json:"progress"`
		Timer    *int           `json:"timer_elapsed_seconds"`
	}
	_ = json.NewDecoder(r.Body).Decode(&body)
	quest := f.active[identifier]
	quest.Objectives = slices.Clone(quest.Objectives)
	for i, objective := range quest.Objectives {
		if count, ok := body.Progress[objective.Hash]; ok {
			quest.Objectives[i].Count = count
		}
	}
	if body.Timer != nil {
		quest.TimerElapsedSeconds = *body.Timer
		if f.timers == nil {
			f.timers = map[string]int{}
		}
		f.timers[identifier] = *body.Timer
	}
	f.active[identifier] = quest
	_ = json.NewEncoder(w).Encode(map[string]any{"quest": quest})
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
	inst.WorldVersionID = "wv-2"
	return inst
}

func addQuestSlot(t *testing.T, inst *instance.Instance, active ...string) (*instance.InstanceSlot, chan []byte) {
	t.Helper()
	quests := make([]instanceconfig.ActiveQuest, len(active))
	for i, id := range active {
		quests[i] = instanceconfig.ActiveQuest{QuestIdentifier: id, WorldVersionID: "wv-2"}
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
	assert.Equal(t, "quest-offers", msg["type"])
	assert.Equal(t, map[string]any{"grizzle": []any{"rat-hunt"}}, msg["offers"])
}

func TestAcceptQuest_AcceptsThroughRailsAndRefreshesOffers(t *testing.T) {
	rails := &fakeQuestRails{}
	inst := questInstance(t, rails)
	slot, writeCh := addQuestSlot(t, inst)

	inst.AcceptQuest(context.Background(), slot.ID, "grizzle", "rat-hunt")
	received := nextMessage(t, writeCh)
	assert.Equal(t, "quest-received", received["type"])
	assert.Equal(t, "rat-hunt", received["quest"].(map[string]any)["quest_identifier"])
	offers := nextMessage(t, writeCh)
	assert.Equal(t, "quest-offers", offers["type"])
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
			assert.Equal(t, "quest-accept-failed", msg["type"])
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
	assert.Equal(t, "quest-accept-failed", msg["type"])
	assert.Contains(t, msg["error"], "at most 20 quests")
	got, _ := inst.GetSlot(slot.ID)
	assert.NotContains(t, got.Quests, "rat-hunt")
}

func TestUpgradeQuests_SyncsOlderQuestsAndAbandonsRemovedOnes(t *testing.T) {
	rails := &fakeQuestRails{}
	inst := questInstance(t, rails)
	slot, err := inst.AddSlotWithOptions("Aldric", "42", puncherClass, nil, nil, instance.SlotOptions{
		WorldCharacterDatabaseID: "wc-1",
		ActiveQuests: []instanceconfig.ActiveQuest{
			{QuestIdentifier: "rat-hunt", WorldVersionID: "wv-1"},
			{QuestIdentifier: "trusted", WorldVersionID: "wv-2"},
			{QuestIdentifier: "removed", WorldVersionID: "wv-1"},
		},
	})
	require.NoError(t, err)
	writeCh, _, done, ok := inst.ConnectSlot(slot.ID)
	require.True(t, ok)
	t.Cleanup(func() { close(done) })

	inst.UpgradeQuests(context.Background(), slot.ID)
	types := map[string]string{}
	for range 2 {
		msg := nextMessage(t, writeCh)
		switch msg["type"] {
		case "quest-updated":
			types["updated"] = msg["quest"].(map[string]any)["quest_identifier"].(string)
		case "quest-abandoned":
			types["abandoned"] = msg["quest"].(string)
		}
	}
	assert.Equal(t, map[string]string{"updated": "rat-hunt", "abandoned": "removed"}, types)
	assert.Equal(t, []string{"rat-hunt"}, rails.synced)
	assert.Equal(t, []string{"removed"}, rails.abandoned)
	got, _ := inst.GetSlot(slot.ID)
	assert.Equal(t, "wv-2", got.Quests["rat-hunt"].WorldVersionID)
	assert.NotContains(t, got.Quests, "removed")
}

func TestAbandonQuest_AbandonsThroughRails(t *testing.T) {
	rails := &fakeQuestRails{}
	inst := questInstance(t, rails)
	slot, writeCh := addQuestSlot(t, inst, "rat-hunt")

	inst.AbandonQuest(context.Background(), slot.ID, "rat-hunt")
	abandoned := nextMessage(t, writeCh)
	assert.Equal(t, "quest-abandoned", abandoned["type"])
	assert.Equal(t, "rat-hunt", abandoned["quest"])
	offers := nextMessage(t, writeCh)
	assert.Equal(t, map[string]any{"grizzle": []any{"rat-hunt"}}, offers["offers"])
	assert.Equal(t, []string{"rat-hunt"}, rails.abandoned)
}

func TestAbandonQuest_RefusesAQuestThatIsntActive(t *testing.T) {
	rails := &fakeQuestRails{}
	inst := questInstance(t, rails)
	slot, writeCh := addQuestSlot(t, inst)

	inst.AbandonQuest(context.Background(), slot.ID, "rat-hunt")
	msg := nextMessage(t, writeCh)
	assert.Equal(t, "quest-abandon-failed", msg["type"])
	assert.Empty(t, rails.abandoned)
}
