package railsclient_test

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/delve-mmo/game-server/internal/instanceconfig"
	"github.com/delve-mmo/game-server/internal/railsclient"
)

var ratHunt = instanceconfig.Quest{
	Identifier: "rat-hunt",
	OfferedBy:  instanceconfig.NcuRef{Zone: "cave", NCU: "grizzle"},
	Objectives: []instanceconfig.QuestObjective{{Type: "kill", Zone: "cave", UnitType: "rat", Count: 5}},
}

const activeRatHunt = `{"quest":{"quest_identifier":"rat-hunt","world_version_id":"7","timer_elapsed_seconds":5,` +
	`"definition":{"offeredBy":{"zone":"cave","ncu":"grizzle"}},` +
	`"objectives":[{"hash":"abc","objective":{"type":"kill","zone":"cave","unitType":"rat","count":5},"count":2,"required":5}]}}`

func TestAcceptQuest(t *testing.T) {
	var gotPath, gotMethod string
	var gotBody map[string]map[string]any
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		gotPath, gotMethod = r.URL.Path, r.Method
		_ = json.NewDecoder(r.Body).Decode(&gotBody)
		w.WriteHeader(http.StatusCreated)
		_, _ = w.Write([]byte(activeRatHunt))
	}))
	t.Cleanup(srv.Close)

	quest, err := railsclient.New(srv.URL, "t").AcceptQuest("42", ratHunt)
	require.NoError(t, err)
	assert.Equal(t, "rat-hunt", quest.QuestIdentifier)
	assert.Equal(t, "7", quest.WorldVersionID)
	assert.Equal(t, 5, quest.TimerElapsedSeconds)
	assert.Equal(t, []instanceconfig.ActiveObjective{{
		Hash: "abc", Objective: ratHunt.Objectives[0], Count: 2, Required: 5,
	}}, quest.Objectives)
	assert.Equal(t, http.MethodPost, gotMethod)
	assert.Equal(t, "/internal_api/world_characters/42/quests", gotPath)
	assert.Equal(t, "rat-hunt", gotBody["quest"]["identifier"])
	assert.Equal(t, map[string]any{"zone": "cave", "ncu": "grizzle"}, gotBody["quest"]["offeredBy"])
}

func TestSyncQuest(t *testing.T) {
	var gotPath string
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		gotPath = r.URL.Path
		_, _ = w.Write([]byte(activeRatHunt))
	}))
	t.Cleanup(srv.Close)

	quest, err := railsclient.New(srv.URL, "t").SyncQuest("42", ratHunt)
	require.NoError(t, err)
	assert.Equal(t, "rat-hunt", quest.QuestIdentifier)
	assert.Equal(t, "/internal_api/world_characters/42/quests/rat-hunt/sync", gotPath)
}

func TestAcceptQuest_Refused(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusUnprocessableEntity)
		_, _ = w.Write([]byte(`{"error":"rat-hunt is already completed"}`))
	}))
	t.Cleanup(srv.Close)

	_, err := railsclient.New(srv.URL, "t").AcceptQuest("42", ratHunt)
	assert.ErrorIs(t, err, railsclient.ErrQuestRefused)
	assert.ErrorContains(t, err, "already completed")
}

func TestAcceptQuest_RailsError(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusInternalServerError)
	}))
	t.Cleanup(srv.Close)

	_, err := railsclient.New(srv.URL, "t").AcceptQuest("42", ratHunt)
	assert.ErrorContains(t, err, "500")
}

func TestAbandonQuest(t *testing.T) {
	var gotPath, gotMethod string
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		gotPath, gotMethod = r.URL.Path, r.Method
		w.WriteHeader(http.StatusNoContent)
	}))
	t.Cleanup(srv.Close)

	require.NoError(t, railsclient.New(srv.URL, "t").AbandonQuest("42", "rat-hunt"))
	assert.Equal(t, http.MethodDelete, gotMethod)
	assert.Equal(t, "/internal_api/world_characters/42/quests/rat-hunt", gotPath)
}

func TestAbandonQuest_RailsError(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusInternalServerError)
	}))
	t.Cleanup(srv.Close)

	assert.ErrorContains(t, railsclient.New(srv.URL, "t").AbandonQuest("42", "rat-hunt"), "500")
}

func TestQuestProgress(t *testing.T) {
	var gotPath, gotMethod string
	var gotBody map[string]any
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		gotPath, gotMethod = r.URL.Path, r.Method
		_ = json.NewDecoder(r.Body).Decode(&gotBody)
		_, _ = w.Write([]byte(activeRatHunt))
	}))
	t.Cleanup(srv.Close)

	timer := 30
	quest, err := railsclient.New(srv.URL, "t").QuestProgress("42", "rat-hunt", map[string]int{"abc": 2}, &timer)
	require.NoError(t, err)
	assert.Equal(t, "rat-hunt", quest.QuestIdentifier)
	assert.Equal(t, http.MethodPatch, gotMethod)
	assert.Equal(t, "/internal_api/world_characters/42/quests/rat-hunt", gotPath)
	assert.Equal(t, map[string]any{"progress": map[string]any{"abc": float64(2)}, "timer_elapsed_seconds": float64(30)}, gotBody)
}

func TestCompleteQuest(t *testing.T) {
	var gotPath string
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		gotPath = r.URL.Path
		_, _ = w.Write([]byte(`{"flags":["quest/completed/rat-hunt"],"items":[{"identifier":"dagger","name":"Dagger"}]}`))
	}))
	t.Cleanup(srv.Close)

	done, err := railsclient.New(srv.URL, "t").CompleteQuest("42", "rat-hunt")
	require.NoError(t, err)
	assert.Equal(t, []string{"quest/completed/rat-hunt"}, done.Flags)
	require.Len(t, done.Items, 1)
	assert.Equal(t, "Dagger", done.Items[0].Name)
	assert.Equal(t, "/internal_api/world_characters/42/quests/rat-hunt/complete", gotPath)
}

func TestCompleteQuest_RailsError(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusNotFound)
	}))
	t.Cleanup(srv.Close)

	_, err := railsclient.New(srv.URL, "t").CompleteQuest("42", "rat-hunt")
	assert.ErrorContains(t, err, "404")
}
