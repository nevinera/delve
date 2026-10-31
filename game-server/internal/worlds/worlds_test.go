package worlds

import (
	"archive/zip"
	"bytes"
	"context"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
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
	"world.json": `{"version":2,"name":"Vale","continents":[{"key":"main","name":"Main"},{"key":"isle","name":"Isle"}],"spawn":{"continent":"isle","at":[1280,-640]}}`,
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
		if w.Spawn != (Spawn{Continent: "isle", At: [2]float64{1280, -640}}) || len(w.Continents) != 2 {
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
	if got := TileOf(-1, 1025); got != [2]int{-1, 4} {
		t.Errorf("TileOf = %v", got)
	}
}

func TestReadRefusesOtherWorlds(t *testing.T) {
	for name, world := range map[string]string{
		"version 1":                `{"version":1,"continents":[{"key":"main"}],"spawn":{"continent":"main","at":[0,0]}}`,
		"no spawn":                 `{"version":2,"continents":[{"key":"main"}]}`,
		"spawn off its continents": `{"version":2,"continents":[{"key":"main"}],"spawn":{"continent":"isle","at":[0,0]}}`,
	} {
		path := filepath.Join(t.TempDir(), "world.zip")
		if err := os.WriteFile(path, worldZip(t, map[string]string{"world.json": world}), 0o644); err != nil {
			t.Fatal(err)
		}
		if _, err := Read(path); err == nil {
			t.Errorf("%s: read it", name)
		}
	}
}
