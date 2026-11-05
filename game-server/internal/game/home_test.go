package game

import (
	"context"
	"testing"
	"time"

	"github.com/delve-mmo/delve3d/game-server/internal/worlds"
)

func makeHome(t *testing.T, p *Player, id string) {
	t.Helper()
	if err := p.Handle([]byte(`{"type":"makeHome","rest":"` + id + `"}`)); err != nil {
		t.Fatal(err)
	}
}

// waitForHome waits for the background save of a character's home.
func waitForHome(t *testing.T, people *fakeCharacters, id int64, want string) {
	t.Helper()
	deadline := time.Now().Add(time.Second)
	for {
		people.mu.Lock()
		got := people.home[id]
		people.mu.Unlock()
		if got == want {
			return
		}
		if time.Now().After(deadline) {
			t.Fatalf("home saved = %q, want %q", got, want)
		}
		time.Sleep(time.Millisecond)
	}
}

func TestEnteringSaysTheRestPointsOnYourContinent(t *testing.T) {
	people := characters(nil)
	people.home[1] = "inn"
	h := NewHub(fightWorld{}, people)
	p := enter(t, h, 1)
	got := heard(p, "restPoints")
	if len(got) != 1 || got[0]["home"] != "inn" {
		t.Fatalf("restPoints = %v", got)
	}
	points := got[0]["restPoints"].([]any)
	if len(points) != 1 || points[0].(map[string]any)["id"] != "inn" || points[0].(map[string]any)["name"] != "The Inn" {
		t.Fatalf("points = %v", points)
	}
}

func TestMakingARestPointYourHome(t *testing.T) {
	people := characters(nil)
	h := NewHub(fightWorld{}, people)
	clockOf(h)
	p := enter(t, h, 1)
	heard(p)
	makeHome(t, p, "inn")
	if got := lastLog(t, p); got != "system: You need to be at the rest point to make it your home." || p.home != "" {
		t.Fatalf("from afar: %q, home %q", got, p.home)
	}
	makeHome(t, p, "camp")
	if got := lastLog(t, p); got != "system: There's no rest point there." {
		t.Fatalf("another continent's: %q", got)
	}
	move(t, p, 290, 295)
	heard(p)
	makeHome(t, p, "inn")
	got := heard(p, "home", "log")
	if len(got) != 2 || got[0]["home"] != "inn" || got[1]["text"] != "The Inn is now your home." {
		t.Fatalf("made home: %v", got)
	}
	waitForHome(t, people, 1, "inn")
}

func TestHomewardTakesYouHomeAfterItsCast(t *testing.T) {
	people := characters(nil)
	people.class[1] = "frst0001"
	h := NewHub(homewardWorld{}, people)
	c := clockOf(h)
	p := enter(t, h, 1)
	h.Tick()
	heard(p)
	use(t, p, "homeward")
	pass(h, c, 9)
	if p.state.At[0] != 100 {
		t.Fatalf("went before the cast ended: %v", p.state.At)
	}
	pass(h, c, 1.2)
	if p.state.At != [3]float64{100, 0, 100} {
		t.Fatalf("with no home, at %v, want the spawn point", p.state.At)
	}
	p.home = "camp"
	pass(h, c, 2)
	use(t, p, "homeward")
	pass(h, c, 10.2)
	if p.state.Continent != "far" || p.state.At != [3]float64{50, 0, 60} {
		t.Fatalf("at %s %v, want the camp", p.state.Continent, p.state.At)
	}
	if got := lastLog(t, p); got != "system: You're back at the rest point." {
		t.Fatal(got)
	}
}

func TestTeleportHome(t *testing.T) {
	_, p, _ := commanding(t, true)
	say(t, p, "/teleport home")
	if p.state.At != [3]float64{100, 0, 100} {
		t.Fatalf("with no home = %v", p.state.At)
	}
	p.home = "inn"
	say(t, p, "/teleport home")
	if p.state.At != [3]float64{300, 0, 300} {
		t.Fatalf("home = %v", p.state.At)
	}
}

// homewardWorld is fightWorld with Homeward added to its classes, as reading a world does.
type homewardWorld struct{ fightWorld }

func (h homewardWorld) Load(ctx context.Context, repo, sha string) (*worlds.World, error) {
	w, err := h.fightWorld.Load(ctx, repo, sha)
	for _, c := range w.Classes {
		c.WithHomeward()
	}
	return w, err
}
