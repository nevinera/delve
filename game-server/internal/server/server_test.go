package server

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/delve-mmo/delve3d/game-server/internal/game"
	"github.com/delve-mmo/delve3d/game-server/internal/rails"
	"github.com/delve-mmo/delve3d/game-server/internal/token"
	"github.com/delve-mmo/delve3d/game-server/internal/worlds"
	"github.com/gorilla/websocket"
)

func TestUp(t *testing.T) {
	rec := httptest.NewRecorder()
	New(nil, "").ServeHTTP(rec, httptest.NewRequest(http.MethodGet, "/up", nil))

	if rec.Code != http.StatusOK {
		t.Errorf("status = %d, want 200", rec.Code)
	}
	if rec.Body.String() != "ok" {
		t.Errorf("body = %q, want ok", rec.Body.String())
	}
}

type oneWorld struct{}

func (oneWorld) Load(_ context.Context, repo, sha string) (*worlds.World, error) {
	return &worlds.World{Repo: repo, Sha: sha, Spawn: worlds.Spawn{Continent: "main", At: [2]float64{1, 1}}}, nil
}

type anyone struct{}

func (anyone) Character(_ context.Context, _, id int64) (rails.Character, error) {
	return rails.Character{ID: id, Name: "Arwen", Look: json.RawMessage(`{}`)}, nil
}

func dial(t *testing.T, url, tok string) (*websocket.Conn, *http.Response, error) {
	t.Helper()
	return websocket.DefaultDialer.Dial("ws"+strings.TrimPrefix(url, "http")+"/play?token="+tok, nil)
}

func receive(t *testing.T, c *websocket.Conn) map[string]any {
	t.Helper()
	_ = c.SetReadDeadline(time.Now().Add(time.Second))
	var m map[string]any
	if err := c.ReadJSON(&m); err != nil {
		t.Fatal(err)
	}
	return m
}

func TestPlay(t *testing.T) {
	srv := httptest.NewServer(New(game.NewHub(oneWorld{}, anyone{}), "shh"))
	defer srv.Close()
	claims := func(id int64) token.Claims {
		return token.Claims{Character: id, World: 1, Repo: "a/b", Sha: "s", Exp: time.Now().Unix() + 60}
	}

	if _, res, err := dial(t, srv.URL, token.Issue("wrong", claims(1))); err == nil || res.StatusCode != http.StatusUnauthorized {
		t.Fatalf("a bad token got in: %v", err)
	}

	a, _, err := dial(t, srv.URL, token.Issue("shh", claims(1)))
	if err != nil {
		t.Fatal(err)
	}
	defer a.Close()
	if m := receive(t, a); m["type"] != "welcome" {
		t.Fatalf("a got %v", m)
	}
	receive(t, a)

	b, _, err := dial(t, srv.URL, token.Issue("shh", claims(2)))
	if err != nil {
		t.Fatal(err)
	}
	receive(t, b)
	receive(t, b)
	if m := receive(t, a); m["type"] != "appear" {
		t.Fatalf("a got %v", m)
	}
	_ = b.WriteJSON(map[string]any{"type": "heartbeat", "at": []float64{600, 0, 600}, "yaw": 2})
	if m := receive(t, a); m["type"] != "moved" || m["yaw"] != 2.0 {
		t.Fatalf("a got %v", m)
	}

	// A bad message gets a reason, and the connection closes.
	_ = b.WriteMessage(websocket.TextMessage, []byte(`{"type":"fly"}`))
	if m := receive(t, b); m["type"] != "error" {
		t.Fatalf("b got %v", m)
	}
	if m := receive(t, a); m["type"] != "vanish" {
		t.Fatalf("a got %v", m)
	}
}
