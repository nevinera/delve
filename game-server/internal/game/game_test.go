package game

import (
	"context"
	"encoding/json"
	"fmt"
	"testing"
	"time"

	"github.com/delve-mmo/delve3d/game-server/internal/rails"
	"github.com/delve-mmo/delve3d/game-server/internal/token"
	"github.com/delve-mmo/delve3d/game-server/internal/worlds"
)

type fakeWorlds struct{ loads int }

func (f *fakeWorlds) Load(_ context.Context, repo, sha string) (*worlds.World, error) {
	f.loads++
	return &worlds.World{Repo: repo, Sha: sha, Continents: []string{"main"}, Spawn: worlds.Spawn{Continent: "main", At: [2]float64{10.5, 10.5}}}, nil
}

type fakeCharacters map[int64]*rails.Position

func (f fakeCharacters) Character(_ context.Context, _, id int64) (rails.Character, error) {
	return rails.Character{ID: id, Name: fmt.Sprintf("C%d", id), Look: json.RawMessage(`{"skin":1}`), Position: f[id]}, nil
}

func enter(t *testing.T, h *Hub, id int64) *Player {
	t.Helper()
	p, err := h.Enter(context.Background(), token.Claims{Character: id, World: 1, Repo: "them/vale", Sha: "s"})
	if err != nil {
		t.Fatal(err)
	}
	return p
}

// next is the player's next message, as a map.
func next(t *testing.T, p *Player) map[string]any {
	t.Helper()
	select {
	case b := <-p.Send:
		var m map[string]any
		if err := json.Unmarshal(b, &m); err != nil {
			t.Fatal(err)
		}
		return m
	case <-time.After(time.Second):
		t.Fatal("no message")
		return nil
	}
}

func quiet(t *testing.T, p *Player) {
	t.Helper()
	select {
	case b := <-p.Send:
		t.Fatalf("unexpected message %s", b)
	default:
	}
}

func move(t *testing.T, p *Player, x, z float64) {
	t.Helper()
	if err := p.Handle([]byte(fmt.Sprintf(`{"type":"move","at":[%v,0,%v],"yaw":1,"move":{"forward":1,"gait":"walk","jump":true}}`, x, z))); err != nil {
		t.Fatal(err)
	}
}

func TestEnterAtTheSpawnPointOrWhereItWas(t *testing.T) {
	h := NewHub(&fakeWorlds{}, fakeCharacters{2: {Continent: "main", At: [3]float64{1, 2, 3}, Yaw: 0.5}})
	a := enter(t, h, 1)
	w := next(t, a)
	if w["type"] != "welcome" || w["layer"] != 1.0 {
		t.Fatalf("welcome = %v", w)
	}
	you := w["you"].(map[string]any)
	if fmt.Sprint(you["at"]) != "[5376 0 5376]" || you["continent"] != "main" || you["name"] != "C1" {
		t.Errorf("you = %v", you)
	}
	if s := next(t, a); s["type"] != "snapshot" || len(s["characters"].([]any)) != 0 {
		t.Errorf("snapshot = %v", s)
	}

	b := enter(t, h, 2)
	if you := next(t, b)["you"].(map[string]any); fmt.Sprint(you["at"]) != "[1 2 3]" {
		t.Errorf("b at = %v", you["at"])
	}
	next(t, b)
}

func TestNearbyCharactersSeeEachOther(t *testing.T) {
	h := NewHub(&fakeWorlds{}, fakeCharacters{})
	a := enter(t, h, 1)
	next(t, a)
	next(t, a)
	b := enter(t, h, 2)
	next(t, b)
	if s := next(t, b); len(s["characters"].([]any)) != 1 {
		t.Fatalf("b's snapshot = %v", s)
	}
	if m := next(t, a); m["type"] != "appear" || m["character"].(map[string]any)["id"] != 2.0 {
		t.Fatalf("a got %v", m)
	}

	// b moves within the area: a sees it, b hears nothing back.
	move(t, b, 5400, 5400)
	m := next(t, a)
	if m["type"] != "moved" || m["id"] != 2.0 || m["move"].(map[string]any)["gait"] != "walk" || m["move"].(map[string]any)["jump"] != true {
		t.Fatalf("a got %v", m)
	}
	quiet(t, b)

	// b runs off two tiles: they vanish from each other.
	move(t, b, 5376+3*512, 5376)
	if m := next(t, a); m["type"] != "vanish" || m["id"] != 2.0 {
		t.Fatalf("a got %v", m)
	}
	if m := next(t, b); m["type"] != "vanish" || m["id"] != 1.0 {
		t.Fatalf("b got %v", m)
	}
	// and back: they appear to each other.
	move(t, b, 5376, 5376)
	if m := next(t, a); m["type"] != "appear" {
		t.Fatalf("a got %v", m)
	}
	if m := next(t, b); m["type"] != "appear" || m["character"].(map[string]any)["id"] != 1.0 {
		t.Fatalf("b got %v", m)
	}

	h.Leave(b)
	if m := next(t, a); m["type"] != "vanish" || m["id"] != 2.0 {
		t.Fatalf("a got %v", m)
	}
}

func TestEnteringAgainDropsTheOldConnection(t *testing.T) {
	h := NewHub(&fakeWorlds{}, fakeCharacters{})
	old := enter(t, h, 1)
	again := enter(t, h, 1)
	select {
	case <-old.Gone:
	default:
		t.Fatal("old connection wasn't dropped")
	}
	h.Leave(old)
	if h.playing[1] != again || again.layer.players[1] != again {
		t.Error("leaving the old connection took out the new one")
	}
}

func TestBadMessages(t *testing.T) {
	h := NewHub(&fakeWorlds{}, fakeCharacters{})
	p := enter(t, h, 1)
	for _, raw := range []string{`nope`, `{"type":"fly"}`, `{"type":"move","at":[1,2,3],"yaw":"x"}`} {
		if p.Handle([]byte(raw)) == nil {
			t.Errorf("Handle(%s) took it", raw)
		}
	}
}

func TestLayersUnloadWhenEmpty(t *testing.T) {
	loads := &fakeWorlds{}
	h := NewHub(loads, fakeCharacters{})
	h.idle = 10 * time.Millisecond
	h.Leave(enter(t, h, 1))
	time.Sleep(50 * time.Millisecond)
	if h.Layers() != 0 {
		t.Fatal("layer didn't unload")
	}
	enter(t, h, 1)
	if loads.loads != 2 {
		t.Errorf("loads = %d, want 2", loads.loads)
	}
}

func TestCleanMove(t *testing.T) {
	got := Move{Forward: 5, Strafe: -3, Turn: 1, Gait: "fly"}.clean()
	if got != (Move{Forward: 1, Strafe: -1, Turn: 1, Gait: "run"}) {
		t.Errorf("clean = %+v", got)
	}
}
