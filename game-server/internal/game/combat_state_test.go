package game

import (
	"context"
	"encoding/json"
	"iter"
	"testing"
	"time"

	"github.com/delve-mmo/delve3d/game-server/internal/combat"
)

// fakeState is a world copy's state with no layer: one player, one dummy, open ground, and a record
// of what it was told.
type fakeState struct {
	cm     *Combat
	me     *unit
	target *dummy
	told   []string
	hits   []hit
	at     time.Time
}

func (s *fakeState) unit(id int64, continent string) *unit {
	for u := range s.units() {
		if u.ID == id && (continent == "" || u.char.Continent == continent) {
			return u
		}
	}
	return nil
}

func (s *fakeState) units() iter.Seq[*unit] {
	return func(yield func(*unit) bool) {
		_ = yield(&s.target.unit) && yield(s.me)
	}
}

func (s *fakeState) playerUnits() iter.Seq[*unit] {
	return func(yield func(*unit) bool) { yield(s.me) }
}

func (s *fakeState) dummyList() []*dummy { return []*dummy{s.target} }

func (s *fakeState) dummy(id int64, continent string) *dummy {
	if u := s.unit(id, continent); u != nil {
		return u.dummy
	}
	return nil
}

func (s *fakeState) caster(id int64) *unit {
	if id == s.me.ID {
		return s.me
	}
	return nil
}

func (s *fakeState) present(u *unit) bool         { return u == s.me }
func (s *fakeState) playerUnit(u *unit) *unit     { return map[bool]*unit{true: u}[s.present(u)] }
func (s *fakeState) ground(string) Ground         { return nil }
func (s *fakeState) setHealth(u *unit, n float64) { u.Health = min(max(n, 0), u.MaxHealth) }
func (s *fakeState) resizeHealth(u *unit, n, most float64) {
	u.MaxHealth = most
	s.setHealth(u, n)
}
func (s *fakeState) addStatus(on *unit, key statusKey, held *activeStatus, _ time.Time) {
	on.Statuses[key] = held
}
func (s *fakeState) removeStatus(on *unit, key statusKey) *activeStatus {
	held := on.Statuses[key]
	delete(on.Statuses, key)
	if held != nil {
		s.cm.endEffectZones(held)
	}
	return held
}
func (s *fakeState) relocate(u *unit, continent string, at [3]float64, _, _ []byte) {
	u.char.Continent, u.char.At = continent, at
}
func (s *fakeState) showHit(_ int64, _ *unit, h hit) { s.hits = append(s.hits, h) }
func (s *fakeState) tellOf(_ int64, b []byte) {
	var m struct{ Type string }
	_ = json.Unmarshal(b, &m)
	s.told = append(s.told, m.Type)
}
func (s *fakeState) tellContinent(_ string, b []byte) { s.tellOf(0, b) }
func (s *fakeState) acted(*unit, string)              {}
func (s *fakeState) sendHome(*unit)                   {}
func (s *fakeState) motionOf(u *unit) *motion {
	if u.player == nil {
		return nil
	}
	return &u.player.motion
}

// fakeCombat is combat on a fake state: a Frost player at the spawn point, facing a dummy 20 ft away.
func fakeCombat(t *testing.T) (*Combat, *fakeState, *Player) {
	t.Helper()
	w, _ := fightWorld{}.Load(context.Background(), "them/vale", "s")
	p := &Player{Send: make(chan []byte, 64), Gone: make(chan struct{})}
	p.state = Character{ID: 1, Continent: "main", At: [3]float64{100, 0, 100}, Move: Move{Gait: "run"}}
	p.enterFight(w.Classes[0], 1, combat.Build{})
	d := &dummy{unit: unit{ID: -1, base: combat.Plain(dummyHealth), MaxHealth: dummyHealth, Health: dummyHealth, Statuses: map[statusKey]*activeStatus{}}}
	d.state = Character{ID: -1, Continent: "main", At: [3]float64{100, 0, 120}, Dummy: true}
	d.char, d.dummy = &d.state, d
	s := &fakeState{me: &p.fight.unit, target: d}
	s.at = time.Unix(1000, 0)
	cm := &Combat{state: s, now: func() time.Time { return s.at }, roll: func() float64 { return 0.5 }}
	s.cm = cm
	return cm, s, p
}

func TestCombatRunsOnAnyState(t *testing.T) {
	cm, s, p := fakeCombat(t)
	cm.use(s.me, incoming{Ability: "zap", Target: -1})
	cm.tick(cm.now())
	if len(s.hits) != 1 || s.hits[0].On != -1 || s.hits[0].Amount != 10 {
		t.Fatalf("hits = %+v after a zap", s.hits)
	}
	if len(s.told) == 0 || s.told[0] != "used" {
		t.Fatalf("told = %v", s.told)
	}

	// Out of range, it says why to the player alone.
	s.target.state.At[2] = 200
	s.at = s.at.Add(2 * time.Second)
	cm.use(s.me, incoming{Ability: "jab", Target: -1})
	var m map[string]any
	for m["type"] != "refused" && len(p.Send) > 0 {
		m = nil
		_ = json.Unmarshal(<-p.Send, &m)
	}
	if m["type"] != "refused" || m["why"] != "out of range" {
		t.Fatalf("refusal = %v", m)
	}

	// A heal with no ally targeted goes on the player.
	s.target.state.At[2] = 120
	cm.use(s.me, incoming{Ability: "mend", Target: -1})
	cm.tick(cm.now())
	if h := s.hits[len(s.hits)-1]; h.Effect != "heal" || h.On != 1 || h.Amount != 9 {
		t.Fatalf("mending with a dummy targeted: %+v", h)
	}
}
