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

func TestAcceptQuest(t *testing.T) {
	var gotPath, gotMethod string
	var gotBody map[string]string
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		gotPath, gotMethod = r.URL.Path, r.Method
		_ = json.NewDecoder(r.Body).Decode(&gotBody)
		w.WriteHeader(http.StatusCreated)
		_, _ = w.Write([]byte(`{"quest":{"quest_identifier":"rat-hunt","timer_elapsed_seconds":5,"progress":{"abc":2}}}`))
	}))
	t.Cleanup(srv.Close)

	quest, err := railsclient.New(srv.URL, "t").AcceptQuest("42", "rat-hunt")
	require.NoError(t, err)
	assert.Equal(t, instanceconfig.ActiveQuest{QuestIdentifier: "rat-hunt", TimerElapsedSeconds: 5, Progress: map[string]int{"abc": 2}}, quest)
	assert.Equal(t, http.MethodPost, gotMethod)
	assert.Equal(t, "/internal_api/world_characters/42/quests", gotPath)
	assert.Equal(t, map[string]string{"quest": "rat-hunt"}, gotBody)
}

func TestAcceptQuest_Refused(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusUnprocessableEntity)
		_, _ = w.Write([]byte(`{"error":"rat-hunt is already completed"}`))
	}))
	t.Cleanup(srv.Close)

	_, err := railsclient.New(srv.URL, "t").AcceptQuest("42", "rat-hunt")
	assert.ErrorIs(t, err, railsclient.ErrQuestRefused)
	assert.ErrorContains(t, err, "already completed")
}

func TestAcceptQuest_RailsError(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusInternalServerError)
	}))
	t.Cleanup(srv.Close)

	_, err := railsclient.New(srv.URL, "t").AcceptQuest("42", "rat-hunt")
	assert.ErrorContains(t, err, "500")
}
