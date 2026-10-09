package questbook_test

import (
	"crypto/sha1"
	"encoding/hex"
	"net/http"
	"net/http/httptest"
	"sync/atomic"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/delve-mmo/game-server/internal/questbook"
)

const body = `[{"identifier":"rat-hunt","offeredBy":{"zone":"darkwood","ncu":"grizzle"},"requiresFlags":["key/gate"]}]`

func checksum(s string) string {
	sum := sha1.Sum([]byte(s))
	return hex.EncodeToString(sum[:])
}

func server(t *testing.T, status int, content string) (*httptest.Server, *atomic.Int32) {
	t.Helper()
	var hits atomic.Int32
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		hits.Add(1)
		w.WriteHeader(status)
		_, _ = w.Write([]byte(content))
	}))
	t.Cleanup(srv.Close)
	return srv, &hits
}

func TestLoad_ParsesAndCachesTheFile(t *testing.T) {
	srv, hits := server(t, http.StatusOK, body)
	book := questbook.New()

	for range 2 {
		quests, err := book.Load(srv.URL, checksum(body))
		require.NoError(t, err)
		require.Len(t, quests, 1)
		assert.Equal(t, "rat-hunt", quests[0].Identifier)
		assert.Equal(t, "grizzle", quests[0].OfferedBy.NCU)
		assert.Equal(t, []string{"key/gate"}, quests[0].RequiresFlags)
	}
	assert.Equal(t, int32(1), hits.Load())
}

func TestLoad_RefusesAChangedFile(t *testing.T) {
	srv, _ := server(t, http.StatusOK, body)
	_, err := questbook.New().Load(srv.URL, checksum("[]"))
	assert.ErrorContains(t, err, "checksum")
}

func TestLoad_DoesntCacheFailures(t *testing.T) {
	srv, hits := server(t, http.StatusNotFound, "")
	book := questbook.New()
	_, err := book.Load(srv.URL, checksum(""))
	assert.ErrorContains(t, err, "HTTP 404")
	_, err = book.Load(srv.URL, checksum(""))
	assert.Error(t, err)
	assert.Equal(t, int32(2), hits.Load())
}
