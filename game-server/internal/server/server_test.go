package server

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync/atomic"
	"testing"
	"time"

	"github.com/delve-mmo/delve3d/game-server/internal/combat"
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
	return &worlds.World{Repo: repo, Sha: sha, Spawn: worlds.Spawn{Continent: "main", At: [2]float64{512, 512}}}, nil
}

type anyone struct{}

func (anyone) Character(_ context.Context, _, id int64) (rails.Character, error) {
	return rails.Character{ID: id, Name: "Arwen", Look: json.RawMessage(`{}`)}, nil
}

func (anyone) SaveBuild(context.Context, int64, int64, string, map[string]string) error { return nil }

func (anyone) SaveClass(context.Context, int64, int64, string) error { return nil }

func (anyone) SavePosition(context.Context, int64, int64, rails.Position) error { return nil }

type classyWorld struct{}

func (classyWorld) Load(_ context.Context, repo, sha string) (*worlds.World, error) {
	return &worlds.World{Repo: repo, Sha: sha, Spawn: worlds.Spawn{Continent: "main", At: [2]float64{512, 512}}, Classes: []*combat.Class{{ID: "frst0001"}, {ID: "fire0001"}}}, nil
}

// classKeeper remembers the class it's told, as Rails does.
type classKeeper struct {
	anyone
	class atomic.Value
}

func (k *classKeeper) Character(_ context.Context, _, id int64) (rails.Character, error) {
	class, _ := k.class.Load().(string)
	return rails.Character{ID: id, Name: "Arwen", Look: json.RawMessage(`{}`), Class: class}, nil
}

func (k *classKeeper) SaveBuild(context.Context, int64, int64, string, map[string]string) error {
	return nil
}

func (k *classKeeper) SaveClass(_ context.Context, _, _ int64, class string) error {
	k.class.Store(class)
	return nil
}

func TestPickingAClassBeforeEntering(t *testing.T) {
	srv := httptest.NewServer(New(game.NewHub(classyWorld{}, &classKeeper{}), "shh"))
	defer srv.Close()
	tok := token.Issue("shh", token.Claims{Character: 1, World: 1, Repo: "a/b", Sha: "s", Exp: time.Now().Unix() + 60})

	// Choosing something the world doesn't have ends it with a reason.
	c, _, err := dial(t, srv.URL, tok)
	if err != nil {
		t.Fatal(err)
	}
	defer c.Close()
	if m := receive(t, c); m["type"] != "pickClass" || len(m["classes"].([]any)) != 2 {
		t.Fatalf("got %v", m)
	}
	_ = c.WriteJSON(map[string]any{"type": "pick", "class": "nope"})
	if m := receive(t, c); m["type"] != "error" {
		t.Fatalf("got %v", m)
	}

	// A heartbeat while choosing is fine. Then it enters with the class it chose.
	c, _, err = dial(t, srv.URL, tok)
	if err != nil {
		t.Fatal(err)
	}
	defer c.Close()
	receive(t, c)
	_ = c.WriteJSON(map[string]any{"type": "heartbeat"})
	_ = c.WriteJSON(map[string]any{"type": "pick", "class": "fire0001"})
	if m := receive(t, c); m["type"] != "welcome" || m["you"].(map[string]any)["class"] != "fire0001" {
		t.Fatalf("got %v", m)
	}

	// Next time it isn't asked.
	c2, _, err := dial(t, srv.URL, tok)
	if err != nil {
		t.Fatal(err)
	}
	defer c2.Close()
	if m := receive(t, c2); m["type"] != "welcome" {
		t.Fatalf("got %v", m)
	}
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
	at := receive(t, b)["you"].(map[string]any)["at"]
	receive(t, b)
	if m := receive(t, a); m["type"] != "appear" {
		t.Fatalf("a got %v", m)
	}
	// Turning where it stands.
	_ = b.WriteJSON(map[string]any{"type": "heartbeat", "at": at, "yaw": 2})
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
