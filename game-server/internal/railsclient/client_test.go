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

func TestFetchEquippedItems_Success(t *testing.T) {
	primary := "strength"
	items := map[string]instanceconfig.EquippedItem{
		"head": {Identifier: "helm-of-doom", Slot: "head", Elvl: 584, PrimaryStat: &primary, SecondaryStats: []string{"stamina"}},
	}

	var gotPath, gotToken string
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		gotPath = r.URL.Path
		gotToken = r.Header.Get("X-Internal-Token")
		w.WriteHeader(http.StatusOK)
		_ = json.NewEncoder(w).Encode(items)
	}))
	t.Cleanup(srv.Close)

	client := railsclient.New(srv.URL, "secret-token")
	got, err := client.FetchEquippedItems("42")
	require.NoError(t, err)

	assert.Equal(t, items, got)
	assert.Equal(t, "/internal_api/characters/42/equipped_items", gotPath)
	assert.Equal(t, "secret-token", gotToken)
}

func TestFetchEquippedItems_NonOKStatus(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusNotFound)
	}))
	t.Cleanup(srv.Close)

	client := railsclient.New(srv.URL, "secret-token")
	_, err := client.FetchEquippedItems("42")
	assert.Error(t, err)
}

func TestFetchEquippedItems_InvalidJSON(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte("not json"))
	}))
	t.Cleanup(srv.Close)

	client := railsclient.New(srv.URL, "secret-token")
	_, err := client.FetchEquippedItems("42")
	assert.Error(t, err)
}

func TestFetchEquippedItems_NetworkError(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {}))
	srv.Close() // closed before use, so the request fails to connect

	client := railsclient.New(srv.URL, "secret-token")
	_, err := client.FetchEquippedItems("42")
	assert.Error(t, err)
}
