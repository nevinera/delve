package worlds

import (
	"archive/zip"
	"bytes"
	"context"
	"net/http"
	"net/http/httptest"
	"sync/atomic"
	"testing"
)

const sha = "0123456789abcdef0123456789abcdef01234567"

// worldZip is a world as GitHub zips it, under one top directory.
func worldZip(t *testing.T, files map[string]string) []byte {
	t.Helper()
	var buf bytes.Buffer
	z := zip.NewWriter(&buf)
	for name, body := range files {
		w, err := z.Create("them-vale-0123456/" + name)
		if err != nil {
			t.Fatal(err)
		}
		_, _ = w.Write([]byte(body))
	}
	if err := z.Close(); err != nil {
		t.Fatal(err)
	}
	return buf.Bytes()
}

var vale = map[string]string{
	"world.json":                         `{"version":1,"name":"Vale","continents":[{"key":"main","name":"Main"},{"key":"isle","name":"Isle"}]}`,
	"places/continents/main/sketch.json": `{"pins":[{"kind":"town","at":[1,1]}]}`,
	"places/continents/isle/sketch.json": `{"pins":[{"kind":"spawn","at":[2.5,-1.25]}]}`,
}

func TestLoadDownloadsOnce(t *testing.T) {
	var downloads atomic.Int32
	body := worldZip(t, vale)
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/repos/them/vale/zipball/"+sha {
			http.NotFound(w, r)
			return
		}
		downloads.Add(1)
		_, _ = w.Write(body)
	}))
	defer srv.Close()

	store := NewStore(t.TempDir(), srv.URL)
	for range 2 {
		w, err := store.Load(context.Background(), "them/vale", sha)
		if err != nil {
			t.Fatal(err)
		}
		if w.Spawn != (Spawn{Continent: "isle", At: [2]float64{2.5, -1.25}}) || len(w.Continents) != 2 {
			t.Fatalf("world = %+v", w)
		}
		if got := w.SpawnAt(); got != [3]float64{1280, 0, -640} {
			t.Errorf("SpawnAt = %v", got)
		}
	}
	if downloads.Load() != 1 {
		t.Errorf("downloads = %d, want 1", downloads.Load())
	}
}

func TestLoadRefusesBadNames(t *testing.T) {
	store := NewStore(t.TempDir(), "http://unused")
	if _, err := store.Load(context.Background(), "../etc", sha); err == nil {
		t.Error("Load took a bad repo")
	}
	if _, err := store.Load(context.Background(), "them/vale", "../x"); err == nil {
		t.Error("Load took a bad sha")
	}
}

func TestTileOf(t *testing.T) {
	if got := TileOf(-1, 1025); got != [2]int{-1, 2} {
		t.Errorf("TileOf = %v", got)
	}
}
