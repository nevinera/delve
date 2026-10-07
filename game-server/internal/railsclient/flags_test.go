package railsclient_test

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/delve-mmo/game-server/internal/railsclient"
)

func TestHasFlag(t *testing.T) {
	var gotPath, gotToken string
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		gotPath = r.URL.Path
		gotToken = r.Header.Get("X-Internal-Token")
		_ = json.NewEncoder(w).Encode(map[string]bool{"held": true})
	}))
	t.Cleanup(srv.Close)

	held, err := railsclient.New(srv.URL, "secret-token").HasFlag("42", "quest/completed/killMoreOrcs")
	require.NoError(t, err)
	assert.True(t, held)
	assert.Equal(t, "/internal_api/world_characters/42/flags/quest/completed/killMoreOrcs", gotPath)
	assert.Equal(t, "secret-token", gotToken)
}

func TestHasFlag_RailsError(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusUnprocessableEntity)
	}))
	t.Cleanup(srv.Close)

	_, err := railsclient.New(srv.URL, "t").HasFlag("42", "bogus/x")
	assert.ErrorContains(t, err, "422")
}

func TestGrantFlag(t *testing.T) {
	var gotPath, gotMethod string
	var gotBody map[string]string
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		gotPath, gotMethod = r.URL.Path, r.Method
		_ = json.NewDecoder(r.Body).Decode(&gotBody)
		w.WriteHeader(http.StatusCreated)
	}))
	t.Cleanup(srv.Close)

	require.NoError(t, railsclient.New(srv.URL, "t").GrantFlag("42", "zone/reached/darkwood"))
	assert.Equal(t, http.MethodPost, gotMethod)
	assert.Equal(t, "/internal_api/world_characters/42/flags", gotPath)
	assert.Equal(t, map[string]string{"flag": "zone/reached/darkwood"}, gotBody)
}

func TestGrantFlag_RailsError(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusNotFound)
	}))
	t.Cleanup(srv.Close)

	assert.ErrorContains(t, railsclient.New(srv.URL, "t").GrantFlag("42", "key/gate"), "404")
}
