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

func TestZoneExit_Success(t *testing.T) {
	var gotPath, gotToken string
	var gotBody map[string]string
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		gotPath = r.URL.Path
		gotToken = r.Header.Get("X-Internal-Token")
		_ = json.NewDecoder(r.Body).Decode(&gotBody)
		w.WriteHeader(http.StatusOK)
	}))
	t.Cleanup(srv.Close)

	err := railsclient.New(srv.URL, "secret-token").ZoneExit("wc-9", "darkwood", "road/north")
	require.NoError(t, err)

	assert.Equal(t, "/internal_api/world_characters/wc-9/zone_exits", gotPath)
	assert.Equal(t, "secret-token", gotToken)
	assert.Equal(t, map[string]string{"zone_identifier": "darkwood", "connection": "road/north"}, gotBody)
}

func TestZoneExit_ErrorCarriesRailsMessage(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusUnprocessableEntity)
		_, _ = w.Write([]byte(`{"error":"that exit leads nowhere"}`))
	}))
	t.Cleanup(srv.Close)

	err := railsclient.New(srv.URL, "t").ZoneExit("wc-9", "darkwood", "road/north")
	require.Error(t, err)
	assert.Contains(t, err.Error(), "422")
	assert.Contains(t, err.Error(), "that exit leads nowhere")
}

func TestZoneExit_ErrorWithoutBody(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusInternalServerError)
	}))
	t.Cleanup(srv.Close)

	err := railsclient.New(srv.URL, "t").ZoneExit("wc-9", "darkwood", "road/north")
	assert.EqualError(t, err, "rails returned 500")
}
